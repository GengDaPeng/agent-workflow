---
name: to-tickets
description: Turn a clear implementation goal into executable tracker tickets with parent, child, and dependency relationships. Use for task decomposition, ticket drafting, or publishing an approved ticket set.
---

# To Tickets

Turn a clear goal into **tracer-bullet** vertical slices and their genuine blocking edges. This skill owns execution-ticket boundaries, granularity, parent / child structure, dependencies, and split / merge decisions. Wayfinder tickets, TDD cycles, and review groups retain their own methods.

Draft from the current conversation and supplied sources. When project vocabulary matters, read the project glossary named in [`docs/agents/domain.md`](../../../docs/agents/domain.md) (default: a root CONTEXT.md). Immediately before creating or changing tickets, read the project parameter file [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) and obtain user confirmation of the exact ticket set. The parameter file should provide:

- the commands to create, read and relate tickets, and whether the tracker has native parent and blocking relations;
- the intake state and type labels for new tickets;
- the fields to read back after publishing;
- who takes over after publication, and the state publishing stops at.

Missing items use the defaults in step 6.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase when needed

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect current formal specifications and decision records in the area you're touching.

Group work toward one coherent outcome when its owners, code and evidence substantially overlap and the combined scope remains manageable. Weigh repeated discovery, environment setup, handoff and review costs against useful parallelism, independent delivery and context complexity.

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

- Each slice delivers a complete, bounded and independently verifiable outcome across every relevant layer.
- Keep the scope understandable and reviewable as a whole; implementation phases stay inside the ticket.
- Keep preparatory work with its consumer unless a separate slice delivers a useful outcome or unlocks genuine parallel delivery.
- Together the slices cover every parent clause, contract seam, and durable follow-up.

Give each ticket its **blocking edges** — only the other tickets that must complete before it can start, not a preferred execution order. A ticket with no blockers can start immediately.

For a **wide refactor** whose mechanical blast radius prevents green vertical slices, use **expand–contract**:

1. Expand: add the new form beside the old.
2. Migrate: move callers in independently green batches.
3. Contract: remove the old form after every batch.

When migrate batches only become green together, use a shared integration branch and a final integrate-and-verify ticket.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Then show how the set covers the parent goal and list any uncovered seams. Assign every uncovered seam to a ticket or durable follow-up before presenting the split as complete.

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

Ticket count follows delivery boundaries. Merge small tickets whose shared context makes separate execution wasteful; split when the combined scope cannot be reliably understood and reviewed, mixes unrelated owner or lifecycle changes, or loses a coherent outcome.

### 5. Confirm the ticket set

Map the approved tickets to tracker tickets:

- If the source is an existing ticket, reuse it as the parent.
- If several existing tickets form one execution task, create one task ticket that links every source.
- If there is no source ticket and the breakdown has multiple tickets, create one parent ticket for the goal.
- If there is one ticket and no source ticket, publish that ticket directly.
- Publish every ticket in a multi-ticket breakdown as a child ticket, including sequential tickets.
- Connect children with the tracker's native parent relation and blockers with its native blocking relation where it has them; use the tracker configuration's commands and close semantics.

Show the exact parent/child ticket set and labels, then obtain explicit user confirmation immediately before publishing.

### 6. Publish to the tracker

Create the parent first when one is needed, then create every child with its parent relation. After all tickets have identifiers, wire blocking edges in a second pass. Apply the intake state and type labels from the tracker configuration; without them, apply `ready-for-agent`. Read back the parent, child and blocking relations of every published ticket and compare them with the exact approved set; on any mismatch, stop and report the partial state.

Stop at the state the tracker configuration names for published tickets. Any later step, such as writing an execution contract or changing the task state, belongs to the owner that configuration names.

<issue-template>

## Parent

A reference to the parent ticket. Omit this section when the parent was set as a native relation, or when there is no parent.

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)". Omit this section when blockers were set as native edges.

</issue-template>

Ticket bodies stay behavioral and durable. Include a code shape only when a prototype captures an accepted decision more precisely than prose, trimmed to the decision-rich part.
