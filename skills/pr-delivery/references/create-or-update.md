# 创建或更新 PR

1. **固定输入。** 核对 Context 来源、worktree、分支、HEAD、dirty 状态和已有验证；`<主线>...HEAD` 只含本任务改动。混有非任务改动、分支归属不明或授权不清时停止。B级要直接建 Ready PR 时，先调用 Skill 工具：`task-closure`，读其 `completion` reference，current head 为 `DONE` 才继续。
2. **查已有 PR。** `gh pr list --head <分支> --state all --json number,state,isDraft,url`。有 open PR 就更新它；只有 closed / merged 的，不复用旧任务分支。`gh` 读取失败不等于“没有 PR”。
3. **写正文。** 按仓库模板和 [pr-body](pr-body.md) 在一个临时文件里写完整正文，之后只改这一份。
4. **预检。**
   - 只改标题、正文、版本引用或验证说明，代码与测试输入未变：只跑仅交付信息校验。
   - 有真实输入变化：先复用已有证据，只补缺口；已有验证版本时只查其后的变化。
   - 预检失败就停止推送和 PR 写入，修好后重跑。
5. **写入 GitHub。** 推送后 `gh pr create --base <主线分支> --head <分支> --title <标题> --body-file <文件>`；A级 / S级加 `--draft`，建好后停止该分支的开发写入，报告 current head、待复核事项和接手方。更新用 `gh pr edit <n> --title <标题> --body-file <文件>`，不改变现有 Draft / Ready 状态。

完成于：GitHub 已接受写入，正文对应 current head，PR 状态与分级一致；CI、审查或 Ready 未完成的已明确报告。
