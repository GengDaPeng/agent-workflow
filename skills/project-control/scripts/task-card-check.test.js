const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_TASK_ID_PATTERN, checkCurrentTaskCard, checkTaskCardVersion, isExecutionTaskId, isTaskCommentUrl,
  parseProjectConfig, runTaskCardCheckCli,
} = require('./task-card-check');

const REPO = 'example/app';
const ISSUE = '45';
const url = (id, repo = REPO) => `https://github.com/${repo}/issues/${ISSUE}#issuecomment-${id}`;

function comment(id, { task = 'APP-UI-7', grade = 'A级', pin = true } = {}) {
  return {
    id: Number(id),
    html_url: url(id),
    issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}`,
    updated_at: '2026-11-01T00:00:00Z',
    pin: pin ? { pinned_at: '2026-11-01T00:00:00Z' } : null,
    body: `评论者：demo-model\n[TASK-CARD]\n- Task: ${task}\n- Grade: ${grade}\n\n## 完成条件\n- 做完\n\n## 范围\n- a\n\n## 不做\n- b\n\n## 正式依据\n- c\n\n## 验证\n- npm test\n\n## 前置 / 阻断\n- 无\n`,
  };
}

const issue = (state = 'open', labels = ['status:tasked']) => ({ state, labels: labels.map((name) => ({ name })) });

function gh(target, { issueState, calls = [] } = {}) {
  return (args) => {
    calls.push(args);
    if (args[0] === 'repo') return { status: 0, stdout: `${REPO}\n`, stderr: '' };
    const payload = args[1].endsWith(`/comments/${target.id}`) ? target
      : args[1].endsWith('/comments?per_page=100') ? [[target]] : issueState || issue();
    return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
  };
}

test('合格的置顶任务卡生成 artifact', () => {
  const target = comment('101');
  const result = checkCurrentTaskCard({ taskUrl: target.html_url, repository: REPO, ghRunner: gh(target) });
  assert.deepEqual(result.errors, []);
  assert.equal(result.card.task, 'APP-UI-7');
  assert.equal(result.card.grade, 'A级');
  assert.deepEqual(checkTaskCardVersion({ card: result.card, ghRunner: gh(target) }), []);
});

test('任务编号正则可配置，默认值是通用形态', () => {
  assert.equal(isExecutionTaskId('APP-UI-7'), true);
  assert.equal(isExecutionTaskId('task-7'), false);
  assert.equal(isExecutionTaskId('task-7', '^task-\\d+$'), true);
  assert.equal(new RegExp(DEFAULT_TASK_ID_PATTERN).test('S-GOV-76'), true);
  const target = comment('102', { task: 'task-7' });
  const rejected = checkCurrentTaskCard({ taskUrl: target.html_url, repository: REPO, ghRunner: gh(target) });
  assert.match(rejected.errors.join('\n'), /合法执行任务 ID/);
  const accepted = checkCurrentTaskCard({ taskUrl: target.html_url, repository: REPO, taskIdPattern: '^task-\\d+$', ghRunner: gh(target) });
  assert.deepEqual(accepted.errors, []);
});

test('跨仓 URL、未置顶、Issue 关闭和状态标签错误都拒绝', () => {
  const calls = [];
  const cross = checkCurrentTaskCard({ taskUrl: url('101', 'other/repo'), repository: REPO, ghRunner: gh(comment('101'), { calls }) });
  assert.match(cross.errors[0], /本仓库 example\/app/);
  assert.deepEqual(calls, []);
  assert.equal(isTaskCommentUrl(url('101'), REPO), true);
  assert.equal(isTaskCommentUrl(url('101')), false);
  for (const [target, issueState] of [
    [comment('103', { pin: false }), issue()], [comment('104'), issue('closed')], [comment('105'), issue('open', ['status:waiting'])],
  ]) {
    const result = checkCurrentTaskCard({ taskUrl: target.html_url, repository: REPO, ghRunner: gh(target, { issueState }) });
    assert.equal(result.card, null);
    assert(result.errors.length > 0);
  }
});

test('CLI 仓库按 --repo → project.json → gh repo view 解析', () => {
  const target = comment('106');
  const viaGh = [];
  assert.equal(runTaskCardCheckCli(['--task-url', target.html_url], { ghRunner: gh(target, { calls: viaGh }), config: {} }).status, 0);
  assert.deepEqual(viaGh[0], ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  const viaConfig = [];
  assert.equal(runTaskCardCheckCli(['--task-url', target.html_url], { ghRunner: gh(target, { calls: viaConfig }), config: { repository: REPO } }).status, 0);
  assert(viaConfig.every((args) => args[0] !== 'repo'));
  const wrongRepo = runTaskCardCheckCli(['--task-url', target.html_url, '--repo', 'other/repo'], { ghRunner: gh(target), config: {} });
  assert.equal(wrongRepo.status, 1);
  assert.match(wrongRepo.stderr, /本仓库 other\/repo/);
  assert.match(runTaskCardCheckCli([], { config: {} }).stderr, /缺少 --task-url/);
});

test('project.json 字段错误写明字段', () => {
  assert.deepEqual(parseProjectConfig('{"repository":"a/b","taskIdPattern":"^x$"}'), { repository: 'a/b', taskIdPattern: '^x$' });
  assert.throws(() => parseProjectConfig('{"repository":"ab"}'), /字段 repository 格式错误/);
  assert.throws(() => parseProjectConfig('{"taskIdPattern":"("}'), /字段 taskIdPattern 格式错误/);
  assert.throws(() => parseProjectConfig('[]'), /顶层必须是对象/);
  assert.throws(() => parseProjectConfig('{'), /不是合法 JSON/);
});
