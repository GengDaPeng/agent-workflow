# PR 取证

取证固定一条链：live PR → Context → 当前动作需要的 diff 或状态 → manifest → 结论。

- live PR 以 GitHub 返回的 `baseRefOid`、`headRefOid`、`changedFiles` 为准，不用本地分支、`HEAD` 或 worktree 内容代替。
- Context 只接受 `pr-delivery` 规定的两种来源，不接受裸任务编号。
- 多阶段取证结束时重读 metadata；body、head、base 或文件数变了，本轮证据作废。

用参数文件给出的取证命令；默认 `node <skill-dir>/scripts/collect-pr-context.js --pr <n> --mode <模式>`，可加 `--repo owner/repo`、`--out-dir <空目录>`。stdout 是一行 JSON 摘要，含 `head`、`context`、`grade`、`gaps`、`manifest`；需要完整证据时再读 manifest 和同目录产物。退出码 `0` 只表示机械证据完整，不表示审查通过或可合并；`2` 表示 `gaps` 非空，先报告缺口，不进入依赖它的下一步；`1` 是参数或环境错误。

| 模式 | 用于 | 完成于 |
|---|---|---|
| `diagnose` | 状态诊断。默认只取 metadata；直接失败指向哪类证据，就重跑并加一个 `--focus ci\|comments\|context\|scope\|ready` | 失败原文已保存，原因定位到 PR 内容、交付门禁、CI、评论、GitHub 状态或本地环境之一；定位不了时缺口已写明 |
| `review` | 内容审查。脚本先核验审查 worktree 与 PR head 一致且 clean | `gaps` 为空；开发已停写；Context 或用户指令足以约束范围；每个改动路径已归入一种审查方法或明确不审 |
| `handoff` | 修复交接，不读 diff | 来源 REVIEW、审查版本、current head、Context 版本、活动 RR、已有闭环证据、影响结论的未解决 thread 形成唯一状态 |
| `publish` | 发布前复核，加 `--previous <review manifest>` | head 未变；`context`、`state` 漂移已判断是否影响结论 |

- `publish` 发现 head 变了就停止发布，按“分级与复核”对新 head 重定范围；不把旧结论发到新 head 上。只是指纹变化时，不机械重审。
- 修复交接按来源 REVIEW 识别 RR，不脱离来源单看编号；影响结论的 inline finding 必须回链到结构化 REVIEW 的 RR。归一为：

  | 来源 REVIEW | 审查版本 | RR | 类型 | FIX-REPLY | RECHECK | 当前状态 |
  |---|---|---|---|---|---|---|

- GitHub diff 或文件分页取不到时，只有用户明确允许才加 `--local-fallback true`。回退只补 diff 和文件清单，补不了 PR body、CI 或评论证据。
- `gh` 失败按 `git-workflow` 的“证据与 CI”处理。
