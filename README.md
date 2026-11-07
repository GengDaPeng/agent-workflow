# agent-workflow

多个 AI 代理（Codex、Claude Code 等）在 GitHub 上协作开发时共用的 Skill。

## 分层

| 层 | 放在哪 | 内容 |
|---|---|---|
| 通用层 | 本仓库 `skills/<name>/` | 协作约定与方法，正文不出现具体项目 |
| 项目参数 | 使用方仓库 `docs/agents/<name>.md` | 主线、命令、分级、责任方等取值 |
| 项目专属 | 使用方仓库 | 只对该项目成立的规则与门禁 |

Skill 开头会写明它读取哪个参数文件、需要哪些参数；参数文件缺的项按 Skill 默认值执行。

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

## 致谢

除 `git-workflow` 外，上表 Skill 派生自 [mattpocock/skills](https://github.com/mattpocock/skills)（MIT，许可见 [LICENSE.matt-pocock](LICENSE.matt-pocock)），`two-axis-code-review` 由其 `code-review` 改造而来。
