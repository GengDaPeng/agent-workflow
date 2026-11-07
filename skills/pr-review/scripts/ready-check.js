#!/usr/bin/env node

/**
 * 作用：轻量 Ready 检查，判断 PR 的 live 状态能否转 Ready / 合并。
 * 依次检查：live PR 正文过正文核心；同级装了 project-control 时校验 task-card 来源的置顶任务卡（与审查取证一致）；
 * current head 有 REVIEW / RECHECK PASS 凭据；
 * statusCheckRollup 全绿；mergeable；Draft 规则（--allow-draft 只放行 A级 / S级草稿）。
 * 边界：不跑测试、不复用 CI 证据、不读 diff；项目有更重的 Ready 门禁时在 .agents/project.json 配 readyCheck。
 * 信任模型：评论身份行由作者自己声明，用于区分代理，不作为安全边界；本检查防代理失误，不防恶意作者。
 * 用法：node ready-check.js --pr <number> [--repo owner/name] [--allow-draft]
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkPrBody, checkPrContext } = require('../../pr-delivery/scripts/pr-body-check');
const { installedProjectConfig, resolveRepository } = require('../../pr-delivery/scripts/project-config');
const { checkCurrentHeadReview } = require('./pr-comments-check');

const READY_FIELDS = 'body,isDraft,headRefOid,mergeable,statusCheckRollup,comments';
const GREEN = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const TASK_CARD_CHECK = path.join(__dirname, '../../project-control/scripts/task-card-check.js');

function defaultGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function gitIsAncestor(version, head) {
  return spawnSync('git', ['merge-base', '--is-ancestor', version, head], { stdio: 'ignore' }).status === 0;
}

function checkStatusChecks(rollup) {
  return (Array.isArray(rollup) ? rollup : []).flatMap((check) => {
    const result = String(check.conclusion || check.state || check.status || 'UNKNOWN').toUpperCase();
    return GREEN.has(result) ? [] : [`CI check ${check.name || check.context || 'unknown'} 状态为 ${result}。`];
  });
}

function checkMergeable(mergeable) {
  const state = String(mergeable || '').toUpperCase();
  return state === 'MERGEABLE' ? [] : [`当前 PR mergeable=${state || '(empty)'}；解决冲突或等 GitHub 算完后再转 Ready。`];
}

function checkReady(metadata, {
  repository, allowDraft = false, identityPrefix, isAncestor = gitIsAncestor, checkTaskCard, ghRunner,
} = {}) {
  const body = metadata.body || '';
  const parsed = checkPrContext({ body, repository });
  const card = checkTaskCard && parsed.context?.source === 'task-card'
    ? checkPrContext({ body, repository, checkTaskCard, ghRunner })
    : parsed;
  const grade = parsed.context?.grade || '';
  const canIgnoreDraft = allowDraft && (grade === 'A级' || grade === 'S级');
  const draft = metadata.isDraft === true && !canIgnoreDraft;
  const head = metadata.headRefOid || '';
  const comments = (metadata.comments || []).map((comment) => ({
    body: comment.body,
    author: comment.author?.login || comment.author || '',
  }));
  // 正文核心已包含 Context 解析错误，这里只补任务卡错误。
  return [
    ...checkPrBody({ body, draft, currentContext: card.context || parsed.context, repository }).errors,
    ...(card === parsed ? [] : card.errors),
    ...(grade ? checkCurrentHeadReview(comments, {
      expectedHead: head,
      taskLevel: grade,
      identityPrefix,
      isReviewVersionAncestor: (version) => isAncestor(version, head),
    }) : ['无法从 PR 正文 ## Context 确定分级（B级 / A级 / S级），不能判定独立复核要求。']),
    ...checkStatusChecks(metadata.statusCheckRollup),
    ...checkMergeable(metadata.mergeable),
    ...(draft ? ['正式 Ready 检查不接受草稿；A/S 转换前预检须显式使用 --allow-draft。'] : []),
  ];
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--allow-draft') { args.allowDraft = true; continue; }
    if (!['--pr', '--repo'].includes(argv[i]) || !argv[i + 1]) throw new Error(`参数无效：${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  if (!/^[1-9]\d*$/.test(args.pr || '')) throw new Error('缺少有效的 --pr <number>。');
  return args;
}

function main(argv = process.argv.slice(2), {
  gh = defaultGh, config = installedProjectConfig(), isAncestor, taskCardCheck = TASK_CARD_CHECK,
} = {}) {
  try {
    const args = parseArgs(argv);
    const repository = resolveRepository(args.repo, config, gh);
    const view = gh(['pr', 'view', args.pr, '--repo', repository, '--json', READY_FIELDS]);
    if (view.status !== 0) throw new Error(`无法读取 PR：${view.stderr.trim()}`);
    const taskCards = fs.existsSync(taskCardCheck) ? require(taskCardCheck) : null;
    const errors = checkReady(JSON.parse(view.stdout), {
      repository, allowDraft: args.allowDraft, identityPrefix: config.commentIdentityPrefix, isAncestor,
      ...(taskCards ? {
        checkTaskCard: (input) => taskCards.checkCurrentTaskCard({ ...input, taskIdPattern: config.taskIdPattern }),
        ghRunner: gh,
      } : {}),
    });
    if (errors.length) {
      console.error(`ready 检查失败：\n${errors.map((error) => `- ${error}`).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    console.log('ready 检查通过。');
  } catch (error) {
    console.error(`ready 检查失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { checkMergeable, checkReady, checkStatusChecks, main };
