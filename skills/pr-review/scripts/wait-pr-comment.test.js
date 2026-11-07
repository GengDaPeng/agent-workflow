const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, 'wait-pr-comment.js');
const comment = (id, tag) => ({ id, body: `评论者：example-test\n${tag}\n结论正文`, html_url: `https://github.com/example/repo/pull/1#issuecomment-${id}`, user: { login: 'shared-account' } });

function run(role, rounds, extra = [], status = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-comment-test-'));
  fs.writeFileSync(path.join(dir, 'rounds.json'), JSON.stringify(rounds));
  fs.writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.PR_COMMENT_TEST_DIR;
const rounds = JSON.parse(fs.readFileSync(path.join(dir, 'rounds.json'), 'utf8'));
const counter = path.join(dir, 'counter');
let index = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : -1;
const args = process.argv.slice(2);
if (args[0] === 'repo') {
  console.log(JSON.stringify({nameWithOwner: 'example/repo'}));
} else if (args.includes('repos/example/repo/pulls/1')) {
  index++;
  fs.writeFileSync(counter, String(index));
  const round = rounds[Math.min(index, rounds.length - 1)];
  console.log(JSON.stringify({state: round.state || 'open', merged_at: round.merged ? '2026-11-06T00:00:00Z' : null}));
} else if (args.includes('repos/example/repo/issues/1/comments?per_page=100')) {
  const round = rounds[Math.min(index, rounds.length - 1)];
  if (round.error) { console.error('temporary GitHub error'); process.exit(1); }
  console.log(JSON.stringify([round.comments.slice(0, 100), round.comments.slice(100)]));
} else { console.error('unexpected gh arguments: ' + JSON.stringify(args)); process.exit(1); }
`, { mode: 0o755 });
  try {
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [script, '--pr', '1', '--role', role, '--interval', '0.001', ...extra], {
      encoding: 'utf8', timeout: 10000,
      env: { ...childEnv, PATH: `${dir}:${process.env.PATH}`, PR_COMMENT_TEST_DIR: dir },
    });
    assert.equal(result.status, status, result.stderr);
    return { ...result, events: result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('developer: skip old comments, report asynchronous reviews once, then stop on merge', () => {
  const old = comment(1, '[REVIEW][MUST]');
  const a = comment(2, '[REVIEW][MUST]');
  const b = comment(3, '[RECHECK][PASS][RR-001]');
  const fix = comment(4, '[FIX-REPLY]');
  const result = run('developer', [
    { comments: [old] }, { comments: [old, a] },
    { comments: [old, a, b, fix] }, { comments: [old, a, b, fix], state: 'closed', merged: true },
  ]);
  assert.deepEqual(result.events.map(e => e.id), [2, 3]);
  assert.deepEqual(Object.keys(result.events[0]), ['id', 'type', 'url']);
  assert.equal(result.events[1].url, b.html_url);
  assert.match(result.stderr, /合并/);
});

test('reviewer: receive only fix replies, including the last poll before closing', () => {
  const old = comment(1, '[FIX-REPLY]');
  const result = run('reviewer', [
    { comments: [old] },
    { comments: [old, comment(2, '[REVIEW][MUST]'), comment(3, '[FIX-REPLY]')] },
    { comments: [old, comment(3, '[FIX-REPLY]'), comment(4, '[FIX-REPLY]')], state: 'closed' },
  ]);
  assert.deepEqual(result.events.map(e => e.id), [3, 4]);
  assert.match(result.stderr, /关闭/);
});

test('explicit starting comment catches replies already present at startup', () => {
  const comments = [comment(10, '[FIX-REPLY]'), comment(11, '[REVIEW][PASS]')];
  const result = run('developer', [{ comments }, { comments, state: 'closed' }], ['--after-comment', '10', '--repo', 'example/repo']);
  assert.deepEqual(result.events.map(e => e.id), [11]);
});

test('all pages are consumed; quoted tags in ordinary comments are ignored', () => {
  const old = Array.from({ length: 100 }, (_, i) => comment(i + 1, '[REVIEW][PASS]'));
  const quoted = { ...comment(102, '[REVIEW][PASS]'), body: '普通评论\n\n正文如下：\n[REVIEW][PASS]' };
  const comments = [...old, comment(101, '[REVIEW][PASS]'), quoted];
  const result = run('developer', [{ comments: old }, { comments }, { comments, state: 'closed' }]);
  assert.deepEqual(result.events.map(e => e.id), [101]);
});

test('transient failure does not discard unread comments', () => {
  const comments = [comment(1, '[RECHECK][MUST][RR-002]')];
  const result = run('developer', [{ comments: [] }, { comments, error: true }, { comments }, { comments, state: 'closed' }]);
  assert.deepEqual(result.events.map(e => e.id), [1]);
  assert.match(result.stderr, /temporary GitHub error/);
});

test('already merged PR exits without notifications', () => {
  const result = run('developer', [{ comments: [comment(1, '[REVIEW][PASS]')], state: 'closed', merged: true }]);
  assert.deepEqual(result.events, []);
});

test('--once exits after the first batch, leaving later comments for the next run', () => {
  const comments = [comment(5, '[REVIEW][MUST]'), comment(6, '[RECHECK][PASS][RR-001]')];
  const result = run('developer', [{ comments: [] }, { comments: [] }, { comments }, { comments: [...comments, comment(7, '[REVIEW][PASS]')] }],
    ['--once', '--after-comment', '4']);
  assert.deepEqual(result.events.map(e => e.id), [5, 6]);
});

test('--once with --after-comment reports a reply that arrived before startup', () => {
  const comments = [comment(8, '[FIX-REPLY]'), comment(9, '[FIX-REPLY]')];
  const result = run('reviewer', [{ comments }], ['--once', '--after-comment', '8']);
  assert.deepEqual(result.events.map(e => e.id), [9]);
});

test('--timeout exits with code 2 when nothing new arrives', () => {
  const result = run('reviewer', [{ comments: [comment(1, '[REVIEW][MUST]')] }], ['--once', '--timeout', '0.00005'], 2);
  assert.deepEqual(result.events, []);
  assert.match(result.stderr, /无新评论/);
});

test('--once with --timeout still reports a comment that arrives before the deadline', () => {
  const review = comment(3, '[REVIEW][MUST]');
  const result = run('developer', [{ comments: [] }, { comments: [] }, { comments: [review] }],
    ['--once', '--timeout', '1', '--after-comment', '2']);
  assert.deepEqual(result.events.map(e => e.id), [3]);
});
