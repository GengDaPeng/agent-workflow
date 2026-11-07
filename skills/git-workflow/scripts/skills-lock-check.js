#!/usr/bin/env node

/**
 * 作用：核对 .agents/skills/ 下由 skills CLI 安装的共享 Skill 与 skills-lock.json 的 computedHash 一致，
 * 拦截在使用方仓库里直接改共享 Skill。可在任何项目的 pre-commit 里调用。
 * 用法：node skills-lock-check.js            核对锁文件里的全部 Skill
 *       node skills-lock-check.js --staged   只核对本次 staged 改动触及的 Skill（改锁文件时核对全部）
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// 与 skills CLI（vercel-labs/skills）的 computeSkillFolderHash 同算法：按相对路径排序，依次散列路径与内容。
function skillFolderHash(dir) {
  const files = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') walk(full);
      } else if (entry.isFile()) {
        files.push({ rel: path.relative(dir, full).split(path.sep).join('/'), content: fs.readFileSync(full) });
      }
    }
  })(dir);
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file.rel);
    hash.update(file.content);
  }
  return hash.digest('hex');
}

/** changedFiles 为 null 时核对全部锁定 Skill；否则只核对被触及的 Skill。 */
function checkSharedSkills(changedFiles, root = process.cwd()) {
  const lockPath = path.join(root, 'skills-lock.json');
  if (!fs.existsSync(lockPath)) return [];
  const skills = JSON.parse(fs.readFileSync(lockPath, 'utf8')).skills || {};
  const touched = !changedFiles || changedFiles.includes('skills-lock.json')
    ? Object.keys(skills)
    : Object.keys(skills).filter((name) => changedFiles.some((file) => file.startsWith(`.agents/skills/${name}/`)));
  return touched
    .filter((name) => {
      const dir = path.join(root, '.agents/skills', name);
      return !fs.existsSync(dir) || skillFolderHash(dir) !== skills[name].computedHash;
    })
    .map((name) => `${name} 来自 ${skills[name].source}，本地内容与 skills-lock.json 不一致。误改请撤销本地改动；要修改它，先在 ${skills[name].source} 提交，再运行 DISABLE_TELEMETRY=1 npx skills@1.7.6 update ${name} -p -y 同步。`);
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${String(result.stderr).trim()}`);
  return result.stdout;
}

function main(argv = process.argv.slice(2)) {
  try {
    if (argv.some((arg) => arg !== '--staged')) throw new Error(`不支持的参数：${argv.join(' ')}；只接受 --staged。`);
    const root = git(['rev-parse', '--show-toplevel']).trim();
    const changedFiles = argv.includes('--staged')
      ? git(['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean)
      : null;
    const errors = checkSharedSkills(changedFiles, root);
    if (errors.length) {
      console.error(`共享 Skill 锁校验失败：\n${errors.map((error) => `- ${error}`).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    console.log('共享 Skill 锁校验通过。');
  } catch (error) {
    console.error(`共享 Skill 锁校验失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { checkSharedSkills, main, skillFolderHash };
