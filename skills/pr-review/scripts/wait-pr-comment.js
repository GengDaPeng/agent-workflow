#!/usr/bin/env node

// 等 PR 上对方的结构化评论：有新评论输出 id/type/url 一行 JSON，原文由调用方按 id 读取。
const { execFile } = require('node:child_process');
const { promisify, parseArgs } = require('node:util');
const { setTimeout: sleep } = require('node:timers/promises');

const exec = promisify(execFile);
const TYPES = {
  developer: new Set(['REVIEW', 'RECHECK']),
  reviewer: new Set(['FIX-REPLY']),
};

function options() {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      role: { type: 'string' },
      repo: { type: 'string' },
      interval: { type: 'string', default: '30' },
      'after-comment': { type: 'string' },
      once: { type: 'boolean' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(`等 PR 上对方的结构化评论。developer 等 REVIEW/RECHECK，reviewer 等 FIX-REPLY。
用法：node wait-pr-comment.js --pr <编号> --role developer|reviewer [选项]
  --after-comment <ID>  只看该评论之后的（不填则只看启动后新增的）
  --once                收到一批就退出
  --timeout <分钟>      到期无新评论退出
  --interval <秒>       轮询间隔，默认 30
  --repo <owner/repo>   默认当前仓库
输出：每条新评论一行 {id,type,url}；原文用 gh api repos/<owner>/<repo>/issues/comments/<id> 读取。
退出码：0 有新评论或 PR 已合并/关闭；2 超时；1 出错。`);
    return null;
  }
  if (!/^[1-9]\d*$/.test(values.pr || '')) throw new Error('--pr 必须是正整数。');
  if (!Object.hasOwn(TYPES, values.role || '')) throw new Error('--role 必须是 developer 或 reviewer。');
  const seconds = Number(values.interval);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1000 > 2147483647) {
    throw new Error('--interval 必须是有效的正数秒数。');
  }
  if (values.repo && !/^[^/\s]+\/[^/\s]+$/.test(values.repo)) throw new Error('--repo 必须是 owner/repo。');
  if (values['after-comment'] && !/^[1-9]\d*$/.test(values['after-comment'])) {
    throw new Error('--after-comment 必须是正整数评论 ID。');
  }
  const minutes = values.timeout === undefined ? null : Number(values.timeout);
  if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0)) throw new Error('--timeout 必须是正数分钟。');
  return { ...values, intervalMs: seconds * 1000, deadline: minutes === null ? null : Date.now() + minutes * 60000 };
}

async function gh(args) {
  const { stdout } = await exec('gh', args, { timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function commentType(body) {
  // 只检查固定头部，避免把正文里引用的标签当成事件。
  const header = String(body || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 2);
  for (const line of header) {
    if (line === '[FIX-REPLY]') return 'FIX-REPLY';
    const match = line.match(/^\[(REVIEW|RECHECK)\]\[(?:MUST|PASS)\](?:\[RR-\d+\])*$/);
    if (match) return match[1];
  }
  return null;
}

async function main() {
  const args = options();
  if (!args) return;
  const repo = args.repo || (await gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  const seen = new Set();
  const after = args['after-comment'] ? BigInt(args['after-comment']) : null;
  let initialized = false;

  for (;;) {
    let pr;
    try {
      pr = await gh(['api', `repos/${repo}/pulls/${args.pr}`]);
      if (!initialized && (pr.merged_at || pr.state === 'closed')) {
        console.error(`PR #${args.pr} 已${pr.merged_at ? '合并' : '关闭'}，停止监听。`);
        return;
      }
      // --paginate + --slurp 读取全部页；这些是 PR 主评论区的 issue comments。
      const pages = await gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${args.pr}/comments?per_page=100`]);
      const comments = pages.flat();

      if (!initialized) {
        for (const comment of comments) {
          if (after === null || BigInt(comment.id) <= after) seen.add(String(comment.id));
        }
        initialized = true;
        console.error(`监听 ${repo}#${args.pr}；角色 ${args.role}；间隔 ${args.interval} 秒。`);
      }

      let reported = 0;
      for (const comment of comments) {
        const id = String(comment.id);
        if (seen.has(id)) continue;
        const type = commentType(comment.body);
        if (TYPES[args.role].has(type)) {
          process.stdout.write(`${JSON.stringify({
            id: comment.id,
            type,
            url: comment.html_url,
          })}\n`);
          reported++;
        }
        seen.add(id);
      }
      if (args.once && reported) return;
    } catch (error) {
      // 初始化失败时退出，避免重试建立基线时悄悄跳过期间的新回复。
      if (!initialized) throw error;
      console.error(`读取失败，${args.interval} 秒后重试：${error.message}`);
    }
    if (pr && (pr.merged_at || pr.state === 'closed')) {
      console.error(`PR #${args.pr} 已${pr.merged_at ? '合并' : '关闭'}，停止监听。`);
      return;
    }
    if (args.deadline !== null && Date.now() >= args.deadline) {
      console.error(`${args.timeout} 分钟内无新评论，停止等待。`);
      process.exitCode = 2;
      return;
    }
    await sleep(args.intervalMs);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
