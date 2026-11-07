#!/usr/bin/env node

/**
 * 作用：PR 正文核心检查——必需段落（Summary、Context、Verification、Merge Danger）、Context 解析、
 * Verification 非空泛 / TODO_VERIFICATION / Not run 原因、Merge Danger 字段、Draft 与分级规则。
 * 边界：不读 diff，不判断文件内容是否语义等价；任务卡真实状态由调用方注入 checkTaskCard 校验。
 * 分阶段函数按固定顺序导出，项目可在阶段之间插入自己的扩展检查，checkPrBody 是默认组合。
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { URL } = require('node:url');
const { installedProjectConfig, resolveRepository } = require('./project-config');

const REQUIRED_SECTIONS = ['Summary', 'Context', 'Verification', 'Merge Danger'];
const GENERIC_VERIFICATION_PATTERNS = [
  /^[-*\s]*(已验证|验证通过|测试通过|通过|pass|passed|ok|done)[。.!！\s]*$/i,
  /^[-*\s]*(ci\s+)?(passed|green)[。.!！\s]*$/i,
];

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function parseSections(body) {
  const visibleBody = stripHtmlComments(String(body || ''));
  const sections = {};
  const headingRegex = /^##\s+(.+?)\s*$/gm;
  const headings = [];
  let match;

  while ((match = headingRegex.exec(visibleBody)) !== null) {
    headings.push({
      title: match[1].trim(),
      start: match.index,
      contentStart: headingRegex.lastIndex,
    });
  }

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const next = headings[i + 1];
    sections[current.title] = visibleBody.slice(
      current.contentStart,
      next ? next.start : visibleBody.length,
    ).trim();
  }

  return sections;
}

function hasSubstantiveSectionContent(text) {
  const normalized = stripHtmlComments(text);
  if (!normalized) return false;
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.some((line) => !/^[-*]\s*$/.test(line));
}

function normalizeMarkdownListLine(line) {
  return String(line || '').trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim();
}

function sectionHasMeaningfulVerification(text) {
  const normalized = stripHtmlComments(text);
  if (!normalized) return false;

  const lines = normalized
    .split(/\r?\n/)
    .map(normalizeMarkdownListLine)
    .filter(Boolean);

  if (lines.length === 0) return false;

  const allGeneric = lines.every((line) => GENERIC_VERIFICATION_PATTERNS.some((pattern) => pattern.test(line)));
  return !allGeneric;
}

function hasNotRunReason(text) {
  const lines = text.split(/\r?\n/);
  return lines.every((line) => {
    if (!/not run\s*:/i.test(line)) return true;
    return /not run\s*:\s*\S.{3,}/i.test(line);
  });
}

function hasActualVerificationEvidence(text) {
  const lines = stripHtmlComments(text)
    .split(/\r?\n/)
    .map(normalizeMarkdownListLine)
    .filter(Boolean);
  return lines.some((line) => (
    !/^not run\s*:/i.test(line)
    && !GENERIC_VERIFICATION_PATTERNS.some((pattern) => pattern.test(line))
    && !/^#{1,6}\s/.test(line)
    && !/^```/.test(line)
  ));
}

function readFieldValues(notes, label) {
  const labelPattern = new RegExp(`^${label}$`);
  return String(notes || '').split(/\r?\n/).flatMap((line) => {
    const normalized = normalizeMarkdownListLine(line.trim());
    const plain = new RegExp(`^${label}\\s*[：:]\\s*(.+)$`).exec(normalized);
    if (plain) return [plain[1].trim()];
    if (!/^\|.*\|$/.test(normalized)) return [];
    const cells = normalized.split('|').slice(1, -1).map((cell) => cell.trim());
    return cells.length === 2 && labelPattern.test(cells[0]) && cells[1] ? [cells[1]] : [];
  });
}

function readNotesField(notes, label) {
  return readFieldValues(notes, label)[0] || '';
}

function countNotesFields(notes, label) {
  return readFieldValues(notes, label).length;
}

function countSectionHeadings(body, title) {
  const escaped = String(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(stripHtmlComments(String(body || ''))
    .matchAll(new RegExp(`^##\\s+${escaped}\\s*$`, 'gm'))).length;
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

function isTaskCommentUrl(value, repository) {
  const parsed = parseTaskCommentUrl(value);
  return parsed !== null
    && parsed.repository.toLowerCase() === String(repository || '').trim().toLowerCase();
}

function contextReferenceFromPrBody(body) {
  if (countSectionHeadings(body, 'Context') !== 1) return '';
  return readNotesField(stripHtmlComments(parseSections(body).Context || ''), 'Task');
}

function contextGradeFromPrBody(body) {
  if (countSectionHeadings(body, 'Context') !== 1) return '';
  const sections = parseSections(body);
  const context = stripHtmlComments(sections.Context || '');
  const grade = readNotesField(context, '分级');
  return countNotesFields(context, '分级') === 1 && /^(B级|A级|S级)$/.test(grade)
    ? grade
    : '';
}

function contextSectionOnlyContainsTaskProjection(context) {
  const lines = stripHtmlComments(context)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tableSeparator = /^\|(?:\s*:?-{3,}:?\s*\|)+$/;
  const fields = lines.map((line, index) => {
    const normalized = normalizeMarkdownListLine(line);
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(normalized)) return '';
    if (tableSeparator.test(normalized)) return '';
    if (/^\|.*\|$/.test(normalized)) {
      const cells = normalized.split('|').slice(1, -1).map((cell) => cell.trim());
      const next = normalizeMarkdownListLine(lines[index + 1] || '');
      if (cells.length === 2 && cells[0] === '字段' && cells[1] === '值' && tableSeparator.test(next)) return '';
      if (cells.length === 2 && /^(Source|Task|分级)$/.test(cells[0])) return `${cells[0]}: ${cells[1]}`;
    }
    return normalized;
  }).filter(Boolean);
  return fields.length === 3
    && fields.filter((line) => /^Source[：:]\s*task-card\s*$/.test(line)).length === 1
    && fields.filter((line) => /^Task[：:]\s*\S(?:.*\S)?\s*$/.test(line)).length === 1
    && fields.filter((line) => /^分级[：:]\s*(B级|A级|S级)\s*$/.test(line)).length === 1;
}

function discussionBackground(context) {
  const lines = stripHtmlComments(context).split(/\r?\n/).map(normalizeMarkdownListLine);
  const tableSeparator = /^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?$/;
  const tableRows = new Set();
  lines.forEach((line, index) => {
    if (!tableSeparator.test(line)) return;
    tableRows.add(index - 1);
    tableRows.add(index);
    for (let next = index + 1; lines[next]?.includes('|'); next += 1) tableRows.add(next);
  });
  return lines
    .flatMap((normalized, index) => {
      if (!normalized || tableRows.has(index) || /^\|.*\|$/.test(normalized)) return [];
      const unformatted = normalized.replace(/^[\s*_`>#]+|[\s*_`]+$/g, '');
      return /^[A-Za-z][A-Za-z0-9_-]{0,31}\s*[：:]\s*\S/.test(unformatted) ? [] : [normalized];
    })
    .join('\n')
    .trim();
}

function hasDiscussionBackground(value) {
  return String(value || '').split(/\r?\n/).some((line) => {
    if (/^\s*#{1,6}\s+/.test(line)) return false;
    const content = normalizeMarkdownListLine(line).trim();
    if (!content || /^<[^>]+>$/.test(content) || /^(?:\.{3,}|…+|todo|tbd|待补|待填写|background|discussion context|context|背景|讨论背景)[：:.。]?$/i.test(content)) return false;
    return Array.from(content.replace(/[\s`*_>#|]/g, '')).length >= 8;
  });
}

function parsePrContext(body, { repository } = {}) {
  const errors = [];
  if (countSectionHeadings(body, 'Context') !== 1) {
    return { errors: ['PR 描述必须且只能包含一个 ## Context 段落。'], context: null };
  }
  const raw = stripHtmlComments(parseSections(body).Context || '');
  const source = readNotesField(raw, 'Source');
  const grade = contextGradeFromPrBody(body);
  if (countNotesFields(raw, 'Source') !== 1 || !/^(task-card|discussion)$/.test(source)) {
    errors.push('## Context 必须且只能声明一个 Source：task-card 或 discussion。');
  }
  if (!grade) errors.push('## Context 必须明确写且只能写一个分级：B级 / A级 / S级。');

  const reference = contextReferenceFromPrBody(body);
  let background = '';
  if (source === 'task-card') {
    if (!contextSectionOnlyContainsTaskProjection(raw)) {
      errors.push('task-card Context 只承载 Source、Task URL 与分级。');
    }
    if (!isTaskCommentUrl(reference, repository)) errors.push('task-card Context 必须且只能写一个本仓库 GitHub Issue 评论 URL。');
  } else if (source === 'discussion') {
    if (countNotesFields(raw, 'Task') > 0) errors.push('discussion Context 不得伪造 Task URL。');
    background = discussionBackground(raw);
    if (!hasDiscussionBackground(background)) errors.push('discussion Context 必须保存实质背景。');
  }

  if (errors.length) return { errors, context: null };
  return {
    errors: [],
    context: {
      version: 1,
      source,
      reference,
      grade,
      background,
      contentHash: createHash('sha256').update(raw).digest('hex'),
    },
  };
}

/**
 * checkTaskCard 由项目注入（例如 project-control 的 checkCurrentTaskCard）；未注入时只做正文解析与 URL 归属校验。
 */
