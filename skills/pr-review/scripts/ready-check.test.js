const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkReady, checkStatusChecks, main } = require('./ready-check');

const REPO = 'example/app';
const HEAD = 'c'.repeat(40);
const body = (grade = 'A级') => `## Summary\n- 更新\n\n## Context\nSource: discussion\n分级：${grade}\n- 本轮在持续讨论中形成了本次修改。\n\n## Merge Danger\n- 门：双向门\n- 影响面：文档\n\n## Verification\n- npm test：通过\n`;
const pass = { body: `评论者：demo-model\n[REVIEW][PASS]\n结论：通过\n任务分级：A级\n审查版本：${HEAD}\n`, author: { login: 'bot' } };
const ready = {
  body: body(), isDraft: false, headRefOid: HEAD, mergeable: 'MERGEABLE', comments: [pass],
  statusCheckRollup: [{ name: 'test', conclusion: 'SUCCESS' }, { context: 'lint', state: 'SUCCESS' }, { name: 'opt', conclusion: 'SKIPPED' }],
};
const run = (metadata, options = {}) => checkReady({ ...ready, ...metadata }, { repository: REPO, isAncestor: () => false, ...options });

test('正文、凭据、检查、可合并都满足时通过', () => {
  assert.deepEqual(run({}), []);
  assert.deepEqual(run({ body: body('B级'), comments: [] }), []);
});

test('按正文 → 凭据 → 检查 → mergeable → Draft 的顺序报错', () => {
  const errors = run({
    body: body().replace('- npm test：通过', '- 通过'), comments: [], isDraft: true, mergeable: 'CONFLICTING',
    statusCheckRollup: [{ name: 'test', status: 'IN_PROGRESS', conclusion: '' }],
  });
  assert.match(errors[0], /Verification 不能只写/);
  assert.match(errors.find((error) => /独立通过凭据/.test(error)), /A级 PR/);
  assert.equal(errors.at(-3), 'CI check test 状态为 IN_PROGRESS。');
  assert.match(errors.at(-2), /mergeable=CONFLICTING/);
  assert.match(errors.at(-1), /不接受草稿/);
});

test('缺分级或分级无法识别时失败，不跳过复核检查', () => {
  for (const text of [body().replace('分级：A级\n', ''), body('C级')]) {
    const errors = run({ body: text, comments: [] });
    assert(errors.includes('无法从 PR 正文 ## Context 确定分级（B级 / A级 / S级），不能判定独立复核要求。'), errors.join('\n'));
  }
});

test('--allow-draft 只放行 A/S 草稿；B级草稿仍拒绝', () => {
  assert.deepEqual(run({ isDraft: true }, { allowDraft: true }), []);
  const bDraft = run({ body: body('B级'), isDraft: true }, { allowDraft: true });
  assert.deepEqual(bDraft, ['B级不得使用 Review Draft；完成自查后直接创建 Ready PR。', '正式 Ready 检查不接受草稿；A/S 转换前预检须显式使用 --allow-draft。']);
});

test('身份前缀与祖先版本按注入值判断', () => {
  assert.match(run({}, { identityPrefix: 'other' }).join('\n'), /身份首行/);
  const older = { ...pass, body: pass.body.replace(HEAD, 'd'.repeat(40)) };
  assert.match(run({ comments: [older] }).join('\n'), /版本不适用于/);
  assert.deepEqual(run({ comments: [older] }, { isAncestor: () => true }), []);
});

test('statusCheckRollup 为空视为没有外部检查', () => {
  assert.deepEqual(checkStatusChecks([]), []);
  assert.deepEqual(checkStatusChecks(undefined), []);
});

test('CLI 读取 live PR 并设置退出码', () => {
  const calls = [];
  const gh = (args) => { calls.push(args); return { status: 0, stdout: JSON.stringify(ready), stderr: '' }; };
  const log = console.log; const error = console.error;
  const out = [];
  console.log = (line) => out.push(line); console.error = (line) => out.push(line);
  try {
    main(['--pr', '7'], { gh, config: { repository: REPO }, isAncestor: () => false });
    assert.equal(process.exitCode, undefined);
    main(['--pr', '7', '--repo', 'x/y'], { gh: () => ({ status: 0, stdout: JSON.stringify({ ...ready, mergeable: 'UNKNOWN' }) }), config: {} });
    assert.equal(process.exitCode, 1);
  } finally {
    console.log = log; console.error = error; process.exitCode = undefined;
  }
  assert.deepEqual(calls, [['pr', 'view', '7', '--repo', REPO, '--json', 'body,isDraft,headRefOid,mergeable,statusCheckRollup,comments']]);
  assert.deepEqual(out.slice(0, 1), ['ready 检查通过。']);
  assert.match(out[1], /mergeable=UNKNOWN/);
});

test('装了 project-control 时校验 task-card 来源的任务卡，没装时只看正文', () => {
  const taskUrl = `https://github.com/${REPO}/issues/45#issuecomment-678`;
  const card = (overrides = {}) => ({
    id: 678, html_url: taskUrl, issue_url: `https://api.github.com/repos/${REPO}/issues/45`,
    updated_at: '2026-11-01T00:00:00Z', pin: { pinned_at: '2026-11-01T00:00:00Z' },
    body: '评论者：demo-model\n[TASK-CARD]\n- Task: APP-UI-7\n- Grade: A级\n\n## 完成条件\n- 做完\n\n## 范围\n- a\n\n## 不做\n- b\n\n## 正式依据\n- c\n\n## 验证\n- npm test\n\n## 前置 / 阻断\n- 无\n',
    ...overrides,
  });
  const taskBody = (grade = 'A级') => body(grade).replace(
    /Source: discussion\n分级：.+\n- 本轮在持续讨论中形成了本次修改。\n/, `- Source: task-card\n- Task: ${taskUrl}\n- 分级：${grade}\n`);
  const gh = (comment, issue = { state: 'open', labels: [{ name: 'status:tasked' }] }, grade = 'A级') => (args) => ({
    status: 0, stderr: '',
    stdout: JSON.stringify(args[0] === 'pr' ? { ...ready, body: taskBody(grade) }
      : args[1].endsWith('/comments/678') ? comment : args[1].endsWith('/comments?per_page=100') ? [[comment]] : issue),
  });
  const cli = (ghStub, options = {}) => {
    const out = []; const log = console.log; const error = console.error;
    console.log = (line) => out.push(line); console.error = (line) => out.push(line);
    try {
      main(['--pr', '7'], { gh: ghStub, config: { repository: REPO }, isAncestor: () => false, ...options });
      return { code: process.exitCode, out: out.join('\n') };
    } finally {
      console.log = log; console.error = error; process.exitCode = undefined;
    }
  };
  assert.equal(cli(gh(card())).code, undefined);
  for (const [comment, issue, grade, error] of [
    [card({ pin: null }), undefined, 'A级', /置顶/],
    [card(), { state: 'closed', labels: [{ name: 'status:tasked' }] }, 'A级', /Open/],
    [card(), undefined, 'S级', /Grade 不一致/],
  ]) {
    const result = cli(gh(comment, issue, grade));
    assert.equal(result.code, 1);
    assert.match(result.out, error);
  }
  const unchecked = cli(gh(card({ pin: null })), { taskCardCheck: '/nonexistent/task-card-check.js' });
  assert.equal(unchecked.code, undefined, unchecked.out);
});
