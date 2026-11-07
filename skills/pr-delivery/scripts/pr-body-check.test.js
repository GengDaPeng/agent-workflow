const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  checkPrBody, checkPrContext, isTaskCommentUrl, parsePrContext, parseTaskCommentUrl,
} = require('./pr-body-check');
const { installedProjectRoot, loadProjectConfig, resolveRepository, splitCommand } = require('./project-config');

const REPO = 'example/app';
const TASK_URL = `https://github.com/${REPO}/issues/45#issuecomment-678`;

const body = ({ context = `- Source: task-card\n- Task: ${TASK_URL}\n- 分级：A级`, verification = '- npm test：通过', extra = '' } = {}) => `## Summary
- 更新说明

## Context
${context}

## Merge Danger
- 门：双向门
- 影响面：文档

## Verification
${verification}
${extra}`;

function check(text, options = {}) {
  const context = checkPrContext({ body: text, repository: REPO });
  return checkPrBody({ body: text, currentContext: context.context, repository: REPO, ...options }).errors;
}

test('合格的 task-card 与 discussion 正文通过', () => {
  assert.deepEqual(check(body()), []);
  assert.deepEqual(check(body({ context: 'Source: discussion\n分级：S级\n- 本轮在持续讨论中形成了本次修改。' })), []);
});

test('任务评论 URL 只接受本仓库 Issue 评论深链接', () => {
  assert.deepEqual(parseTaskCommentUrl(TASK_URL), { repository: REPO, issueNumber: '45', commentId: '678', url: TASK_URL });
  assert.equal(isTaskCommentUrl(TASK_URL, REPO), true);
  assert.equal(isTaskCommentUrl(TASK_URL, 'other/repo'), false);
  assert.equal(isTaskCommentUrl(TASK_URL), false);
  assert.equal(parseTaskCommentUrl(`${TASK_URL}?x=1`), null);
  assert.match(parsePrContext(body(), { repository: 'other/repo' }).errors[0], /本仓库 GitHub Issue 评论 URL/);
});

test('必需段落、Merge Danger、Verification 与 TODO 按固定顺序报错', () => {
  const broken = body({ verification: '- 通过\n- Not run: 无', extra: 'TODO_VERIFICATION' })
    .replace('- 门：双向门', '- 门：单向门 / 双向门').replace('## Summary\n- 更新说明\n', '## Summary\n-\n');
  assert.deepEqual(check(broken), [
    'PR 描述 ## Summary 段落不能为空。',
    '## Merge Danger 的“门”必须二选一：单向门 或 双向门。',
    '## Verification 中的 Not run: 必须写明具体原因。',
    'PR 描述仍含 TODO_VERIFICATION 占位；任务卡缺验证口径，交付前必须补真实验证命令或具体 Not run 原因并删除占位。',
  ]);
  assert.deepEqual(check(body({ verification: '- 已验证' })), [
    '## Verification 不能只写“已验证 / 测试通过 / pass”等空泛结论，必须包含命令、测试名、人工检查步骤或 Not run 原因。',
    'A级 / S级交付至少要有一项实际验证命令、测试或人工步骤及结果，不能全部用 Not run 替代。',
  ]);
});

test('B级不得 Draft，A级可以；缺少已校验 Context artifact 时报错', () => {
  const bBody = body({ context: `- Source: task-card\n- Task: ${TASK_URL}\n- 分级：B级` });
  assert.deepEqual(check(bBody, { draft: true }), ['B级不得使用 Review Draft；完成自查后直接创建 Ready PR。']);
  assert.deepEqual(check(body(), { draft: true }), []);
  assert.deepEqual(checkPrBody({ body: body(), repository: REPO }).errors, ['缺少已校验的 PR Context artifact。']);
});

test('注入的任务卡检查决定最终 Context，并核对分级', () => {
  const calls = [];
  const checkTaskCard = (input) => { calls.push(input); return { errors: [], card: { version: 1, taskUrl: TASK_URL, grade: 'S级' } }; };
  const result = checkPrContext({ body: body(), repository: REPO, checkTaskCard });
  assert.deepEqual(result.errors, ['PR Context 分级与置顶任务评论 artifact Grade 不一致。']);
  assert.deepEqual(calls, [{ taskUrl: TASK_URL, repository: REPO }]);
});

test('project.json：缺失用默认值，字段错误写明字段，安装布局定位仓库根', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-config-'));
  try {
    assert.deepEqual(loadProjectConfig(root), { gitWrapper: 'git' });
    fs.mkdirSync(path.join(root, '.agents'));
    const write = (value) => fs.writeFileSync(path.join(root, '.agents/project.json'), JSON.stringify(value));
    write({ repository: REPO, commentIdentityPrefix: 'app', readyCheck: 'make ready PR={pr}' });
    assert.equal(loadProjectConfig(root).readyCheck, 'make ready PR={pr}');
    assert.equal(loadProjectConfig(root).gitWrapper, 'git');
    for (const [value, field] of [
      [{ repository: 'no-slash' }, 'repository'], [{ taskIdPattern: '(' }, 'taskIdPattern'],
      [{ readyCheck: 'make ready' }, 'readyCheck'], [{ gitWrapper: '' }, 'gitWrapper'],
      [{ commentIdentityPrefix: 'a-b' }, 'commentIdentityPrefix'],
    ]) {
      write(value);
      assert.throws(() => loadProjectConfig(root), new RegExp(`字段 ${field} 格式错误`));
    }
    fs.writeFileSync(path.join(root, '.agents/project.json'), '{');
    assert.throws(() => loadProjectConfig(root), /不是合法 JSON/);
    assert.equal(installedProjectRoot(path.join(root, '.agents/skills/x/scripts')), root);
    assert.equal(installedProjectRoot(path.join(root, 'skills/x/scripts')), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.deepEqual(splitCommand(' bash tools/git-wrapper.sh '), ['bash', 'tools/git-wrapper.sh']);
  assert.equal(resolveRepository('', { repository: REPO }, () => { throw new Error('不应调用 gh'); }), REPO);
  assert.equal(resolveRepository('', {}, () => ({ status: 0, stdout: 'from/gh\n' })), 'from/gh');
  assert.throws(() => resolveRepository('', {}, () => ({ status: 1, stdout: '' })), /repository/);
});

test('CLI 读取正文文件并返回退出码', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-body-cli-'));
  try {
    const file = path.join(dir, 'body.md');
    const script = path.join(__dirname, 'pr-body-check.js');
    fs.writeFileSync(file, body());
    const ok = spawnSync(process.execPath, [script, '--body', file, '--repo', REPO], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    fs.writeFileSync(file, body({ context: `- Source: task-card\n- Task: ${TASK_URL}\n- 分级：B级` }));
    const draft = spawnSync(process.execPath, [script, '--body', file, '--repo', REPO, '--draft'], { encoding: 'utf8' });
    assert.equal(draft.status, 1);
    assert.match(draft.stderr, /B级不得使用 Review Draft/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
