# A级 / S级 Ready

1. 调用 Skill 工具：`task-closure`，读其 `completion` reference；current head 为 `DONE` 才继续。
2. 读本 PR 的全部 issue comments 和未解决 review thread，逐项确认已修复、驳回、裁决或转出。任一项仍活动或无法确认时停止。多人审查时，别人的 MUST 同样要闭环。
3. 选一条已通过、仍适用于 current head 的复核，按 `pr-review` 的“分级与复核”判断能否继承；不能继承的，交独立上下文调用 Skill 工具：`pr-review` 复核受影响面。
4. PR 仍是 Draft 时，记下本地 HEAD，跑参数文件的 Ready 预检（允许 Draft 的那条）。失败就保持 Draft，按 [ci-delivery-fix](ci-delivery-fix.md) 处理。
5. `gh pr ready <n>`，再 `gh pr view <n> --json isDraft,headRefOid` 回读：非 Draft 且 head 与预检时相同，才报告已转 Ready。转换后不紧接着重跑整套门禁。
6. 转换或回读失败时不报成功，保留原文并重读状态：仍是 Draft 就排除原因后从第 4 步恢复；已是 Ready 且 head 未变就按事实交接；head 变了就从第 1 步重来，不自动改回 Draft。

PR 已经是 Ready 时，做完第 1～3 步直接跑 Ready 检查（不带允许 Draft 的选项），不再转换。

机器门禁只核分级、current head、复核凭据的身份、结论与祖先关系，以及 Git、PR、CI 的客观状态；评论链是否闭环由第 2 步判断，不由门禁推导。Ready 不启动测试，缺证据时交给 [ci-delivery-fix](ci-delivery-fix.md)。
