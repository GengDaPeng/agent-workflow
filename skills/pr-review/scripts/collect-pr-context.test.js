#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  actionRunId,
  buildDecisionSummary,
  collectionPlan,
  compareSnapshots,
  evidenceGaps,
  failedChecks,
  hasIncompleteThreadPages,
  metadataDriftFields,
  previousSnapshotGaps,
  reviewStateFingerprint,
  readyCheckArgs,
  contextSnapshotDriftFields,
} = require('./collect-pr-context');

assert.deepEqual(buildDecisionSummary({
  mode: 'review',
  pr: 7,
  outDir: '/tmp/pr-7',
  metadata: { headRefOid: 'a'.repeat(40) },
  context: { contract: 'task-comment-url', grade: 'S级' },
  gaps: [],
}), {
  pr: 7,
  mode: 'review',
  head: 'a'.repeat(40),
  context: 'task-comment-url',
  grade: 'S级',
  gaps: [],
  manifest: '/tmp/pr-7/manifest.json',
});

assert.deepEqual(collectionPlan('diagnose'), ['metadata']);
assert.deepEqual(collectionPlan('diagnose', 'ci'), ['metadata', 'ci']);
assert.deepEqual(collectionPlan('diagnose', 'comments'), ['metadata', 'state']);
assert.deepEqual(collectionPlan('diagnose', 'context'), ['metadata', 'context']);
assert.deepEqual(collectionPlan('diagnose', 'scope'), ['metadata', 'diff']);
assert.deepEqual(collectionPlan('review'), ['metadata', 'worktree', 'context', 'diff', 'state']);
assert.deepEqual(collectionPlan('handoff'), ['metadata', 'context', 'state']);
assert.deepEqual(collectionPlan('publish'), ['metadata', 'context', 'state']);

const retiredFocus = spawnSync(process.execPath, [
  __filename.replace(/\.test\.js$/, '.js'),
  '--repo', 'owner/repo', '--pr', '7', '--mode', 'diagnose', '--focus', 'task',
], { encoding: 'utf8' });
assert.equal(retiredFocus.status, 1);
assert.match(retiredFocus.stderr, /--focus 必须是 ci、comments、context、scope 或 ready/);

assert.deepEqual(evidenceGaps({
  metadata: { changedFiles: 2 },
  changedFiles: ['a.js'],
  taskCard: { commentId: '7', updatedAt: '2026-08-18T00:00:00Z' },
  taskComment: { id: 7, updated_at: '2026-08-18T00:00:01Z' },
  reviewThreadPages: [{ data: { repository: { pullRequest: { reviewThreads: {
    nodes: [{ comments: { pageInfo: { hasNextPage: true } } }],
  } } } } }],
}), [
  '分页文件数 1 与 metadata.changedFiles 2 不一致。',
  '任务卡 artifact 与评论正文不是同一版本。',
  '至少一个 review thread 的评论仍有未收集分页。',
]);
assert.deepEqual(evidenceGaps({
  ready: { skipped: '当前 worktree HEAD 不对应 PR head；未运行本地 Ready gate。' },
}), ['当前 worktree HEAD 不对应 PR head；未运行本地 Ready gate。']);
assert.deepEqual(evidenceGaps({ ciGaps: ['外部 CI 失败原文未自动取得。'] }), ['外部 CI 失败原文未自动取得。']);
assert.equal(hasIncompleteThreadPages([{ data: { repository: { pullRequest: { reviewThreads: {
  pageInfo: { hasNextPage: true },
} } } } }]), true);
assert.equal(hasIncompleteThreadPages([
  { data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: true } } } } } },
  { data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false } } } } } },
]), false);
assert.deepEqual(evidenceGaps({
  reviewThreadPages: [{ data: { repository: { pullRequest: { reviewThreads: {
    pageInfo: { hasNextPage: true },
  } } } } }],
}), ['review thread 列表仍有未收集分页。']);
assert.deepEqual(readyCheckArgs('/repo', '7', 'owner/repo'), [
  '/repo/scripts/pr-ready-check.js', '--pr', '7', '--repo', 'owner/repo',
]);
assert.deepEqual(failedChecks([
  { name: 'ok', conclusion: 'SUCCESS' },
  { name: 'failed', conclusion: 'FAILURE' },
  { name: 'context', state: 'ERROR' },
]).map((check) => check.name), ['failed', 'context']);
assert.equal(actionRunId('https://github.com/owner/repo/actions/runs/123/job/456'), '123');
assert.equal(actionRunId('https://ci.example.com/build/123'), '');

