# Issue 参数

`triage`、`to-tickets`、`wayfinder`、`two-axis-code-review` 的项目参数。标签见 [triage-labels.md](triage-labels.md)。

| 参数 | 本项目取值 | 缺省 |
|---|---|---|
| 新建 | `gh issue create --title "<任务>" --body-file <文件> --label status:triage --label <类型>` | 同左 |
| 读取 | `gh issue view <n> --json number,title,body,labels,comments,state,stateReason` | 同左 |
| 父子与阻断关系 | GitHub 原生 sub-issue 与 `blockedBy` / `blocking`（`gh issue edit --parent / --add-blocked-by`） | 同左；正文不写关系副本 |
| 发布后回读 | `parent`、`subIssues`、`blockedBy`、`blocking` | 同左 |
| 发布后交给谁、停在什么状态 | `status:triage`，等用户或主控接受 | 同左 |
| 关闭 | 先评论原因，再 `gh issue close <n> --reason "completed\|not planned\|duplicate"` | 同左 |
| 阻断满足条件 | 阻断方以 `completed` 关闭 | 同左 |
| 评论身份行 | 与 [git.md](git.md) 一致 | `评论者：<模型ID>` |
| 执行合同 | 置顶 `[TASK-CARD]` 评论；没有时用 Issue 正文 | Issue 正文 |
| 审查取 Spec 的顺序 | 用户给的验收依据 → PR Context → 任务卡 → 提交说明引用的 Issue | 同左 |
| 外部 PR | 作者没有仓库写权限的 PR，只在用户点名时 triage | 同左 |
| 未定方向 | 交用户决定去 Discussion 还是 Issue | 同左 |
| Wayfinder 认领账号 | `<GitHub 用户名>` | 当前 `gh` 登录账号 |
