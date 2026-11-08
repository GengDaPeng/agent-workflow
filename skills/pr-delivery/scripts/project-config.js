'use strict';

/**
 * 作用：读取使用方仓库根的 .agents/project.json。文件缺失时全部用默认值，字段格式错误时写明字段并报错。
 * 共享脚本安装在 <仓库根>/.agents/skills/<skill>/scripts/，据此定位仓库根；不在安装布局里时只用默认值。
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({ gitWrapper: 'git' });

const nonEmpty = () => true;
const FIELDS = {
  repository: (value) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || '必须是 owner/name',
  gitWrapper: nonEmpty,
  commentIdentityPrefix: (value) => /^\S+$/.test(value) || '不能含空白',
  taskIdPattern: (value) => {
    try { new RegExp(value); return true; } catch (error) { return `不是合法正则：${error.message}`; }
  },
  readyCheck: (value) => value.includes('{pr}') || '必须包含 {pr} 占位',
};

function loadProjectConfig(root) {
  const file = path.join(root, '.agents', 'project.json');
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} 不是合法 JSON：${error.message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${file} 顶层必须是对象。`);
  for (const [field, check] of Object.entries(FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) continue;
    const verdict = typeof raw[field] === 'string' && raw[field].trim() ? check(raw[field]) : '必须是非空字符串';
    if (verdict !== true) throw new Error(`${file} 字段 ${field} 格式错误：${verdict}。`);
  }
  return { ...DEFAULTS, ...raw };
}

function installedProjectRoot(dir = __dirname) {
  const agents = path.resolve(dir, '../../..');
  return path.basename(agents) === '.agents' ? path.dirname(agents) : null;
}

function installedProjectConfig() {
  const root = installedProjectRoot();
  return root ? loadProjectConfig(root) : { ...DEFAULTS };
}

// ponytail: 按空白切分命令模板，不支持带引号的参数；需要时改用 shell 解析。
function splitCommand(value) {
  return String(value).trim().split(/\s+/);
}

function resolveRepository(explicit, config, gh = defaultGh) {
  if (explicit) return explicit;
  if (config?.repository) return config.repository;
  const result = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  const repository = String(result?.stdout || '').trim();
  if (result?.status !== 0 || !repository) {
    throw new Error('无法确定仓库：传 --repo，或在 .agents/project.json 配置 repository。');
  }
  return repository;
}

function defaultGh(args) {
  const result = require('node:child_process').spawnSync('gh', args, { encoding: 'utf8', stdio: 'pipe' });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

module.exports = {
  DEFAULTS, installedProjectConfig, installedProjectRoot, loadProjectConfig, resolveRepository, splitCommand,
};