assert.deepEqual(compareSnapshots({
  metadata: { headRefOid: 'old' },
  context: { contract: 'task-comment-url', commentId: '7', updatedAt: 'old' },
  stateFingerprint: 'old-state',
}, {
  metadata: { headRefOid: 'new' },
  context: { contract: 'task-comment-url', commentId: '7', updatedAt: 'new' },
  stateFingerprint: 'new-state',
}), ['head', 'context', 'state']);
assert.deepEqual(compareSnapshots({
  metadata: { headRefOid: 'same' }, context: { contract: 'old' }, stateFingerprint: 'old',
}, {
  metadata: { headRefOid: 'same' },
}), []);

const stableMetadata = {
  state: 'OPEN',
  isDraft: true,
  mergeStateStatus: 'UNSTABLE',
  statusCheckRollup: [{ name: 'ci', status: 'IN_PROGRESS' }],
  reviewDecision: null,
};
assert.notEqual(
  reviewStateFingerprint(stableMetadata, 'same-comments'),
  reviewStateFingerprint({ ...stableMetadata, isDraft: false }, 'same-comments'),
);
assert.notEqual(
  reviewStateFingerprint(stableMetadata, 'same-comments'),
  reviewStateFingerprint({ ...stableMetadata, statusCheckRollup: [{ name: 'ci', status: 'COMPLETED' }] }, 'same-comments'),
);

assert.deepEqual(previousSnapshotGaps({
  mode: 'diagnose',
  repo: 'owner/repo',
  pr: 7,
  metadata: { headRefOid: 'head' },
  gaps: [],
}, { repo: 'owner/repo', pr: 7 }), [
  '原快照不是内容审查模式。',
  '原快照缺少 head、Context 或评论状态证据。',
  '原快照未通过末次 metadata 一致性复核。',
]);
assert.deepEqual(previousSnapshotGaps({
  mode: 'review',
  repo: 'owner/repo',
  pr: 7,
  metadata: { headRefOid: 'head' },
  context: { contract: 'task-comment-url' },
  stateFingerprint: 'state',
  gaps: [],
  collectionDrift: [],
}, { repo: 'owner/repo', pr: 7 }), []);

assert.deepEqual(metadataDriftFields({
  headRefOid: 'old',
  baseRefOid: 'base',
  changedFiles: 2,
  statusCheckRollup: [{ status: 'IN_PROGRESS' }],
}, {
  headRefOid: 'new',
  baseRefOid: 'base',
  changedFiles: 2,
  statusCheckRollup: [{ status: 'COMPLETED' }],
}), ['headRefOid']);

assert.deepEqual(contextSnapshotDriftFields({
  contract: 'task-comment-url',
  commentId: '7',
  updatedAt: 'old',
  contentHash: 'old-hash',
}, {
  contract: 'task-comment-url',
  commentId: '7',
  updatedAt: 'new',
  contentHash: 'new-hash',
}), ['updatedAt', 'contentHash']);

