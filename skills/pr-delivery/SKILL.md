---
name: pr-delivery
description: 创建或更新 PR、写 PR 正文、等待 CI、修复交付门禁失败，或把 A级 / S级 PR 转 Ready 时使用。不审查内容，不处理审查发现，不合并。
---

# PR 交付

开始前读取项目参数文件 [`docs/agents/git.md`](../../../docs/agents/git.md)。参数文件应提供：

- 主线、PR 模板与 Context 写法；
- PR 预检、仅交付信息校验、Ready 检查的命令；
- CI 请求方式。

缺失的项按本文默认值执行。Git 动作按 `git-workflow`。

## 动作

| 动作 | 读取 |
|---|---|
| 创建或更新 PR | [create-or-update](references/create-or-update.md)，正文按 [pr-body](references/pr-body.md) |
| A级 / S级转 Ready，或复验已 Ready 的 PR | [draft-to-ready](references/draft-to-ready.md) |
| 等 CI，或交付门禁失败 | [ci-delivery-fix](references/ci-delivery-fix.md) |

## 约定

- 实现或验证还缺，调用 Skill 工具：`implement`；需要新的复核，交给独立上下文调用 Skill 工具：`pr-review`。
- Context 只有两种来源：
  - Issue 派发：写置顶任务卡链接及其分级。分级以任务卡为准，交付侧不改写、不降级；卡有错交给任务卡负责方。
  - 用户在持续讨论中形成并授权交付的改动：写足以还原缘由的背景和实际分级，不为形式补 Issue。
- 只修门禁指向的输入，不为单个 PR 改检查器。检查器规则疑似有误时，报告规则、输入和实际损失，用户要求修订时再改。
- PR 评论不由本 Skill 发：`[REVIEW]` / `[RECHECK]` 归 `pr-review`，`[FIX-REPLY]` 归 `implement`。

## 完成

报告 PR、current head、分支与 base、Draft / Ready、已跑的门禁、CI 与审查状态、未跑项和剩余风险。有 pending、失败，或缺少适用于 current head 的复核时，只报事实，不称已交付或可合并。