function checkPrContext({ body, repository, ghRunner, checkTaskCard } = {}) {
  const parsed = parsePrContext(body, { repository });
  if (parsed.errors.length || parsed.context.source === 'discussion' || !checkTaskCard) return parsed;
  const checked = checkTaskCard({
    taskUrl: parsed.context.reference,
    repository,
    ...(ghRunner ? { ghRunner } : {}),
  });
  const errors = [...checked.errors];
  if (checked.card && checked.card.grade !== parsed.context.grade) {
    errors.push('PR Context 分级与置顶任务评论 artifact Grade 不一致。');
  }
  if (errors.length) return { errors, context: null };
  return {
    errors: [],
    context: {
      ...checked.card,
      source: 'task-card',
      reference: checked.card.taskUrl,
    },
  };
}

function prContextDriftFields(before, after) {
  if (!before || !after) return ['context'];
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

// ---- 分阶段检查：checkPrBody 的固定顺序即下面的声明顺序 ----

function checkRequiredSections(body, sections = parseSections(body)) {
  const errors = [];
  for (const section of REQUIRED_SECTIONS) {
    const count = countSectionHeadings(body, section);
    if (count === 0 || !Object.prototype.hasOwnProperty.call(sections, section)) {
      errors.push(`PR 描述缺少 ## ${section} 段落。`);
    } else if (count > 1) {
      errors.push(`PR 描述重复 ## ${section} 段落；受控段落必须且只能出现一次。`);
    } else if (!hasSubstantiveSectionContent(sections[section])) {
      errors.push(`PR 描述 ## ${section} 段落不能为空。`);
    }
  }
  return errors;
}

function checkMergeDanger(body, sections = parseSections(body)) {
  const errors = [];
  const mergeDanger = sections['Merge Danger'];
  if (countSectionHeadings(body, 'Merge Danger') === 1 && hasSubstantiveSectionContent(mergeDanger)) {
    if (!['单向门', '双向门'].includes(readNotesField(mergeDanger, '门'))) {
      errors.push('## Merge Danger 的“门”必须二选一：单向门 或 双向门。');
    }
    if (!readNotesField(mergeDanger, '影响面')) errors.push('## Merge Danger 的“影响面”不能为空。');
  }
  return errors;
}

function checkVerificationSection(sections) {
  const errors = [];
  const verification = sections.Verification || '';
  if (Object.prototype.hasOwnProperty.call(sections, 'Verification') && !sectionHasMeaningfulVerification(verification)) {
    errors.push('## Verification 不能只写“已验证 / 测试通过 / pass”等空泛结论，必须包含命令、测试名、人工检查步骤或 Not run 原因。');
  }
  if (/not run\s*:/i.test(verification) && !hasNotRunReason(verification)) {
    errors.push('## Verification 中的 Not run: 必须写明具体原因。');
  }
  return errors;
}

function checkDraftRule(level, draft) {
  return level === 'B级' && draft ? ['B级不得使用 Review Draft；完成自查后直接创建 Ready PR。'] : [];
}

function checkContextArtifact(currentContext, parsedContext, level) {
  const errors = [];
  if (!currentContext || currentContext.version !== 1) {
    errors.push('缺少已校验的 PR Context artifact。');
  } else if (parsedContext) {
    if (currentContext.source !== parsedContext.source) errors.push('PR Context 来源与 artifact 不一致。');
    if (currentContext.grade !== level) errors.push('PR Context 分级与 artifact 不一致。');
    if (currentContext.source === 'task-card' && currentContext.reference !== parsedContext.reference) {
      errors.push('PR Context Task URL 与置顶任务评论 artifact 不一致。');
    }
    if (currentContext.source === 'discussion' && currentContext.contentHash !== parsedContext.contentHash) {
      errors.push('PR discussion Context 正文与 artifact 不一致。');
    }
  }
  return errors;
}

function checkVerificationEvidence(level, verification) {
  return (level === 'A级' || level === 'S级') && !hasActualVerificationEvidence(verification)
    ? ['A级 / S级交付至少要有一项实际验证命令、测试或人工步骤及结果，不能全部用 Not run 替代。']
    : [];
}

function checkTodoVerification(body) {
  return /TODO_VERIFICATION/.test(body)
    ? ['PR 描述仍含 TODO_VERIFICATION 占位；任务卡缺验证口径，交付前必须补真实验证命令或具体 Not run 原因并删除占位。']
    : [];
}

function checkPrBody({ body = '', draft = false, currentContext, repository } = {}) {
  const sections = parseSections(body);
  const errors = [
    ...checkRequiredSections(body, sections),
    ...checkMergeDanger(body, sections),
    ...checkVerificationSection(sections),
  ];
  const parsed = parsePrContext(body, { repository });
  errors.push(...parsed.errors);
  const level = parsed.context?.grade || '';
  errors.push(
    ...checkDraftRule(level, draft),
    ...checkContextArtifact(currentContext, parsed.context, level),
    ...checkVerificationEvidence(level, sections.Verification || ''),
    ...checkTodoVerification(body),
  );
  return { errors, sections, context: parsed.context };
}

function main(argv = process.argv.slice(2), config = installedProjectConfig()) {
  try {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === '--draft') { args.draft = true; continue; }
      if (!['--body', '--repo'].includes(argv[i]) || !argv[i + 1]) throw new Error(`参数无效：${argv[i]}`);
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
    if (!args.body) throw new Error(`用法：node ${path.relative(process.cwd(), process.argv[1])} --body <PR 正文.md> [--draft] [--repo owner/name]`);
    const body = fs.readFileSync(path.resolve(args.body), 'utf8');
    const repository = resolveRepository(args.repo, config);
    const context = checkPrContext({ body, repository });
    const result = checkPrBody({ body, draft: Boolean(args.draft), currentContext: context.context, repository });
    if (result.errors.length) {
      console.error(`PR 正文检查失败：\n${result.errors.map((error) => `- ${error}`).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    console.log('PR 正文检查通过。');
  } catch (error) {
    console.error(`PR 正文检查失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  REQUIRED_SECTIONS,
  checkContextArtifact,
  checkDraftRule,
  checkMergeDanger,
  checkPrBody,
  checkPrContext,
  checkRequiredSections,
  checkTodoVerification,
  checkVerificationEvidence,
  checkVerificationSection,
  contextGradeFromPrBody,
  contextReferenceFromPrBody,
  countNotesFields,
  countSectionHeadings,
  hasActualVerificationEvidence,
  hasSubstantiveSectionContent,
  isTaskCommentUrl,
  main,
  normalizeMarkdownListLine,
  parsePrContext,
  parseSections,
  parseTaskCommentUrl,
  prContextDriftFields,
  readNotesField,
  stripHtmlComments,
};