function runCollector(metadataSequence, { mode = 'diagnose', cwd = path.resolve(__dirname, '../../../..') } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-pr-context-test.'));
  const fakeBin = path.join(tempDir, 'bin');
  const outDir = path.join(tempDir, 'out');
  const counter = path.join(tempDir, 'counter');
  const callsFile = path.join(tempDir, 'calls');
  fs.mkdirSync(fakeBin);
  const fakeGh = path.join(fakeBin, 'gh');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'pr' && args[1] === 'view') {
  const file = process.env.FAKE_GH_COUNTER;
  const index = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
  const values = JSON.parse(process.env.FAKE_GH_METADATA);
  fs.writeFileSync(file, String(index + 1));
  process.stdout.write(JSON.stringify(values[Math.min(index, values.length - 1)]));
} else if (args.includes('graphql')) {
  process.stdout.write('[{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[],"pageInfo":{"hasNextPage":false}}}}}}]');
} else if (args.some((arg) => arg.includes('/files?'))) {
  process.stdout.write('[[{"filename":"scripts"}]]');
} else {
  process.stdout.write('[[]]');
}
`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [
    __filename.replace(/\.test\.js$/, '.js'),
    '--repo', 'owner/repo', '--pr', '7', '--mode', mode, '--out-dir', outDir,
    ...(mode === 'diagnose' ? ['--focus', 'comments'] : []),
  ], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_COUNTER: counter,
      FAKE_GH_CALLS: callsFile,
      FAKE_GH_METADATA: JSON.stringify(metadataSequence),
    },
  });
  return {
    result,
    manifest: JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')),
    calls: fs.readFileSync(callsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)),
  };
}

const metadata = {
  state: 'OPEN',
  isDraft: true,
  headRefOid: 'a'.repeat(40),
  baseRefName: 'master',
  baseRefOid: 'b'.repeat(40),
  changedFiles: 1,
  statusCheckRollup: [],
};
const stableCollection = runCollector([metadata, metadata, metadata]);
assert.equal(stableCollection.result.status, 0, stableCollection.result.stderr);
assert.equal(fs.readFileSync(path.join(stableCollection.manifest.outDir, '..', 'counter'), 'utf8'), '3');
const driftCollection = runCollector([metadata, metadata, { ...metadata, headRefOid: 'c'.repeat(40) }]);
assert.equal(driftCollection.result.status, 2, driftCollection.result.stderr);
assert(driftCollection.manifest.gaps.some((gap) => gap.includes('末次评论状态取证期间')));

const reviewRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-pr-review-repo.'));
try {
  fs.symlinkSync(path.resolve(__dirname, '../../../../scripts'), path.join(reviewRepo, 'scripts'));
  for (const args of [
    ['init', '-q', '-b', 'review-fixture'],
    ['add', 'scripts'],
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'user.name=Fixture',
      '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Review fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: reviewRepo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: reviewRepo, encoding: 'utf8' }).stdout.trim();
  const reviewMetadata = {
    ...metadata, headRefName: 'review-fixture', headRefOid: head,
    body: '## Context\nSource: discussion\n分级：S级\n- 本轮在持续讨论中形成了本次修改。\n',
  };
  const matched = runCollector([reviewMetadata], { mode: 'review', cwd: reviewRepo });
  assert.equal(matched.result.status, 0, matched.result.stderr);
  assert.deepEqual(matched.manifest.gaps, []);
  assert(matched.manifest.context && matched.manifest.diff && matched.manifest.stateFingerprint);

  for (const mismatch of [
    { headRefName: 'another-branch' },
    { headRefOid: 'c'.repeat(40) },
    {},
  ]) {
    if (!Object.keys(mismatch).length) fs.writeFileSync(path.join(reviewRepo, 'uncommitted.txt'), 'dirty');
    const blocked = runCollector([{ ...reviewMetadata, ...mismatch }], { mode: 'review', cwd: reviewRepo });
    assert.equal(blocked.result.status, 2, blocked.result.stderr);
    assert.equal(blocked.manifest.gaps.length, 1);
    assert.match(blocked.manifest.gaps[0], /worktree/);
    assert.equal(blocked.calls.length, 1, '工作目录不匹配时只读取 PR metadata，不继续远端取证');
    assert.equal(blocked.manifest.context, undefined);
    assert.equal(blocked.manifest.diff, undefined);
    assert.equal(blocked.manifest.stateFingerprint, undefined);
  }
} finally {
  fs.rmSync(reviewRepo, { recursive: true, force: true });
}

console.log('collect-pr-context 自检通过。');
