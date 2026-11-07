---
name: triage
description: Classify, verify, and route Issue tracker items; gather missing information and write an agent brief only when the accepted item lacks durable execution context.
disable-model-invocation: true
---

# Triage

Classify, verify, and route tracker items through the roles below. Before starting, read the project parameter files [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) and [`docs/agents/triage-labels.md`](../../../docs/agents/triage-labels.md). They should provide:

- the label each role maps to, and the commands for reading items and changing labels, comments and close state;
- who counts as an external PR author, and where external-PR intake stops;
- the identity line that starts every comment the agent posts;
- the owner of the execution contract for a `ready-for-agent` item;
- where an open direction or decision goes once the user picks a forum.

Missing items use these defaults: the role names are the labels; an external PR is one whose author lacks write access to the repository; the identity line is `评论者：<模型ID>`; a complete accepted item, or its agent brief, is the execution contract; open directions return to the user. Resolve a bare `#42` through the tracker configuration.

Every comment the agent posts during triage starts with the configured identity line.

## Reference docs

- [AGENT-BRIEF.md](AGENT-BRIEF.md) — how to write durable agent briefs
- [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) — how the `.out-of-scope/` knowledge base works

## Roles

Two **category** roles:

- `bug` — something is broken
- `enhancement` — new feature or improvement

Five **state** roles:

- `needs-triage` — awaiting evaluation
- `needs-info` — waiting on reporter for more information
- `ready-for-agent` — fully specified, ready for an AFK agent
- `ready-for-human` — needs human implementation
- `wontfix` — will not be actioned

For a PR, the same states read against the attached code: `ready-for-agent` means a brief is attached and an agent should take the next step on the diff; `ready-for-human` means it's ready for a human to merge.

Work with one category role and one state role, then apply the repository's configured labels. Conflicting states return to the user for selection. `needs-info` returns to `needs-triage` when the reporter supplies the requested facts.

## Invocation

The user describes the desired triage action in natural language. Examples:

- "Show me anything that needs my attention"
- "Let's look at #42" (issue or PR)
- "Move #42 to ready-for-agent"
- "What's ready for agents to pick up?"

## Show what needs attention

Query the issue tracker and present three buckets, oldest first:

1. **Unlabeled** — never triaged.
2. **`needs-triage`** — evaluation in progress.
3. **`needs-info` with reporter activity since the last triage notes** — needs re-evaluation.

When PRs are in scope, include external PRs in these buckets and tag each line `[PR]` or `[issue]`. Discovery surfaces only *external* PRs (the tracker config defines who counts as external) — a collaborator's in-flight PR is not triage work. Naming a PR skips discovery; it does not override the tracker config's external/internal boundary.

Show counts and a one-line summary per item. Let the user pick.

## Triage a specific issue or PR

1. **Gather context.** Read the full issue or PR (body, comments, labels, author, dates; for a PR, the diff too). Parse any prior triage notes so you don't re-ask resolved questions. Explore the codebase using the project glossary, respecting the decision records in the area (both located through [`docs/agents/domain.md`](../../../docs/agents/domain.md)). Run two checks against the codebase: (a) **redundancy** — search for an existing implementation of the requested behavior by domain concept (not just the request's wording), and report where you looked. If found, it's an already-implemented `wontfix` (step 6). (b) **prior rejection** — read `.out-of-scope/*.md` and surface any that resembles this request.

2. **Recommend.** Give the user the category and state recommendation, reasoning, and relevant codebase facts, including whether the behavior already exists. Wait for direction.

3. **Verify the claim.** Before any grilling, check that the claim holds up. For a bug, reproduce it from the reporter's steps. For a PR, confirm the diff does what it claims — check it out, run the relevant tests or commands. Report what happened: confirmed (with code path), failed, or insufficient detail (a strong `needs-info` signal). A confirmed verification makes a much stronger agent brief.

4. **Grill (if needed).** If the request needs fleshing out, call the Skill tool twice, for `grilling` and `domain-modeling`, and grill it into shape a round of questions at a time, sharpening domain terms and updating the glossary and decision records inline as decisions land.

5. **Confirm mutations.** Obtain explicit user confirmation for the exact label, comment, close, or `.out-of-scope/` writes, then apply the selected outcome through the tracker configuration.

6. **Apply the outcome** through the tracker config:
   - **Direction or decision still open** — return it to the user; move it to the forum the tracker configuration names only after the user chooses that forum.
   - **Clear goal requiring multiple execution tasks** — call the Skill tool: `to-tickets` with the accepted goal; triage does not design the split.
   - `ready-for-agent` — hand one clear executable task to the execution-contract owner the tracker configuration names. A complete accepted Issue is the handoff; otherwise add an agent brief ([AGENT-BRIEF.md](AGENT-BRIEF.md)).
   - `ready-for-human` — same structure as an agent brief, but note why it can't be delegated (judgment calls, external access, design decisions, manual testing).
   - `needs-info` — post triage notes (template below).
   - `wontfix` — close, with the comment depending on *why*:
     - **Already implemented** — point to the existing implementation and close.
     - **Rejected (bug)** — polite explanation, then close.
     - **Rejected (enhancement)** — write to `.out-of-scope/`, link to it from a comment, then close ([OUT-OF-SCOPE.md](OUT-OF-SCOPE.md)).
   - `needs-triage` — apply the role. Optional comment if there's partial progress.
   - **External PR** — record the intake outcome and stop at the tracker configuration's current boundary.

## Quick state override

When the user explicitly names the target state, trust that selection and apply it directly after confirming the exact mutation, unless it conflicts with a hard project boundary. Skip grilling. For `ready-for-agent`, add an agent brief only when the accepted Issue lacks durable context for the next owner.

## Needs-info template

```markdown
## Triage Notes

**What we've established so far:**

- point 1
- point 2

**What we still need from you (@reporter):**

- question 1
- question 2
```

Capture resolved facts under "established so far"; ask for the exact missing fact or action.
