#!/usr/bin/env node

/**
 * 作用：校验置顶任务执行评论，并输出任务 artifact。
 * 触发：项目主控派发前，或生成 PR / 派发输入前显式运行。
 * 边界：读取指定评论及所属 Issue；讨论形成的变更由 PR Context 承载。
 * 参数：仓库与任务编号正则来自 .agents/project.json 的 repository / taskIdPattern；
 * 仓库缺省用 gh repo view，任务编号正则缺省用 DEFAULT_TASK_ID_PATTERN。纯函数一律显式传参。
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { URL } = require('node:url');

const DEFAULT_TASK_ID_PATTERN = '^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\\d+$';
const TASK_CARD_MARKER = '[TASK-CARD]';
const REQUIRED_SECTIONS = ['完成条件', '范围', '不做', '正式依据', '验证', '前置 / 阻断'];
const TASK_CARD_VERSION_FIELDS = [
  'taskUrl', 'task', 'grade', 'issueNumber', 'commentId', 'updatedAt', 'contentHash',
];

function contentHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function withoutCodeBlocks(value) {
  let fence = null;
  return String(value || '').split(/\r?\n/).map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence && marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return '';
    }
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null;
      return '';
    }
    if (/^(?: {4}| {0,3}\t)/.test(line)) return '';
    return line;
  }).join('\n');
}

function taskCardDriftFields(before, after) {
  if (!before || !after) return ['taskCard'];
  return TASK_CARD_VERSION_FIELDS.filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
}

function parseTaskCommentUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)$/);
    const commentMatch = url.hash.match(/^#issuecomment-([1-9]\d*)$/);
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'github.com'
      || url.port !== ''
      || url.username !== ''
      || url.password !== ''
      || url.search !== ''
      || !match
      || !commentMatch
    ) return null;

    return {
      repository: `${match[1]}/${match[2]}`,
      issueNumber: match[3],
      commentId: commentMatch[1],
      url: url.href,
    };
  } catch {
    return null;
  }
}

// 只读本 Skill 需要的两个字段；不依赖其他 Skill（与 pr-delivery 的 project-config 读同一文件）。
function installedProjectConfig() {
  const agents = path.resolve(__dirname, '../../..');
  const file = path.join(agents, 'project.json');
  if (path.basename(agents) !== '.agents' || !fs.existsSync(file)) return {};
  return parseProjectConfig(fs.readFileSync(file, 'utf8'), file);
}

function parseProjectConfig(text, file = '.agents/project.json') {
  let config;
  try { config = JSON.parse(text); } catch (error) { throw new Error(`${file} 不是合法 JSON：${error.message}`); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${file} 顶层必须是对象。`);
  if ('repository' in config && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(config.repository))) {
    throw new Error(`${file} 字段 repository 格式错误：必须是 owner/name。`);
  }
  if ('taskIdPattern' in config) {
    try {
      if (typeof config.taskIdPattern !== 'string' || !config.taskIdPattern) throw new Error('必须是非空字符串');
      new RegExp(config.taskIdPattern);
    } catch (error) {
      throw new Error(`${file} 字段 taskIdPattern 格式错误：${error.message}。`);
    }
  }
  return config;
}

function resolveRepository(explicit, config, ghRunner) {
  if (explicit) return explicit;
  if (config.repository) return config.repository;
  const result = ghRunner(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  const repository = String(result?.stdout || '').trim();
  if (result?.status !== 0 || !repository) throw new Error('无法确定仓库：传 --repo，或在 .agents/project.json 配置 repository。');
  return repository;
}

function isTaskCommentUrl(value, repository) {
  const parsed = parseTaskCommentUrl(value);
  return parsed !== null
    && parsed.repository.toLowerCase() === String(repository || '').trim().toLowerCase();
}

function isExecutionTaskId(value, taskIdPattern = DEFAULT_TASK_ID_PATTERN) {
  return new RegExp(taskIdPattern).test(String(value || '').trim());
}

function parseIssueApiUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const match = url.pathname.match(/^\/repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)$/);
    if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.search || url.hash || !match) {
      return null;
    }
    return { repository: `${match[1]}/${match[2]}`, issueNumber: match[3] };
  } catch {
    return null;
  }
}

function defaultGhRunner(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: result.status == null ? 1 : result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readGhJson(args, ghRunner) {
  const result = ghRunner(args);
  if (!result || result.status !== 0) {
    const detail = String(result?.stderr || '').trim();
    throw new Error(`gh ${args.join(' ')} 失败${detail ? `：${detail}` : ''}`);
  }
  try {
    return JSON.parse(result.stdout || 'null');
  } catch {
    throw new Error(`gh ${args.join(' ')} 返回了无效 JSON。`);
  }
}

function hasContent(value) {
  const content = String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
    .replace(/^[-*]\s+/, '')
    .trim();
  return content !== '' && !/^(?:\.{3,}|…+|todo|tbd|待补|待填写)[。.]?$/i.test(content);
}

function parseTaskCard(comment, requested, { taskIdPattern } = {}) {
  const errors = [];
  const rawBody = String(comment?.body || '');
  const body = withoutCodeBlocks(rawBody);
  const lines = body.split(/\r?\n/);
  if (!/^评论者：[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(lines[0] || '')) {
    errors.push('任务卡首行必须是“评论者：<项目>-<模型ID>”。');
  }
  const markerIndexes = lines
    .map((line, index) => (line.trim() === TASK_CARD_MARKER ? index : -1))
    .filter((index) => index >= 0);
  if (markerIndexes.length !== 1) {
    errors.push(`任务卡必须且只能包含一个 ${TASK_CARD_MARKER} 标记。`);
  }

  const markerIndex = markerIndexes[0] ?? 0;
  const firstHeading = lines.findIndex((line, index) => index > markerIndex && /^##\s+/.test(line));
  const metadata = lines.slice(markerIndex + 1, firstHeading >= 0 ? firstHeading : lines.length)
    .map((line) => line.trim())
    .filter(Boolean);
  const tasks = metadata.map((line) => line.match(/^[-*]\s*Task:\s*(.+)$/)?.[1]
    || line.match(/^Task:\s*(.+)$/)?.[1]).filter(Boolean);
  const grades = metadata.map((line) => line.match(/^[-*]\s*Grade:\s*(.+)$/)?.[1]
    || line.match(/^Grade:\s*(.+)$/)?.[1]).filter(Boolean);
  if (tasks.length !== 1) errors.push('任务卡必须且只能包含一个 Task 字段。');
  if (grades.length !== 1) errors.push('任务卡必须且只能包含一个 Grade 字段。');
  const task = String(tasks[0] || '').trim();
  const grade = String(grades[0] || '').trim();
  if (!isExecutionTaskId(task, taskIdPattern)) errors.push(`任务卡 Task 不是合法执行任务 ID：${task || '<empty>'}。`);
  if (!/^(B级|A级|S级)$/.test(grade)) errors.push(`任务卡 Grade 只能是 B级、A级或 S级：${grade || '<empty>'}。`);

  const headingRegex = /^##\s+(.+?)\s*$/gm;
  const headings = [];
  let match;
  while ((match = headingRegex.exec(body)) !== null) {
    headings.push({ title: match[1].trim(), contentStart: headingRegex.lastIndex, start: match.index });
  }
  for (const section of REQUIRED_SECTIONS) {
    const matches = headings.filter((item) => item.title === section);
    if (matches.length !== 1) {
      errors.push(`任务卡必须且只能包含一个 ## ${section}。`);
      continue;
    }
    const heading = matches[0];
    const headingIndex = headings.indexOf(heading);
    const next = headings[headingIndex + 1];
    if (!hasContent(body.slice(heading.contentStart, next ? next.start : body.length))) {
      errors.push(`任务卡缺少实质内容：## ${section}。`);
    }
  }

  if (!comment?.pin) errors.push('任务执行评论必须已置顶。');
  const publicReference = parseTaskCommentUrl(comment?.html_url);
  const apiReference = parseIssueApiUrl(comment?.issue_url);
  if (
    String(comment?.id || '') !== requested.commentId
    || !publicReference
    || publicReference.repository.toLowerCase() !== requested.repository.toLowerCase()
    || publicReference.issueNumber !== requested.issueNumber
    || publicReference.commentId !== requested.commentId
    || !apiReference
    || apiReference.repository.toLowerCase() !== requested.repository.toLowerCase()
    || apiReference.issueNumber !== requested.issueNumber
  ) errors.push('GitHub 评论回执与 task_url 不一致。');
  const updatedAt = String(comment?.updated_at || '').trim();
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    errors.push('任务卡评论缺少有效 updated_at。');
  }

  if (errors.length > 0) return { errors, card: null };
  return {
    errors: [],
    card: {
      version: 1,
      taskUrl: requested.url,
      task,
      grade,
      issueNumber: requested.issueNumber,
      commentId: requested.commentId,
      updatedAt,
      contentHash: contentHash(rawBody),
    },
  };
}

function activeTaskCardComments(pages) {
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new Error('GitHub 目标 Issue 评论分页回执格式无效。');
  }
  return pages.flat().filter((comment) => {
    const lines = withoutCodeBlocks(comment?.body).split(/\r?\n/);
    return Boolean(comment?.pin) && lines.some((line) => line.trim() === TASK_CARD_MARKER);
  });
}

function checkCurrentTaskCard({
  taskUrl,
  repository,
  taskIdPattern,
  ghRunner = defaultGhRunner,
}) {
  const requested = parseTaskCommentUrl(taskUrl);
  if (!requested) return { errors: ['task_url 必须是 GitHub Issue 评论深链接。'], card: null };
  if (requested.repository.toLowerCase() !== String(repository || '').trim().toLowerCase()) {
    return { errors: [`task_url 必须属于本仓库 ${repository}。`], card: null };
  }

  try {
    const comment = readGhJson([
      'api',
      `repos/${requested.repository}/issues/comments/${requested.commentId}`,
    ], ghRunner);
    const issueComments = readGhJson([
      'api',
      `repos/${requested.repository}/issues/${requested.issueNumber}/comments?per_page=100`,
      '--paginate',
      '--slurp',
    ], ghRunner);
    const issue = readGhJson([
      'api',
      `repos/${requested.repository}/issues/${requested.issueNumber}`,
    ], ghRunner);
    const activeCards = activeTaskCardComments(issueComments);
    const parsed = parseTaskCard(comment, requested, { taskIdPattern });
    const errors = [...parsed.errors];
    if (activeCards.length !== 1 || String(activeCards[0]?.id || '') !== requested.commentId) {
      errors.push('目标 Issue 活跃期的唯一置顶 [TASK-CARD] 必须由 task_url 指向。');
    } else if (parsed.card && (
      contentHash(activeCards[0]?.body) !== parsed.card.contentHash
      || String(activeCards[0]?.updated_at || '').trim() !== parsed.card.updatedAt
    )) {
      errors.push('任务卡在定向读取与 Issue 评论枚举之间已变化；必须重新运行检查。');
    }
    if (String(issue?.state || '').toUpperCase() !== 'OPEN') {
      errors.push('任务卡所属 Issue 必须保持 Open。');
    }
    const statusLabels = Array.isArray(issue?.labels)
      ? issue.labels
        .map((label) => (typeof label === 'string' ? label : label?.name))
        .filter((label) => String(label || '').startsWith('status:'))
      : [];
    if (statusLabels.length !== 1 || statusLabels[0] !== 'status:tasked') {
      errors.push('任务卡所属 Issue 必须恰有一个 status:* 标签且为 status:tasked。');
    }
    if (errors.length > 0) {
      return {
        errors,
        card: null,
      };
    }
    return parsed;
  } catch (error) {
    return { errors: [error.message], card: null };
  }
}

function checkTaskCardVersion({ card, taskIdPattern, ghRunner = defaultGhRunner }) {
  const requested = parseTaskCommentUrl(card?.taskUrl);
  if (!requested || String(card?.commentId || '') !== requested.commentId) {
    return ['缺少有效任务卡 artifact，无法复核版本。'];
  }

  const current = checkCurrentTaskCard({ taskUrl: card.taskUrl, repository: requested.repository, taskIdPattern, ghRunner });
  if (current.errors.length) return current.errors;
  const drift = taskCardDriftFields(card, current.card);
  return drift.length > 0
    ? [`任务卡版本已变化：${drift.join(', ')}；必须重新运行检查。`]
    : [];
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`不支持的位置参数：${item}`);
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`参数 --${key} 缺少值。`);
    args[key] = next;
    index += 1;
  }
  const unknown = Object.keys(args).filter((key) => !['task-url', 'repo', 'out'].includes(key));
  if (unknown.length > 0) throw new Error(`不支持的参数：${unknown.map((key) => `--${key}`).join(', ')}`);
  return args;
}

function runTaskCardCheckCli(argv, {
  ghRunner = defaultGhRunner,
  writeFile = fs.writeFileSync,
  config = installedProjectConfig(),
} = {}) {
  try {
    const args = parseArgs(argv);
    if (!args['task-url']) return { status: 1, stdout: '', stderr: '缺少 --task-url <pinned Issue comment URL>。\n' };
    const result = checkCurrentTaskCard({
      taskUrl: args['task-url'],
      repository: resolveRepository(args.repo, config, ghRunner),
      taskIdPattern: config.taskIdPattern,
      ghRunner,
    });
    if (result.errors.length > 0) {
      return {
        status: 1,
        stdout: '',
        stderr: `任务卡检查失败：\n${result.errors.map((error) => `- ${error}`).join('\n')}\n`,
      };
    }
    const artifact = `${JSON.stringify(result.card, null, 2)}\n`;
    if (args.out) {
      writeFile(path.resolve(args.out), artifact, 'utf8');
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 0, stdout: artifact, stderr: '' };
  } catch (error) {
    return { status: 1, stdout: '', stderr: `${error.message}\n` };
  }
}

function main() {
  const result = runTaskCardCheckCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status);
}

if (require.main === module) main();

module.exports = {
  DEFAULT_TASK_ID_PATTERN,
  checkCurrentTaskCard,
  checkTaskCardVersion,
  isTaskCommentUrl,
  isExecutionTaskId,
  installedProjectConfig,
  parseProjectConfig,
  parseTaskCommentUrl,
  parseIssueApiUrl,
  runTaskCardCheckCli,
  taskCardDriftFields,
};
