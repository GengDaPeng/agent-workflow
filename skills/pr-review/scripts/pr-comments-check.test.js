const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkCurrentHeadReview, readReviewCredential } = require('./pr-comments-check');

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

function reviewBody({ tag = 'REVIEW', status = 'PASS', level = 'A级', version = HEAD, identity = '评论者：demo-model-1', conclusion = '通过' } = {}) {
  const header = tag === 'REVIEW' ? `[REVIEW][${status}]` : `[RECHECK][${status}][RR-001]`;
  return `${identity}\n${header}\n结论：${conclusion}\n任务分级：${level}\n${tag === 'REVIEW' ? '审查版本' : '复核版本'}：${version}\n`;
}

const check = (comments, options = {}) => checkCurrentHeadReview(comments, { expectedHead: HEAD, taskLevel: 'A级', ...options });

test('身份前缀：未配置接受任意 <项目>-<模型ID>，配置后只接受该项目', () => {
  assert.equal(readReviewCredential({ body: reviewBody({ identity: '评论者：other-model' }) }, 0).hasIdentity, true);
  assert.equal(readReviewCredential({ body: reviewBody({ identity: '评论者：nohyphen' }) }, 0).hasIdentity, false);
  assert.equal(readReviewCredential({ body: reviewBody({ identity: '评论者：other-model' }) }, 0, { identityPrefix: 'demo' }).hasIdentity, false);
  assert.equal(readReviewCredential({ body: reviewBody() }, 0, { identityPrefix: 'demo' }).hasIdentity, true);
  assert.match(check([{ body: reviewBody({ identity: '评论者：other-model' }) }], { identityPrefix: 'demo' })[0], /身份首行/);
  assert.equal(readReviewCredential({ body: reviewBody({ identity: '评论者：my-app-model-1' }) }, 0, { identityPrefix: 'my-app' }).hasIdentity, true);
  assert.equal(readReviewCredential({ body: reviewBody({ identity: '评论者：my-model-1' }) }, 0, { identityPrefix: 'my-app' }).hasIdentity, false);
});

test('current head 需要合法 PASS 凭据；B级免检；祖先版本由注入函数判断', () => {
  assert.deepEqual(check([{ body: reviewBody() }]), []);
  assert.deepEqual(check([{ body: reviewBody({ tag: 'RECHECK' }) }]), []);
  assert.deepEqual(check([], { taskLevel: 'B级' }), []);
  assert.match(check([]).join('\n'), /独立通过凭据/);
  assert.match(check([{ body: reviewBody({ version: OLD }) }]).join('\n'), /版本不适用于/);
  assert.deepEqual(check([{ body: reviewBody({ version: OLD }) }], { isReviewVersionAncestor: () => ({ ancestor: true }) }), []);
  assert.match(check([{ body: reviewBody({ conclusion: '看起来没问题' }) }]).join('\n'), /结论：通过/);
  assert.match(check([{ body: reviewBody({ level: 'S级' }) }]).join('\n'), /任务分级/);
  assert.deepEqual(check([{ body: reviewBody() }], { expectedHead: 'short' }), ['缺少当前 PR head，无法校验独立复核评论。']);
});

function runCli(script, body, cwd) {
  fs.writeFileSync(path.join(cwd, 'body.md'), body);
  fs.writeFileSync(path.join(cwd, 'manifest.json'), JSON.stringify({
    mode: 'review', repo: 'owner/repo', pr: 7, gaps: [],
    metadata: { headRefOid: HEAD, url: 'https://github.com/owner/repo/pull/7' }, context: { grade: 'A级' },
  }));
  return spawnSync(process.execPath, [script, '--body', 'body.md', '--manifest', 'manifest.json'], { cwd, encoding: 'utf8' });
}

test('CLI 在安装布局下读取 .agents/project.json 的 commentIdentityPrefix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-comments-installed-'));
  try {
    for (const [skill, files] of [['pr-review', ['pr-comments-check.js']], ['pr-delivery', ['project-config.js']]]) {
      const dir = path.join(root, '.agents/skills', skill, 'scripts');
      fs.mkdirSync(dir, { recursive: true });
      for (const file of files) fs.copyFileSync(path.join(__dirname, '../..', skill, 'scripts', file), path.join(dir, file));
    }
    const script = path.join(root, '.agents/skills/pr-review/scripts/pr-comments-check.js');
    assert.equal(runCli(script, reviewBody({ identity: '评论者：other-model' }), root).status, 0);
    fs.writeFileSync(path.join(root, '.agents/project.json'), JSON.stringify({ commentIdentityPrefix: 'demo' }));
    const rejected = runCli(script, reviewBody({ identity: '评论者：other-model' }), os.tmpdir());
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /身份首行/);
    const accepted = runCli(script, reviewBody(), root);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.deepEqual(JSON.parse(accepted.stdout), { valid: true, tag: 'REVIEW', status: 'PASS', head: HEAD, grade: 'A级' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI 帮助直接退出，缺参数报错', () => {
  const script = path.join(__dirname, 'pr-comments-check.js');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /用法：.*--body.*--manifest/);
  const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /需要 --body 和 --manifest/);
});
