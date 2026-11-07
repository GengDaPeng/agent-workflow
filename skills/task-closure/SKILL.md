---
name: task-closure
description: Use when deciding whether a discovered problem belongs to the current task, repairing a root cause across its affected surface, or judging child or parent completion. 适用于范围判断、审查意见处置和父子任务闭环。
---

# Task Closure

A task is a **proposition to prove**, not a file list or a collection of patches. Project-specific Issues, statuses, approvals, PR actions, and durable trackers remain owned by the calling project workflow.

## Fix the proposition

Before changing, reviewing, or closing work, fix these four facts from the user's goal and the current authoritative sources:

- **Goal proposition**: the observable outcome the parent goal promises.
- **Task proposition**: the independently verifiable part assigned to the current task.
- **Affected subgraph**: the current producers, writers, consumers, projections, invariants, and failure / recovery paths that can confirm or falsify the task proposition.
- **Non-proof boundary**: what the current task and evidence do not establish.

If any fact is unknown, report the smallest evidence gap that prevents the current decision. Do not silently substitute an implementation idea, file boundary, review comment, or child task for the proposition.

When the current task proposition no longer carries the required work, report that boundary and the accepted remaining goal; do not design child tasks here. If one clear goal now needs multiple execution Issues, the calling workflow routes it to `to-tickets`.

## Read only the active branch

- **Classifying a finding, repairing a root cause, or controlling scope drift**: read [finding-disposition.md](references/finding-disposition.md).
- **Closing a task or parent goal, or deciding whether a repair loop must stop**: read [completion.md](references/completion.md).

Load more than one branch only when the current action genuinely performs both jobs.
