#!/usr/bin/env node

/**
 * 作用：校验 REVIEW / RECHECK 正文字段，并提取适用于 current head 的独立通过凭据。
 * 触发：CLI 校验正文文件 / 发布回读；Ready 检查调用通过凭据检查。不重建评论语义闭环。
 * 逻辑：只核对评论身份、任务分级、审查 / 复核版本、通过结论和版本对 current head 的适用性。
 * 身份前缀来自 .agents/project.json 的 commentIdentityPrefix；未配置时接受任意“<项目>-<模型ID>”。
 * 信任模型：身份行由作者自己声明，不核对 GitHub 账号（多个代理可共用一个账号）；它用于区分代理，
 * 不作为安全边界，防的是失误，不是恶意。
 */
const path = require('node:path');
const { installedProjectConfig } = require('../../pr-delivery/scripts/project-config');

const REVIEW_RE = /^\[REVIEW\]\[(MUST|PASS)\]$/;
const RECHECK_RE = /^\[RECHECK\]\[(MUST|PASS)\](?:\[RR-\d{1,4}\])+$/;

function withoutCodeBlocks(value) {
  let fence = null;
  const withoutFences = String(value || '').split(/\r?\n/).map((line) => {
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
  return withoutFences.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

function firstLine(body) {
  const lines = withoutCodeBlocks(body).split(/\r?\n/).filter((line) => line.trim());
  return (/^评论者[：:]\s*\S/.test((lines[0] || '').trim()) ? lines[1] : lines[0]) || '';
}

function identityPattern(identityPrefix) {
  if (!identityPrefix) return /^评论者[：:]\s*[^\s-]+(?:-[^\s-]+)+\s*$/;
  const prefix = String(identityPrefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^评论者[：:]\\s*${prefix}-[^\\s-]+(?:-[^\\s-]+)*\\s*$`);
}

function hasAgentIdentity(body, identityPrefix) {
  const lines = withoutCodeBlocks(body).split(/\r?\n/).filter((item) => item.trim());
  const identityLines = lines.filter((item) => /^评论者[：:]/.test(item.trim()));
  return identityLines.length === 1
    && lines[0].trim() === identityLines[0].trim()
    && identityPattern(identityPrefix).test(identityLines[0].trim());
}

function readFieldValues(body, label) {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(withoutCodeBlocks(body).matchAll(
    new RegExp(`^[ \\t*-]*${escapedLabel}[：:][ \\t]*(\\S.*)$`, 'gm'),
  ), (match) => match[1].trim());
}

function readField(body, label) {
  const values = readFieldValues(body, label);
  return values.length === 1 ? values[0] : '';
}

function readVersionField(body, label) {
  const values = readFieldValues(body, label);
  return values.length === 1 ? values[0].match(/^([0-9a-f]{40})$/i) : null;
}

function readTaskLevel(body) {
  const values = readFieldValues(body, '任务分级');
  return values.length === 1 ? values[0].match(/^(B级|A级|S级)$/) : null;
}

function isPassConclusion(value) {
  const conclusion = String(value || '').trim();
  return conclusion === '通过' || conclusion === '通过。';
}

function versionIsAncestor(version, descendant, isReviewVersionAncestor) {
  const value = String(version || '').toLowerCase();
  const target = String(descendant || '').toLowerCase();
  if (!value || !target) return false;
  if (value === target) return true;
  if (typeof isReviewVersionAncestor !== 'function') return false;
  const verdict = isReviewVersionAncestor(value, target);
  return verdict === true || (verdict && verdict.ancestor === true);
}

function readReviewCredential(comment, index, { identityPrefix } = {}) {
  const body = withoutCodeBlocks(comment?.body || '');
  const line = firstLine(body).trim();
  const reviewHeader = line.match(REVIEW_RE);
  const recheckHeader = line.match(RECHECK_RE);
  if (!reviewHeader && !recheckHeader) return null;

  const tag = reviewHeader ? 'REVIEW' : 'RECHECK';
  const header = reviewHeader || recheckHeader;
  const versionLabel = tag === 'REVIEW' ? '审查版本' : '复核版本';
  return {
    comment,
    index,
    tag,
    status: header[1],
    hasIdentity: hasAgentIdentity(body, identityPrefix),
    taskLevel: readTaskLevel(body),
    reviewVersion: readVersionField(body, versionLabel),
    versionLabel,
    conclusion: readField(body, '结论'),
  };
}

function unique(values) {
  return Array.from(new Set(values));
}

function credentialErrors(credential, { expectedHead, taskLevel, isReviewVersionAncestor }) {
  const prefix = `评论 ${credential.index + 1}${credential.comment?.author ? `（${credential.comment.author}）` : ''}`;
  const errors = [];
  if (!credential.hasIdentity) {
    errors.push(`${prefix} 的 ${credential.tag} 缺少“评论者：<项目>-<模型ID>”身份首行。`);
  }
  if (!credential.taskLevel) {
    errors.push(`${prefix} 的 ${credential.tag} 缺少合法“任务分级：B级 / A级 / S级”事实。`);
  } else if (credential.taskLevel[1] !== taskLevel) {
    errors.push(`${prefix} 的 ${credential.tag} 任务分级必须与 PR 的 ${taskLevel} 一致。`);
  }
  if (!credential.reviewVersion) {
    errors.push(`${prefix} 的 ${credential.tag} 缺少 40 位 commit SHA“${credential.versionLabel}：...”事实。`);
  } else if (!versionIsAncestor(credential.reviewVersion[1], expectedHead, isReviewVersionAncestor)) {
    errors.push(`${prefix} 的 ${credential.tag} 版本不适用于当前 PR head ${expectedHead}。`);
  }
  if (credential.status === 'PASS' && !isPassConclusion(credential.conclusion)) {
    errors.push(`${prefix} 的 [${credential.tag}][PASS] 必须写“结论：通过”。`);
  } else if (!credential.conclusion) {
    errors.push(`${prefix} 的 ${credential.tag} 缺少唯一且非空的“结论”字段。`);
  }
  return errors;
}

function checkCurrentHeadReview(comments, {
  expectedHead = '',
  taskLevel = '',
  isReviewVersionAncestor,
  identityPrefix,
} = {}) {
  if (taskLevel === 'B级') return [];
  if (!['A级', 'S级'].includes(taskLevel)) return [];
  if (!/^[0-9a-f]{40}$/i.test(expectedHead)) {
    return ['缺少当前 PR head，无法校验独立复核评论。'];
  }

  const credentials = comments
    .map((comment, index) => readReviewCredential(comment, index, { identityPrefix }))
    .filter(Boolean);
  const passes = credentials.filter(({ status }) => status === 'PASS');
  const missingPass = `${taskLevel} PR 必须存在适用于当前 PR head ${expectedHead} 的独立通过凭据。`;
  if (passes.length === 0) return [missingPass];

  const candidateErrors = [];
  for (const credential of passes) {
    const errors = credentialErrors(credential, { expectedHead, taskLevel, isReviewVersionAncestor });
    if (errors.length === 0) return [];
    candidateErrors.push(...errors);
  }

  return unique([...candidateErrors, missingPass]);
}

function main(argv = process.argv.slice(2), config = installedProjectConfig()) {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    console.log(`用法：node ${path.relative(process.cwd(), process.argv[1])} --body <评论.md> --manifest <manifest.json>
  --readback <评论.json> --comment-url <URL>  同时核对已保存的 GitHub issue comment 回读
  -h, --help                                显示帮助
只校验 REVIEW / RECHECK 的直接字段和正文一致性，不判断 RR 闭环或发布权限。`);
    return;
  }
  try {
    const args = {};
    const allowed = new Set(['--body', '--manifest', '--readback', '--comment-url']);
    for (let i = 0; i < argv.length; i += 2) {
      if (!allowed.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--') || args[argv[i]]) {
        throw new Error(`参数无效或重复：${argv[i]}；用 --help 查看用法。`);
      }
      args[argv[i]] = argv[i + 1];
    }
    if (!args['--body'] || !args['--manifest']) throw new Error('需要 --body 和 --manifest；用 --help 查看用法。');
    if (Boolean(args['--readback']) !== Boolean(args['--comment-url'])) {
      throw new Error('--readback 与 --comment-url 必须一起提供。');
    }
    const fs = require('node:fs');
    const manifest = JSON.parse(fs.readFileSync(args['--manifest'], 'utf8'));
    if (!['review', 'publish'].includes(manifest?.mode)) throw new Error('需要 review 或 publish 模式的取证快照。');
    if (!Array.isArray(manifest.gaps) || manifest.gaps.length) throw new Error('取证快照存在或未声明证据缺口。');
    const head = manifest.metadata?.headRefOid;
    const grade = manifest.context?.grade;
    if (!/^[0-9a-f]{40}$/i.test(head || '')) throw new Error('取证快照缺少合法的 PR head。');
    if (!['B级', 'A级', 'S级'].includes(grade)) throw new Error('取证快照缺少合法任务分级。');
    const body = fs.readFileSync(args['--body'], 'utf8');
    const credential = readReviewCredential({ body }, 0, { identityPrefix: config.commentIdentityPrefix });
    if (!credential) throw new Error('正文必须使用受支持的 REVIEW 或 RECHECK 头。');
    const errors = credentialErrors(credential, { expectedHead: head, taskLevel: grade });
    if (errors.length) throw new Error(errors.join('\n'));
    if (args['--readback']) {
      const comment = JSON.parse(fs.readFileSync(args['--readback'], 'utf8'));
      const target = new URL(args['--comment-url']);
      const pr = new URL(manifest.metadata.url);
      const prPath = `/${manifest.repo}/pull/${manifest.pr}`;
      if (pr.pathname !== prPath || target.origin !== pr.origin || target.search
        || ![prPath, prPath.replace('/pull/', '/issues/')].includes(target.pathname)) {
        throw new Error('评论 URL 不属于快照中的目标 PR。');
      }
      const id = target.hash.match(/^#issuecomment-([1-9]\d*)$/)?.[1];
      if (!id || String(comment.id) !== id || comment.html_url !== args['--comment-url']) {
        throw new Error('回读评论与指定评论 URL / id 不一致。');
      }
      if (comment.body !== body) throw new Error('回读正文与本地正文不一致。');
    }
    console.log(JSON.stringify({
      valid: true, tag: credential.tag, status: credential.status, head, grade,
      ...(args['--readback'] ? { commentUrl: args['--comment-url'] } : {}),
    }));
  } catch (error) {
    console.error(`评论校验失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  checkCurrentHeadReview,
  main,
  readReviewCredential,
  versionIsAncestor,
};
