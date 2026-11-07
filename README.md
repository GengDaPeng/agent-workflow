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
