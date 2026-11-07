# Git 与 PR 参数

`git-workflow`、`pr-review`、`pr-delivery`、`implement`、`task-closure`、`wayfinder` 的项目参数。不需要的行删掉，Skill 按“缺省”执行。

| 参数 | 本项目取值 | 缺省 |
|---|---|---|
| 主线 ref | `origin/main` | `origin/main` |
| Git 写入包装器 | `git` | `git` |
| 分级与初始 PR | B级可直接 Ready；A级、S级先开 Draft 交独立审查 | 同左 |
| 高风险边界表（哪些改动按 S级） | `<认证、权限、数据迁移、删除、计费……>` | — |
| PR 模板 | `.github/pull_request_template.md` | Summary、Context、Verification、Merge Danger 四段 |
| 交付 Skill | `pr-delivery` | `pr-delivery` |
| 评论身份行 | `评论者：<项目>-<模型ID>` | `评论者：<模型ID>` |
| 专项审查方法 | 代理指令：`writing-for-agents`；测试：`tdd` 的 `test-design` reference；说明性注释：`two-axis-code-review` 的 `code-quality` reference | 直接审查 |
| 设计检查点 Skill | `<项目的设计 Skill>` | 无，跳过设计检查点 |
| 子代理模型 | `<审查用什么模型、思考深度>` | — |
| 修复轮次上限 | 3 | 3 |
| 合并方式 | `--merge` | `--merge` |
| 破坏性操作例外 | 无 | 无，一律先问用户 |
| Wayfinder 研究分支 | `research/<issue>-<topic>` | 同左 |
| 责任方 | 产品取舍交用户，技术取舍交`<主控或用户>` | 用户 |

## 命令

| 阶段 | 命令 |
|---|---|
| 提交前 | `node .agents/skills/git-workflow/scripts/skills-lock-check.js --staged`，再加项目自己的 lint 或测试 |
| 创建 PR、更新正文 | `node .agents/skills/pr-delivery/scripts/pr-body-check.js --body <正文文件> [--draft]` |
| 请求 CI | `<push 自动触发 / 手动触发命令>` |
| 转 Ready 前 | `node .agents/skills/pr-review/scripts/ready-check.js --pr <编号> --allow-draft` |
| Ready 复验、合并前 | `node .agents/skills/pr-review/scripts/ready-check.js --pr <编号>` |
| 审查取证 | `node .agents/skills/pr-review/scripts/collect-pr-context.js --pr <编号> --mode <diagnose\|review\|handoff\|publish>` |
| 等待对方评论 | `node .agents/skills/pr-review/scripts/wait-pr-comment.js --pr <编号> --role <reviewer\|developer> --after-comment <ID>` |
| 评论文件校验 | `node .agents/skills/pr-review/scripts/pr-comments-check.js --body <评论文件> --manifest <审查 manifest>` |

## CI 与证据

- `<CI 什么时候跑；Ready 与合并前要哪些检查为绿>`
