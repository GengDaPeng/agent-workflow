# 审查参数

`two-axis-code-review`、`writing-for-agents`（代理指令审查）、`zong-heng-design`、`zong-heng-audit` 与 `map-semantic-units` 的项目参数。不需要的行删掉，Skill 按“缺省”执行；行末括号标了某个 Skill 的，没装那个 Skill 就删掉该行。

| 参数 | 本项目取值 | 缺省 |
|---|---|---|
| 规范入口 | `<编码规范、架构文档的位置>` | 仓库里所有写明编码规范的文件 |
| 引用规范的证据要求 | `pr-review` 的 `structured-review-output` reference 中的证据等级 | 给出原文与位置 |
| 工作地图位置（`map-semantic-units`、`zong-heng-audit`） | `<工作版本的路径；已发布版本在哪>` | 任务临时文件，位置写在任务的持久入口；发布后以 PR 正文的 `[SEMANTIC-MAP]` 为准 |
| 项目探针（`zong-heng-audit`） | `<项目不变量与项目反例的文件；各自的命中条件>` | 无，只用 Skill 自带的失败反例 |
| L3 触发条件（`zong-heng-audit`） | `<项目里必须多上下文审查的改动>` | 核心业务链路、访问控制、生产数据、不可逆迁移 |
| 端到端旅程来源（`zong-heng-audit`） | `<验收旅程或用例的位置>` | 无，按任务目标建本轮最小纵切 |
| 设计稿与页面依据（`zong-heng-audit`） | `<界面规范、设计系统、页面规格的位置>` | 用户裁决、需求与规格、项目的界面规范 |
| 走查账号（`zong-heng-audit`） | `<样例账号的来源或前缀>` | 样例数据里的真实账号 |
| 产品效果确认（`zong-heng-audit`） | `<确认方与规则位置>` | 用户 |
| 子代理模型（`zong-heng-audit`） | [model-routing.md](model-routing.md) | 沿用当前会话模型 |
| 裁决请求格式（`zong-heng-audit`） | `<项目的裁决请求格式位置>` | 需要决定什么、已知事实与证据缺口、建议与理由、选择后的影响 |
