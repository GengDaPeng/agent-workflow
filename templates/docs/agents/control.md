# 主控与通信参数

`project-control` 与 `agent-message` 的项目参数。不用主控的项目可以不建本文件。

| 参数 | 本项目取值 | 缺省 |
|---|---|---|
| 进度真相源 | `<GitHub Project 链接 / Milestone>` | — |
| 路线校验 | `<路线图文档>` | 无 |
| 任务入口 | Open Issue 的唯一置顶 `[TASK-CARD]` 评论链接 `task_url` | 同左 |
| 任务编号 | 与 `.agents/project.json` 的 `taskIdPattern` 一致 | 至少三段，形如 `WEB-AUTH-12` |
| 任务卡校验 | `node .agents/skills/project-control/scripts/task-card-check.js --task-url "<task_url>"` | 同左 |
| 派发命令 | `<生成开工指令的命令>` | — |
| 立卡状态同步 | `<立卡后改哪些标签、Project 字段>` | — |
| 合并授权 | `<持续授权 / 逐个 PR 请示用户>` | 逐个 PR 请示用户 |
| 运行清单 | `<主控记录在跑会话的位置>` | — |
| 技术裁决格式 | `[CONTROLLER-RULING]` 附业内对照 | — |
| 用户裁决门 | `<哪些事必须用户定>` | 需求范围、功能增减、核心业务模型、长期维护责任 |
| 子代理与执行会话模型 | `<模型与思考深度>` | — |
| 审查方式与停止边界 | 分级与复核按 `pr-review`；修复停止线按 `task-closure`，轮次上限见 [git.md](git.md) | 同左 |
