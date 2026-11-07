# PR 正文

段落和字段以仓库 PR 模板为准；默认四段必留：Summary、Context、Verification、Merge Danger。可选段不适用就整段删除，不留占位。正文只写交付结果和版本化证据；Draft / Ready、CI、审查进度看平台原生记录，不在正文维护副本。不写开场白，用项目术语表里的词（位置见 [`docs/agents/domain.md`](../../../../docs/agents/domain.md)）。

## Summary

挑能讲清要点的最小视图，紧挨着配一两句话。一般一两种就够，不要全用：

- 逻辑或算法：伪代码。
- 运行时控制流：调用树。
- 界面结构：组件树，带上有意义的状态和模块边界。
- 文件职责或大范围重构：浅层文件树。
- 组件交互、控制流或数据流：Mermaid。
- 改动落在已有结构上：diff 草图，形状跟主题走（组件树、文件树、调用树或状态流）。

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
```

大部分是新内容，或省略上下文会掩盖归属和顺序时，给完整代码块。只留回答当前问题必需的调用、文件、属性、状态和边界。

## Context

按 SKILL 的两种来源写，字段名以模板为准。

## Verification

- 写实际命令、测试名或人工检查步骤及结果，按证明分组；不写“已验证”“测试通过”这类空话。
- 证据从强到弱：界面改动且环境具备时给前后截图；其次是执行证据，指出哪条测试改前失败、改后通过。
- 没跑的写 `Not run: <具体原因>`。

## Merge Danger

- `门：` 单向门或双向门。能低成本退回的是双向门；含破坏性操作、数据迁移或难以撤回的决定是单向门。
- `影响面：` 先用一个词概括，再按需列可能波及的消费者、布局、兼容性等。发布或回滚前置也写在这里。

## Notes

只在有内容时保留：明确不处理的边界；本 PR 新发现、须后续承接的事项，引用已建或复用的 Issue。不写没有 Issue 承接的 TODO。

Summary 与 Merge Danger 的写法改编自 mattpocock/skills 的 `pr`，其视图清单出自 Dex Horthy 的 `show-me`。
