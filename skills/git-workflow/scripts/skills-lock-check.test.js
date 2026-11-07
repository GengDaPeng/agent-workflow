const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkSharedSkills } = require('./skills-lock-check');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-lock-'));
  const skillDir = path.join(root, '.agents/skills/demo');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'a');
  fs.writeFileSync(path.join(skillDir, 'references/x.md'), 'b');
  // 按 skills CLI 1.7.6 的 computedHash 算法复算；localeCompare 不区分大小写，references/ 排在 SKILL.md 前。
  const expected = crypto.createHash('sha256').update('references/x.md').update('b').update('SKILL.md').update('a').digest('hex');
  fs.writeFileSync(path.join(root, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { demo: { source: 'owner/repo', computedHash: expected } } }));
  return { root, skillDir };
}

test('共享 Skill 被本地改动时报错，未改动或未触及时放行', () => {
  const { root, skillDir } = fixture();
  try {
    assert.deepEqual(checkSharedSkills(['.agents/skills/demo/SKILL.md'], root), []);
    assert.deepEqual(checkSharedSkills(null, root), []);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'changed');
    assert.match(checkSharedSkills(['.agents/skills/demo/SKILL.md'], root)[0], /demo 来自 owner\/repo.*撤销本地改动.*先在 owner\/repo 提交.*npx skills@1\.7\.6 update demo -p -y/);
    assert.match(checkSharedSkills(['skills-lock.json'], root)[0], /demo/);
    assert.match(checkSharedSkills(null, root)[0], /demo/);
    assert.deepEqual(checkSharedSkills(['.agents/skills/other/SKILL.md'], root), []);
    fs.rmSync(path.join(root, 'skills-lock.json'));
    assert.deepEqual(checkSharedSkills(null, root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI 在 git 仓库根核对全部或 staged 触及的 Skill', () => {
  const { root, skillDir } = fixture();
  const script = path.join(__dirname, 'skills-lock-check.js');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: path.join(root, '.agents'), encoding: 'utf8' });
  try {
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
    assert.equal(run().status, 0);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'changed');
    const all = run();
    assert.equal(all.status, 1);
    assert.match(all.stderr, /demo 来自 owner\/repo/);
    assert.equal(run('--staged').status, 0, '未 staged 时 --staged 不核对');
    assert.equal(spawnSync('git', ['add', '.agents/skills/demo/SKILL.md'], { cwd: root }).status, 0);
    assert.equal(run('--staged').status, 1);
    assert.match(run('--bogus').stderr, /只接受 --staged/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
