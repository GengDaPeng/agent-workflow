#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkPrContext, parseTaskCommentUrl } = require('../../pr-delivery/scripts/pr-body-check');
const { installedProjectConfig, splitCommand } = require('../../pr-delivery/scripts/project-config');

const MODES = new Set(['diagnose', 'review', 'handoff', 'publish']);
const FOCUSES = new Set(['ci', 'comments', 'context', 'scope', 'ready']);
const REVIEW_FIELDS = [
  'number', 'title', 'body', 'state', 'isDraft', 'url', 'headRefName', 'headRefOid',
  'baseRefName', 'baseRefOid', 'changedFiles', 'additions', 'deletions', 'author',
  'mergeStateStatus', 'statusCheckRollup', 'reviewDecision',
].join(',');
const CONSISTENCY_FIELDS = [
  'body', 'headRefName', 'headRefOid', 'baseRefName', 'baseRefOid', 'changedFiles',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`不支持的位置参数：${item}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`参数 ${item} 缺少值。`);
    args[item.slice(2)] = value;
    index += 1;
  }
  const allowed = new Set(['pr', 'mode', 'focus', 'repo', 'out-dir', 'previous', 'local-fallback']);
  const unknown = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`不支持的参数：${unknown.map((key) => `--${key}`).join(', ')}`);
  if (!/^[1-9]\d*$/.test(args.pr || '')) throw new Error('缺少有效的 --pr <number>。');
  if (!MODES.has(args.mode)) throw new Error('--mode 必须是 diagnose、review、handoff 或 publish。');
  if (args.focus && !FOCUSES.has(args.focus)) throw new Error('--focus 必须是 ci、comments、context、scope 或 ready。');
  if (args.mode !== 'diagnose' && args.focus) throw new Error('--focus 只用于 diagnose。');
  if (args['local-fallback'] && !/^(true|false)$/.test(args['local-fallback'])) {
    throw new Error('--local-fallback 必须是 true 或 false。');
  }
  return args;
}

function collectionPlan(mode, focus = '') {
  if (mode === 'diagnose') {
    return ['metadata', ...({ ci: ['ci'], comments: ['state'], context: ['context'], scope: ['diff'], ready: ['ready'] }[focus] || [])];
  }
  if (mode === 'review') return ['metadata', 'worktree', 'context', 'diff', 'state'];
  return ['metadata', 'context', 'state'];
}

function command(program, args, cwd) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} 失败：${String(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout || '';
}

function jsonCommand(program, args, cwd) {
  const output = command(program, args, cwd);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${program} ${args.join(' ')} 返回了无效 JSON。`);
  }
}

function writeArtifact(outDir, name, value) {
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(outDir, name), content, 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function containsNestedThreadPagination(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.comments?.pageInfo?.hasNextPage === true) return true;
  return Object.values(value).some(containsNestedThreadPagination);
}

function hasIncompleteThreadPages(value) {
  const pages = Array.isArray(value) ? value : [value];
  const last = pages.filter(Boolean).at(-1);
  return last?.data?.repository?.pullRequest?.reviewThreads?.pageInfo?.hasNextPage === true;
}

function failedChecks(statusCheckRollup) {
  const failed = new Set(['ACTION_REQUIRED', 'CANCELLED', 'ERROR', 'FAILURE', 'STALE', 'STARTUP_FAILURE', 'TIMED_OUT']);
  return (Array.isArray(statusCheckRollup) ? statusCheckRollup : [])
    .filter((check) => failed.has(String(check.conclusion || check.state || '').toUpperCase()));
}

function actionRunId(url) {
  return String(url || '').match(/\/actions\/runs\/([1-9]\d*)/)?.[1] || '';
}

function evidenceGaps(evidence) {
  const gaps = [];
  if (evidence.metadata && evidence.changedFiles
    && evidence.changedFiles.length !== evidence.metadata.changedFiles) {
    gaps.push(`分页文件数 ${evidence.changedFiles.length} 与 metadata.changedFiles ${evidence.metadata.changedFiles} 不一致。`);
  }
  if (evidence.taskCard && evidence.taskComment
    && (String(evidence.taskCard.commentId) !== String(evidence.taskComment.id)
      || evidence.taskCard.updatedAt !== evidence.taskComment.updated_at)) {
    gaps.push('任务卡 artifact 与评论正文不是同一版本。');
  }
  if (evidence.reviewThreadPages && containsNestedThreadPagination(evidence.reviewThreadPages)) {
    gaps.push('至少一个 review thread 的评论仍有未收集分页。');
  }
  if (evidence.reviewThreadPages && hasIncompleteThreadPages(evidence.reviewThreadPages)) {
    gaps.push('review thread 列表仍有未收集分页。');
  }
  if (evidence.worktree) {
    if (evidence.worktree.branch !== evidence.metadata.headRefName) gaps.push('审查 worktree 分支与 PR headRefName 不一致。');
    if (evidence.worktree.head !== evidence.metadata.headRefOid) gaps.push('审查 worktree HEAD 与 PR headRefOid 不一致。');
    if (evidence.worktree.status.trim()) gaps.push('审查 worktree 不 clean。');
  }
  if (evidence.ready?.skipped) gaps.push(evidence.ready.skipped);
  if (evidence.ciGaps) gaps.push(...evidence.ciGaps);
  return gaps;
}

