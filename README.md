# agent-workflow

多个 AI 代理（Codex、Claude Code 等）在 GitHub 上协作开发时共用的 Skill。

## 分层

| 层 | 放在哪 | 内容 |
|---|---|---|
| 通用层 | 本仓库 `skills/<name>/` | 协作约定与方法，正文不出现具体项目 |
| 项目参数 | 使用方仓库 `docs/agents/<name>.md` | 主线、命令、分级、责任方等取值 |
| 项目专属 | 使用方仓库 | 只对该项目成立的规则与门禁 |

Skill 开头会写明它读取哪个参数文件、需要哪些参数；参数文件缺的项按 Skill 默认值执行。

## 接入

需要 Node 18 以上和已登录的 `gh`。

1. 在仓库根安装要用的 Skill，`.agents/skills/` 与生成的 `skills-lock.json` 一起提交。Skill 之间会互相调用，按下表成组安装；单独列出的可以只装一个：

   | 组 | Skill | 读的参数文件 |
   |---|---|---|
   | 交付 | `git-workflow`、`implement`、`pr-delivery`、`pr-review`、`task-closure`、`tdd`、`diagnosing-bugs` | `git.md`、`testing.md`、`domain.md` |
   | 主控（需先装交付组） | `project-control`、`agent-message` | `control.md` |
   | Issue 分流与拆票 | `triage`、`to-tickets`、`domain-modeling`、`grilling` | `issue-tracker.md`、`triage-labels.md`、`domain.md` |
   | 探索 | `wayfinder`、`research`、`prototype`、`domain-modeling`、`grilling` | `issue-tracker.md`、`git.md`、`domain.md` |
   | 架构 | `improve-codebase-architecture`、`codebase-design`、`domain-modeling`、`grilling` | `domain.md` |
   | 单独 | `two-axis-code-review` | `review.md`、`issue-tracker.md` |
   | 语义审查（需先装交付组） | `zong-heng-audit`、`map-semantic-units` | `review.md` |
   | 单独 | `writing-for-agents`（会调用 `tdd`、`domain-modeling`） | `review.md` |
   | 单独 | `wait-what` | `domain.md` |

   `zong-heng-audit` 的工作地图由 `map-semantic-units` 提供，发现项的处置与评论格式用 `task-closure`、`pr-review`，验证设计用 `tdd`。`pr-review` 的脚本 require `pr-delivery`；装了 `project-control` 时还会顺带校验任务卡。锁检查脚本在 `git-workflow` 里。

   ```bash
   DISABLE_TELEMETRY=1 npx skills@1.7.6 add GengDaPeng/agent-workflow --skill git-workflow implement pr-delivery pr-review task-closure tdd diagnosing-bugs --agent claude-code codex -y
   ```

2. 把 [`templates/`](templates/) 复制到仓库根，按项目填写：
   - `docs/agents/*.md`：只复制上表里已装 Skill 用到的。不需要的行删掉，Skill 按“缺省”列执行；行末括号标了某个 Skill 的，没装那个 Skill 就删掉该行。`model-routing.md` 是可选的子代理模型表，`git.md`、`control.md` 的“子代理模型”行指向它。
   - `.agents/project.json`：共享脚本读的机器参数，字段见下节；`commentIdentityPrefix` 要与 `git.md` 的评论身份行一致。没有自己的 Ready 门禁就删掉 `readyCheck`，用共享的轻量检查。
   - `.github/pull_request_template.md`：`pr-body-check.js` 校验的四段。
   - `.githooks/pre-commit`：执行 `git config core.hooksPath .githooks` 启用；已有 hook 时把其中一行并进去。hook 里如果还跑测试，先清掉 git 传进来的 `GIT_DIR`、`GIT_INDEX_FILE` 等变量，否则测试里的 `git init`、`git config` 会改写真仓库的 `.git/config`。
3. 改共享 Skill 时，先在本仓库改并推到 `main`，再在使用方运行 `DISABLE_TELEMETRY=1 npx skills@1.7.6 update <名字> -p -y` 同步；新增 Skill 用第 1 步的 `add`。直接改 `.agents/skills/` 会被 pre-commit 的锁检查拦下，误改就撤销本地改动。

## 共享检查脚本

只带轻量检查，重型 CI 证据复用留在使用方仓库。脚本是 CommonJS，各 `scripts/` 的 `package.json` 声明了 `"type": "commonjs"`，使用方根 `package.json` 设 `"type": "module"` 也能直接运行。脚本从使用方仓库根的 `.agents/project.json` 读机器参数，文件缺失时全部用默认值：

| 字段 | 缺省 | 说明 |
|---|---|---|
| `repository` | `gh repo view` | `owner/name` |
| `gitWrapper` | `git` | 写公共 Git 目录时用的命令 |
| `commentIdentityPrefix` | 任意 `<项目>-<模型ID>` | 评论身份行前缀 |
| `taskIdPattern` | 至少三段，如 `WEB-AUTH-12` | 任务卡 Task 字段；用两段编号（如 `ABC-12`）的项目要改 |
| `readyCheck` | `pr-review/scripts/ready-check.js` | 项目自己的 Ready 命令模板，`{pr}` 替换为 PR 号 |

| 脚本 | 作用 |
|---|---|
| `pr-delivery/scripts/pr-body-check.js` | PR 正文必需段、Context、Verification、Merge Danger、Draft 与分级 |
| `pr-review/scripts/pr-comments-check.js` | REVIEW / RECHECK 评论字段与 current head 通过凭据 |
| `pr-review/scripts/ready-check.js` | 轻量 Ready：正文、任务卡、通过凭据、检查全绿、可合并、Draft |
| `project-control/scripts/task-card-check.js` | 置顶任务卡校验与 artifact |
| `git-workflow/scripts/skills-lock-check.js` | 已安装 Skill 与 `skills-lock.json` 散列一致，可放进 pre-commit |

跨 Skill 硬依赖只有 `pr-review → pr-delivery`；装了 `project-control` 时，`pr-review` 的取证与 Ready 检查会顺带校验置顶任务卡，没装就只校验任务评论链接属于本仓库。本仓库自测：`npm test`。

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
| `zong-heng-audit` | 纵横审查：沿一次执行的因果链和同一事物的全部出现处，审语义与工程形状是否成立 |
| `map-semantic-units` | 建立或恢复一次语义改动的工作地图，设计、实现、测试、审查共用 |
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

`git-workflow`、`pr-review`、`pr-delivery`、`task-closure`、`agent-message`、`project-control`、`zong-heng-audit`、`map-semantic-units` 是本仓库在多代理协作中整理出的约定。
