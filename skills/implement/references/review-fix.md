# 处理审查发现

适用于 PR 审查评论，以及开发中审查上下文或子代理返回的结论。

- 来源是 `pr-review` 的正式 REVIEW / RR 时，直接用它的修复交接包：PR、来源 REVIEW、审查版本、current head、Context 版本、活动 RR、相关 thread 和缺口。不重做 PR、diff、任务与 CI 的取证。
- 每轮调用一次 Skill 工具：`task-closure`，读其 `finding-disposition` reference，统一处置本轮发现。
- 审查结论不是执行清单。逐条判成立、不成立或证据不足，判完即停止为该条取证；只有现有证据定不了，或相关事实已经变化时，才补决定该条的最小证据。
- 成立的问题核三件事：在正式入口下是否真实可达；最小根因修法是什么，同一机制直接控制的未点名落点一起核对修复，语义相似但根因不同的不扩进来；能否消除让这类缺陷出现的条件，而不只修本次实例。触及负责方、架构或正式合同时停下请求裁决。
- 要求补测试或验证设施时，先判断是否有现有证据没覆盖的、不同且可达的真实风险；没有就不补。要加第二层证明时，调用 Skill 工具：`tdd`，读其 `verification-stop` reference。
- 修复后只跑与该项直接相关的验证。A级 / S级交回独立审查复核；B级不强制。

## PR 来源

- 每个活动 RR 写明落地：修复与验证、Issue URL、反证或用户裁决。不用“已修 / 不处理 / 转 issue”这类笼统说法。
- 修复 head 推送后，按 `pr-review` 的 `structured-review-output` reference 发一条 `[FIX-REPLY]`，同一 head 的多个来源默认合并。处理审查发现即授权发布 FIX-REPLY。
- 影响结论但没有来源 RR 的 inline thread，退回审查者结构化；其余 thread 可以回复，resolve 需用户明确授权。
- 开 PR 或发 FIX-REPLY 后，按 `structured-review-output` 的“等待对方评论”接续。

## 其他来源

只返回逐项结论和验证证据，交回原审查上下文复核；不发 GitHub 评论，不建 RR。