function compareSnapshots(previous, current) {
  const changed = [];
  if (previous?.metadata?.headRefOid !== current?.metadata?.headRefOid) changed.push('head');
  const previousContext = previous?.context || previous?.task;
  const currentContext = current?.context || current?.task;
  if (previousContext && currentContext && JSON.stringify(previousContext) !== JSON.stringify(currentContext)) changed.push('context');
  if (previous?.stateFingerprint && current?.stateFingerprint
    && previous.stateFingerprint !== current.stateFingerprint) changed.push('state');
  return changed;
}

function reviewStateFingerprint(metadata, commentsFingerprint) {
  return sha256(JSON.stringify({
    state: metadata.state,
    isDraft: metadata.isDraft,
    mergeStateStatus: metadata.mergeStateStatus,
    statusCheckRollup: metadata.statusCheckRollup,
    reviewDecision: metadata.reviewDecision,
    commentsFingerprint,
  }));
}

function metadataDriftFields(before, after) {
  return CONSISTENCY_FIELDS.filter((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]));
}

function contextSnapshotDriftFields(before, after) {
  if (!before || !after) return ['context'];
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function previousSnapshotGaps(previous, current) {
  const gaps = [];
  if (previous?.mode !== 'review') gaps.push('原快照不是内容审查模式。');
  if (previous?.repo !== current.repo || previous?.pr !== current.pr) gaps.push('原快照不属于当前 PR。');
  if (!previous?.metadata?.headRefOid || !(previous?.context || previous?.task) || !previous?.stateFingerprint) {
    gaps.push('原快照缺少 head、Context 或评论状态证据。');
  }
  if (!Array.isArray(previous?.gaps) || previous.gaps.length) gaps.push('原快照自身存在证据缺口。');
  if (!Array.isArray(previous?.collectionDrift) || previous.collectionDrift.length) {
    gaps.push('原快照未通过末次 metadata 一致性复核。');
  }
  return gaps;
}

function repositoryRoot() {
  return command('git', ['rev-parse', '--show-toplevel'], process.cwd()).trim();
}

// 只做正文解析与任务评论 URL 归属校验；任务卡的置顶、Issue 状态等由项目 Ready 检查负责。
function collectContext({ metadata, repo, outDir, gh, artifactPrefix = '' }) {
  const checked = checkPrContext({ body: metadata.body, repository: repo });
  if (checked.errors.length) throw new Error(checked.errors.join('；'));
  let context = checked.context;
  if (context.source === 'discussion') {
    writeArtifact(outDir, `${artifactPrefix}context.json`, context);
    return {
      summary: {
        contract: 'discussion-context',
        baseRefOid: metadata.baseRefOid,
        source: context.source,
        grade: context.grade,
        contentHash: context.contentHash,
      },
      context,
    };
  }
  const { issueNumber, commentId } = parseTaskCommentUrl(context.reference);
  const comment = JSON.parse(gh(['api', `repos/${repo}/issues/comments/${commentId}`]));
  context = { ...context, issueNumber, commentId, updatedAt: comment.updated_at };
  writeArtifact(outDir, `${artifactPrefix}context.json`, context);
  writeArtifact(outDir, `${artifactPrefix}task-card.json`, context);
  writeArtifact(outDir, `${artifactPrefix}task-card-comment.json`, comment);
  return {
    summary: {
      contract: 'task-comment-url',
      baseRefOid: metadata.baseRefOid,
      source: context.source,
      reference: context.reference,
      grade: context.grade,
      commentId: String(context.commentId),
      updatedAt: context.updatedAt,
      contentHash: sha256(String(comment.body || '')),
    },
    context,
    taskCard: context,
    taskComment: comment,
  };
}

function flattenGhPages(value) {
  return Array.isArray(value) ? value.flatMap((page) => Array.isArray(page) ? page : [page]) : [];
}

function collectDiff({ metadata, repo, root, outDir, pr, gh, localFallback, config }) {
  try {
    const diff = gh(['pr', 'diff', pr, '--repo', repo]);
    const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/pulls/${pr}/files?per_page=100`]));
    const changedFiles = flattenGhPages(pages).map((file) => file.filename);
    writeArtifact(outDir, 'pr.diff', diff);
    writeArtifact(outDir, 'changed-files.txt', `${changedFiles.join('\n')}${changedFiles.length ? '\n' : ''}`);
    return { changedFiles, source: 'github' };
  } catch (error) {
    if (!localFallback) throw error;
    const prefix = `refs/remotes/origin/pr-review/${pr}`;
    const [git, ...wrapperArgs] = splitCommand(config.gitWrapper || 'git');
    command(git, [...wrapperArgs, 'fetch', 'origin',
      `${metadata.baseRefName}:${prefix}/base`, `pull/${pr}/head:${prefix}/head`], root);
    const remoteHead = command('git', ['rev-parse', `${prefix}/head`], root).trim();
    if (remoteHead !== metadata.headRefOid) throw new Error('本地回退取得的远端 head 与固定 headRefOid 不一致。');
    command('git', ['cat-file', '-e', `${metadata.baseRefOid}^{commit}`], root);
    command('git', ['cat-file', '-e', `${metadata.headRefOid}^{commit}`], root);
    const range = `${metadata.baseRefOid}...${metadata.headRefOid}`;
    const diff = command('git', ['diff', range], root);
    const names = command('git', ['-c', 'core.quotePath=false', 'diff', '--name-only', range], root);
    const changedFiles = names.split(/\r?\n/).filter(Boolean);
    writeArtifact(outDir, 'pr.diff', diff);
    writeArtifact(outDir, 'changed-files.txt', names);
    return { changedFiles, source: 'local-fallback' };
  }
}

function collectState({ repo, outDir, pr, gh, artifactPrefix = '' }) {
  const issueRaw = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments?per_page=100`]);
  const reviewsRaw = gh(['api', '--paginate', '--slurp', `repos/${repo}/pulls/${pr}/reviews?per_page=100`]);
  const query = 'query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$endCursor){nodes{id isResolved comments(first:100){nodes{id databaseId url path line body author{login}}pageInfo{hasNextPage endCursor}}}pageInfo{hasNextPage endCursor}}}}}';
  const [owner, name] = repo.split('/');
  const threadsRaw = gh(['api', 'graphql', '--paginate', '--slurp', '-f', `query=${query}`,
    '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${pr}`]);
  writeArtifact(outDir, `${artifactPrefix}issue-comments-pages.json`, issueRaw);
  writeArtifact(outDir, `${artifactPrefix}reviews-pages.json`, reviewsRaw);
  writeArtifact(outDir, `${artifactPrefix}review-threads-pages.json`, threadsRaw);
  return {
    reviewThreadPages: JSON.parse(threadsRaw),
    fingerprint: sha256(`${issueRaw}\n${reviewsRaw}\n${threadsRaw}`),
  };
}

function collectWorktree(root) {
  return {
    root,
    branch: command('git', ['branch', '--show-current'], root).trim(),
    head: command('git', ['rev-parse', 'HEAD'], root).trim(),
    status: command('git', ['status', '--short'], root),
    list: command('git', ['worktree', 'list', '--porcelain'], root),
  };
}

/** 返回完整命令行：项目配置了 readyCheck 模板就按模板（{pr} 替换为 PR 号），否则用共享 ready-check.js。 */
function readyCheckArgs(pr, repo, config = {}) {
  if (config.readyCheck) return splitCommand(config.readyCheck.split('{pr}').join(pr));
  const args = [process.execPath, path.join(__dirname, 'ready-check.js'), '--pr', pr];
  if (repo) args.push('--repo', repo);
  return args;
}

function collectReady({ metadata, root, pr, repo, config }) {
  const head = command('git', ['rev-parse', 'HEAD'], root).trim();
  if (head !== metadata.headRefOid) return { skipped: '当前 worktree HEAD 不对应 PR head；未运行本地 Ready gate。' };
  const [program, ...args] = readyCheckArgs(pr, repo, config);
  const result = spawnSync(program, args, {
    cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function collectCi({ metadata, repo, outDir, gh }) {
  const failed = failedChecks(metadata.statusCheckRollup);
  const runIds = [...new Set(failed.map((check) => actionRunId(check.detailsUrl || check.targetUrl)).filter(Boolean))];
  const gaps = [];
  const logs = [];
  for (const runId of runIds) {
    try {
      const log = gh(['run', 'view', runId, '--repo', repo, '--log-failed']);
      if (!log.trim()) gaps.push(`GitHub Actions run ${runId} 未返回失败日志。`);
      logs.push(`===== run ${runId} =====\n${log}`);
    } catch (error) {
      gaps.push(error.message);
    }
  }
  for (const check of failed.filter((item) => !actionRunId(item.detailsUrl || item.targetUrl))) {
    gaps.push(`外部 CI 失败原文未自动取得：${check.name || 'unknown'} ${check.detailsUrl || check.targetUrl || '无详情链接'}`);
  }
  writeArtifact(outDir, 'failed-checks.json', failed);
  writeArtifact(outDir, 'failed-run-logs.txt', logs.join('\n'));
  return { failedChecks: failed.length, actionRuns: runIds, gaps };
}

function collect(args) {
  const root = repositoryRoot();
  const config = installedProjectConfig();
  const pr = args.pr;
  const repo = args.repo || config.repository
    || jsonCommand('gh', ['repo', 'view', '--json', 'nameWithOwner'], root).nameWithOwner;
  const outDir = args['out-dir']
    ? path.resolve(args['out-dir'])
    : fs.mkdtempSync(path.join(os.tmpdir(), `pr-review-${pr}.`));
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) throw new Error(`输出目录不是空目录：${outDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  const gh = (ghArgs) => command('gh', ghArgs, root);
  const metadata = JSON.parse(gh(['pr', 'view', pr, '--repo', repo, '--json', REVIEW_FIELDS]));
  writeArtifact(outDir, 'metadata.json', metadata);

  const plan = collectionPlan(args.mode, args.focus);
  const evidence = { metadata };
  const manifest = { version: 1, mode: args.mode, focus: args.focus || null, repo, pr: Number(pr), outDir, metadata, plan, gaps: [] };
  const attempt = (label, action) => {
    try { action(); }
    catch (error) { manifest.gaps.push(`${label}：${error.message}`); }
  };
  if (plan.includes('worktree')) {
    attempt('worktree', () => {
      evidence.worktree = collectWorktree(root);
      manifest.worktree = evidence.worktree;
      writeArtifact(outDir, 'worktree.json', evidence.worktree);
    });
    manifest.gaps.push(...evidenceGaps(evidence));
    if (manifest.gaps.length) {
      writeArtifact(outDir, 'manifest.json', manifest);
      return manifest;
    }
  }
  if (plan.includes('context')) {
    attempt('PR Context', () => {
      const context = collectContext({ metadata, repo, outDir, gh });
      manifest.context = context.summary;
      Object.assign(evidence, context);
    });
  }
  if (plan.includes('diff')) {
    attempt('diff', () => {
      const diff = collectDiff({ metadata, repo, root, outDir, pr, gh, localFallback: args['local-fallback'] === 'true', config });
      evidence.changedFiles = diff.changedFiles;
      manifest.diff = { source: diff.source, changedFiles: diff.changedFiles.length };
    });
  }
  if (plan.includes('state')) {
    attempt('评论状态', () => {
      const state = collectState({ repo, outDir, pr, gh });
      evidence.reviewThreadPages = state.reviewThreadPages;
      evidence.commentsFingerprint = state.fingerprint;
      manifest.stateFingerprint = reviewStateFingerprint(metadata, state.fingerprint);
    });
  }
  if (plan.includes('ready')) {
    attempt('Ready gate', () => {
      evidence.ready = collectReady({ metadata, root, pr, repo, config });
      manifest.ready = evidence.ready;
      writeArtifact(outDir, 'ready-check.json', manifest.ready);
    });
  }
  if (plan.includes('ci')) {
    attempt('CI 原文', () => {
      const ci = collectCi({ metadata, repo, outDir, gh });
      evidence.ciGaps = ci.gaps;
      manifest.ci = { failedChecks: ci.failedChecks, actionRuns: ci.actionRuns };
    });
  }
  let finalMetadata = metadata;
  if (plan.length > 1) {
    attempt('末次 metadata', () => {
      const stateStartMetadata = JSON.parse(gh(['pr', 'view', pr, '--repo', repo, '--json', REVIEW_FIELDS]));
      writeArtifact(outDir, 'final-metadata.json', stateStartMetadata);
      finalMetadata = stateStartMetadata;
      if (evidence.commentsFingerprint) {
        const initialFingerprint = evidence.commentsFingerprint;
        const finalState = collectState({ repo, outDir, pr, gh, artifactPrefix: 'final-' });
        finalMetadata = JSON.parse(gh(['pr', 'view', pr, '--repo', repo, '--json', REVIEW_FIELDS]));
        writeArtifact(outDir, 'post-state-metadata.json', finalMetadata);
        evidence.reviewThreadPages = finalState.reviewThreadPages;
        evidence.commentsFingerprint = finalState.fingerprint;
        manifest.stateFingerprint = reviewStateFingerprint(finalMetadata, finalState.fingerprint);
        manifest.collectionStateDrift = initialFingerprint !== finalState.fingerprint;
        manifest.collectionStateMetadataDrift = metadataDriftFields(stateStartMetadata, finalMetadata);
        if (manifest.collectionStateDrift) {
          manifest.gaps.push('取证期间评论或 review thread 状态已变化；重新运行当前模式。');
        }
        if (manifest.collectionStateMetadataDrift.length) {
          manifest.gaps.push(`末次评论状态取证期间 PR metadata 已变化：${manifest.collectionStateMetadataDrift.join(', ')}。`);
        }
      }
      manifest.collectionDrift = metadataDriftFields(metadata, finalMetadata);
      manifest.metadata = finalMetadata;
      if (manifest.collectionDrift.length) {
        manifest.gaps.push(`取证期间 PR metadata 已变化：${manifest.collectionDrift.join(', ')}。`);
      }
      if (plan.includes('ci')
        && JSON.stringify(metadata.statusCheckRollup) !== JSON.stringify(finalMetadata.statusCheckRollup)) {
        manifest.gaps.push('取证期间 CI 状态已变化；重新运行 CI 诊断。');
      }
    });
  }
  if (plan.length > 1 && plan.includes('context')) {
    attempt('末次 PR Context', () => {
      const initialContext = manifest.context;
      const finalContext = collectContext({
        metadata: finalMetadata,
        repo,
        outDir,
        gh,
        artifactPrefix: 'final-',
      });
      const contextDrift = contextSnapshotDriftFields(initialContext, finalContext.summary);
      manifest.collectionContextDrift = contextDrift;
      if (contextDrift.length) {
        manifest.gaps.push(`取证期间 Context 已变化：${contextDrift.join(', ')}；重新运行当前模式。`);
      }
      manifest.context = finalContext.summary;
      Object.assign(evidence, finalContext);

      const postTaskMetadata = JSON.parse(gh(['pr', 'view', pr, '--repo', repo, '--json', REVIEW_FIELDS]));
      writeArtifact(outDir, 'post-context-metadata.json', postTaskMetadata);
      const postTaskDrift = metadataDriftFields(finalMetadata, postTaskMetadata);
      if (postTaskDrift.length) {
        manifest.gaps.push(`末次 Context 取证期间 PR metadata 已变化：${postTaskDrift.join(', ')}。`);
      }
      finalMetadata = postTaskMetadata;
      manifest.collectionDrift = metadataDriftFields(metadata, finalMetadata);
      manifest.metadata = finalMetadata;
    });
  }
  manifest.gaps.push(...evidenceGaps(evidence));
  if (args.mode === 'publish') {
    if (!args.previous) manifest.gaps.push('发布复核缺少 --previous <原 manifest.json>。');
    else attempt('发布快照比较', () => {
      const previous = JSON.parse(fs.readFileSync(args.previous, 'utf8'));
      const baselineGaps = previousSnapshotGaps(previous, manifest);
      if (baselineGaps.length) {
        manifest.gaps.push(...baselineGaps.map((gap) => `发布基线：${gap}`));
        return;
      }
      manifest.changedSincePrevious = compareSnapshots(previous, manifest);
    });
  }
  writeArtifact(outDir, 'manifest.json', manifest);
  return manifest;
}

function buildDecisionSummary(manifest) {
  return {
    pr: manifest.pr,
    mode: manifest.mode,
    head: String(manifest.metadata?.headRefOid || ''),
    context: manifest.context?.contract || null,
    grade: manifest.context?.grade || null,
    gaps: manifest.gaps,
    ...(Array.isArray(manifest.changedSincePrevious)
      ? { changedSincePrevious: manifest.changedSincePrevious }
      : {}),
    manifest: path.join(manifest.outDir, 'manifest.json'),
  };
}

function main() {
  try {
    const manifest = collect(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(buildDecisionSummary(manifest))}\n`);
    process.exit(manifest.gaps.length ? 2 : 0);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  buildDecisionSummary,
  collectionPlan,
  compareSnapshots,
  evidenceGaps,
  actionRunId,
  failedChecks,
  hasIncompleteThreadPages,
  metadataDriftFields,
  previousSnapshotGaps,
  readyCheckArgs,
  reviewStateFingerprint,
  contextSnapshotDriftFields,
};
