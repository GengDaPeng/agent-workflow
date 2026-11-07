---
name: research
description: Investigate a question against high-trust primary sources. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Research directly by default. Use a **background agent** when the user explicitly requests delegation, or when the research has independently scoped work with a clear benefit from parallel execution. An agent already assigned a research subtask performs that scope directly; loading this skill does not itself trigger further delegation.

Research steps:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Cite each claim's source and distinguish source facts from inference. Write a single Markdown report when the user requests one or the task requires a durable research deliverable for decision review or handoff, including Wayfinder research tickets. For conversational fact checks and exploratory discussion without that requirement, answer directly in the conversation.
3. When saving a report, prefer an existing task-specific evidence directory; otherwise save it where the repo already keeps such notes and match the existing convention — if there is none, put it somewhere sensible and say where. Keep raw external reference material separate from conclusions, and do not write directly into archival or decision-record directories.

Mark persisted research as evidence, not a formal decision or current truth source. Route any adopted conclusion through the repository's normal decision and formal-owner workflow.

When invoked from Wayfinder, commit the report on the assigned research branch so the parent Wayfinder branch can integrate it and point the Research Issue at the exact integrated commit.
