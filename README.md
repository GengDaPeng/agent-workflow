# agent-workflow

多个 AI 代理（Codex、Claude Code 等）在 GitHub 上协作开发时共用的 Skill。

## 分层

| 层 | 放在哪 | 内容 |
|---|---|---|
| 通用层 | 本仓库 `skills/<name>/` | 协作约定与方法，正文不出现具体项目 |
| 项目参数 | 使用方仓库 `docs/agents/<name>.md` | 主线、命令、分级、责任方等取值 |
| 项目专属 | 使用方仓库 | 只对该项目成立的规则与门禁 |

Skill 开头会写明它读取哪个参数文件、需要哪些参数；参数文件缺的项按 Skill 默认值执行。

## 共享检查脚本

只带轻量检查，重型 CI 证据复用留在使用方仓库。脚本从使用方仓库根的 `.agents/project.json` 读机器参数，文件缺失时全部用默认值：

| 字段 | 缺省 | 说明 |
|---|---|---|
| `repository` | `gh repo view` | `owner/name` |
| `mainRef` | `origin/main` | 主线引用 |
| `gitWrapper` | `git` | 写公共 Git 目录时用的命令 |
| `commentIdentityPrefix` | 任意 `<项目>-<模型ID>` | 评论身份行前缀 |
| `taskIdPattern` | 通用任务编号正则 | 任务卡 Task 字段 |
| `readyCheck` | `pr-review/scripts/ready-check.js` | 项目自己的 Ready 命令模板，`{pr}` 替换为 PR 号 |

| 脚本 | 作用 |
|---|---|
| `pr-delivery/scripts/pr-body-check.js` | PR 正文必需段、Context、Verification、Merge Danger、Draft 与分级 |
| `pr-review/scripts/pr-comments-check.js` | REVIEW / RECHECK 评论字段与 current head 通过凭据 |
| `pr-review/scripts/ready-check.js` | 轻量 Ready：正文、通过凭据、检查全绿、可合并、Draft |
| `project-control/scripts/task-card-check.js` | 置顶任务卡校验与 artifact |
| `git-workflow/scripts/skills-lock-check.js` | 已安装 Skill 与 `skills-lock.json` 散列一致，可放进 pre-commit |

跨 Skill 依赖只有 `pr-review → pr-delivery`。本仓库自测：`npm test`。

## Skill

| Skill | 用途 |
|---|---|
| `git-workflow` | 工作区与分支、提交、PR、取证与 CI、审查闭环、Ready 与合并、回收与破坏性操作 |
| `tdd` | 测试先行实现，以及测试设计、验证执行与验证停止的判断 |
| `diagnosing-bugs` | 先建可复现的反馈环，再定位疑难 bug 与性能回归 |
| `codebase-design` | 设计深模块的共同词汇：模块、接口、seam、深度 |
| `domain-modeling` | 统一项目术语，维护词汇表和重要设计决策 |
| `wait-what` | 手动调用：让代理用更简单的话和项目术语重讲一遍 |
| `writing-for-agents` | 编写与审查 Skill、AGENTS.md 等代理指令，判断规则放在哪 |
| `triage` | 手动调用：核实并分流 Issue 与外部 PR |
| `to-tickets` | 把明确目标拆成带父子与阻断关系的可执行票 |
| `wayfinder` | 手动调用：把过大的想法拆成决策票地图，逐张解决 |
| `improve-codebase-architecture` | 手动调用：找出可加深的模块，出 HTML 报告后逐个讨论 |
| `two-axis-code-review` | 按规范与需求两条轴审查一段改动 |
| `pr-review` | 审查或诊断 live PR 的 current head；REVIEW / FIX-REPLY / RECHECK 评论协议 |
| `pr-delivery` | 创建或更新 PR、写正文、等 CI、修交付门禁、转 Ready |
| `implement` | 按任务实现或修复，处理审查发现并发 FIX-REPLY |
| `task-closure` | 判断发现项归属、根因修复范围、任务完成与修复停止线 |
| `agent-message` | 手动调用：独立会话之间按固定事件和模板通信 |
| `project-control` | 手动调用：受委托担任项目主控，安排、派发、决定与收尾 |
| `grilling` | 按决策树逐轮追问，直到双方理解一致 |
| `research` | 对照一手资料调研并标注出处 |
| `prototype` | 做一次性原型回答设计问题（逻辑或界面） |

## 致谢

`codebase-design`、`diagnosing-bugs`、`domain-modeling`、`tdd`、`wait-what`、`writing-for-agents`、`triage`、`to-tickets`、`wayfinder`、`improve-codebase-architecture`、`grilling`、`research`、`prototype` 派生自 [mattpocock/skills](https://github.com/mattpocock/skills)（MIT，许可见 [LICENSE.matt-pocock](LICENSE.matt-pocock)）；`two-axis-code-review` 由其 `code-review` 改造而来，`implement` 以其 `implement` 为骨架，`pr-delivery` 的 PR 正文写法改编自其 `pr`。`pr` 中 Summary 的视图清单出自 [Dex Horthy](https://github.com/dexhorthy) 的 [`show-me`](https://github.com/humanlayer/humanlayer)。

`git-workflow`、`pr-review`、`pr-delivery`、`task-closure`、`agent-message`、`project-control` 是本仓库在多代理协作中整理出的约定。
