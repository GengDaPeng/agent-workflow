---
name: two-axis-code-review
description: Review a fixed commit, branch, tag, merge-base, or active implementation range along Standards and Spec axes. 适用于两轴审查、双轴审查，以及按规范与需求两条线审查。
---

Two-axis review of a change range supplied directly or fixed by an upstream PR reviewer:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / spec?

Both axes run as parallel sub-agents, and Standards and Spec groups stay separate from one another until aggregation. Each axis may use one or several sub-agents; there is no fixed total or one-agent-per-axis limit.

Before starting, read the project parameter files [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) and [`docs/agents/review.md`](../../../docs/agents/review.md). They should provide:

- whether an existing PR first goes through an upstream reviewer that fixes its live evidence;
- the task and spec sources for a change, in reading order;
- the repository's standards entry points;
- the evidence a finding needs when it cites a standard.

Missing items use the defaults below.

## Process

### 1. Identify the review boundary

If the target is an existing PR, the parameter files name an upstream reviewer for PRs, and that reviewer did not route this review here, call the Skill tool with that reviewer first to fix the PR's live evidence; review the diff it selects.

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If no fixed point was supplied and this review is invoked from the implementation session that made the change, infer the review boundary from that session and the current Git state. Include the complete current-task change: commits made during the task, staged and unstaged changes, and untracked files. Ask only when that boundary cannot be distinguished reliably from pre-existing work.

Capture the review evidence once. With a fixed point, use `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base) and `git log <fixed-point>..HEAD --oneline`. In an active implementation session, capture the commit diff (if any), worktree diff, and `git status --short`; list and read every in-scope untracked file.

Before going further, confirm any fixed point resolves (`git rev-parse <fixed-point>`) and the complete review evidence is non-empty. A bad ref or no in-scope committed, worktree, or untracked change should fail here — not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. A user-supplied spec path or explicit acceptance criteria.
2. The task sources the tracker configuration names, in its order — for example a context fixed by an upstream PR reviewer, or the execution contract of the current task. Read the exact source it points to.
3. Issue references in commit messages; use the issue body as intake context, then follow it to its current execution contract or spec pointer.
4. A current formal spec matching the changed module or feature.
5. If none exists, ask the user where the specification or acceptance source is. If the user confirms there is none, skip the **Spec** axis and report `no spec available`.

### 3. Identify the standards sources

Start with the standards sources named by the task, then the entry points in the review parameters. Search the repo for every file that documents how code should be written; when CODING_STANDARDS.md or CONTRIBUTING.md exists, it must be on the list. Use the affected paths to keep the smallest current standards set that can judge the diff.

If framework behavior is not settled by those sources, verify it against the installed types / source or current official documentation. Report only a concrete consequence in changed code, not a generic departure from “best practice”.

For every code review, the Standards axis also carries the baseline in [`references/code-quality.md`](references/code-quality.md). Repository rules override it, and each hit is a judgement call that must name a reachable consequence.

### 4. Split bounded axis groups and spawn sub-agents

For each axis, split only genuinely independent owner, lifecycle, risk, or diff groups. Keep one coherent group together when splitting would hide an invariant or end-to-end consequence; use multiple groups when one context cannot deeply cover the axis. File count alone neither creates nor limits groups.

Every group gets its own sub-agent. Dispatch all groups in parallel when slots permit, otherwise in batches against the same review boundary. There is no numeric cap. All sub-agents return only to this review context; they do not publish user-facing conclusions, call tracker or task/document write tools, or assign formal finding identifiers.

When this review is the developer's self-review inside the implementation session that made the change, sub-agents may inherit that conversation so they reuse its task and design context. In every other case, such as a user asking for a review of a range or an upstream reviewer routing here, start every sub-agent with a fresh context window rather than a copy of the current conversation, and fix its review boundary and necessary evidence before dispatch. Do not pass one axis's findings into another axis before aggregation. A targeted recheck may reuse the same axis's previous context so it can preserve the reviewed boundary and verify the specific repair.

Give each group the fixed review version or diff, its scope, and source paths with relevant sections and versions. Agents with access to those files read the necessary content themselves and reuse material already available in their context. When a source is inaccessible, supply the needed excerpt or captured evidence with its provenance and version.

**Standards sub-agent prompt** — include:

- This group's bounded owner / risk / diff scope and the neighboring invariant it must not sever.
- The standards-source pointers identified in step 3, plus the code-quality baseline when reviewing code.
- The brief: "Report documented-standard violations and concrete engineering risks in this scope. Cite the rule or evidence to the level the review parameters require, quote the relevant hunk, and explain the reachable consequence. Distinguish hard violations from judgement calls; generic lenses do not prescribe a fix or override repository rules. Skip issues already enforced by tooling. Under 400 words."

**Spec sub-agent prompt** — include:

- This group's bounded requirement / owner / journey scope and the observable outcome it must preserve.
- The spec-source pointers identified in step 2, or captured evidence when the source is inaccessible.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip all Spec-axis groups and note this in the final report.

### 5. Aggregate

Wait for every required group. Within each axis, reconcile overlaps and coverage gaps without changing the axis's judgement; request a targeted continuation when a required group is incomplete. Present the reconciled results under `## Standards` and `## Spec`. Do **not** rerank one axis against the other (see *Why two axes*).

End with a one-line summary: total findings per axis, and the worst issue *within each axis* (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
