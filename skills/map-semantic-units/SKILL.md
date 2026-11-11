---
name: map-semantic-units
description: Build or restore the shared compact or full work map of a semantic change. Use for design, implementation, testing, or review, and after context compression or handoff.
---

# Map Semantic Units

The work map is the one contract design, implementation, testing, and review all verify against. It survives context compression. Cover the affected surface only; stable rules stay with their authoritative owners.

## Persist and recover

Persist the map before dependent implementation, even in a single-agent task. Keep one current copy at the work-map location named in the project parameter file [`docs/agents/review.md`](../../../docs/agents/review.md) (otherwise a task-local file pointed to from the task's durable entrypoint), with a named maintainer, and pass its location and version to every consumer. An existing task card or design may carry it only if it holds the complete contract below.

After compression, resumption, or handoff, read the map and its cited evidence before continuing, and check its binding against the current scope. A conversation summary is a locator, not the contract. If a decision cannot be recovered, report the gap and stop only the work that depends on it.

## Choose the smallest form that holds

A design checkpoint that already selected a form gets that form. Otherwise:

- **No semantic change**: one line saying why behavior, owner, invariant, consumer, and proof are unchanged; no map file.
- **Compact**: a bounded change inside one existing owner that leaves owner, lifecycle, authority, state, and failure/recovery behavior unchanged.
- **Full**: every other semantic change.

Escalate only when the smaller form cannot state the contract unambiguously; file count and task grade do not decide.

## Build the map

Start from the task proposition and authoritative evidence. Reuse formal owners; never invent an owner, authority, consumer, or future capability. Split units only where identity, owner, lifecycle, invariant, authority, or failure/recovery behavior differs.

### Compact map

```md
[SEMANTIC-MAP]
Form: compact
Task proposition: <observable outcome>
Maintainer: <agent or role responsible for updating this contract>
Decisions / reasons: <accepted task choices and rationale not recoverable from code; none if absent>
Owner: <single current owner>
Affected objects: <objects or relationships>
Invariants: <facts that must remain true>
Writers / consumers: <actual affected paths>
Proof / oracle: <observable evidence that decides the proposition>
Non-proof boundary: <what this task and evidence do not prove>
Bound to: <commit SHA or fixed working-tree diff>
```

### Full map

```md
[SEMANTIC-MAP]
Form: full
Task proposition: <observable outcome>
Maintainer: <agent or role responsible for updating this contract>
Decisions / reasons: <accepted task choices and rationale not recoverable from code; none if absent>
Bound to: <commit SHA or fixed working-tree diff>

| Object / fact | Owner | What changes | Writer / consumer | Invariant |
|---|---|---|---|---|

Critical edges:
- <trigger or writer> -> <owner / transition> -> <consumer or observable outcome>

Failure / recovery:
- <reachable failure and required stable outcome>

Proof / oracle:
- <observable evidence that decides each changed invariant>

Non-proof boundary:
- <explicitly unproved or deferred surface>
```

Record decisions when made; keep a rejected alternative only when its reason stops the same mistake from reopening. The map is a contract, not a transcript or implementation plan. Add provenance only when trust or validity depends on origin, and a critical edge only when it changes how the proposition succeeds, fails, recovers, or retires. A declared runtime capability must terminate at a real consumer.

## Challenge only when disputed

The maintainer checks the map against current evidence before implementation. Use a separate clean-context challenge only when authority is unclear, an irreversible boundary is involved, evidence contradicts the map, or the map itself is the disputed claim.

A challenger returns `MAP-OK` or one bounded `MAP-CHALLENGE`: disputed object or edge, claim, evidence, impact, smallest correction. Resolve it in the same map with at most one targeted recheck; unresolved authority returns the project decision package and stops dependent work.

## Consume the same contract

- **Design** derives the approach from the map.
- **Implementation** fixes the owner/root cause, not a list of review comments.
- **Testing** proves the stated oracle at the lowest direct seam; a second layer needs a distinct reachable risk.
- **Review** checks the proposition independently against actual writers and consumers, including omissions outside the map; shared input is not agreement. Report proven risks immediately and `MAP-CHALLENGE` when the contract itself is wrong.

Update the same map before dependent work or handoff whenever a decision, proposition, owner, object, invariant, edge, proof, or non-proof boundary changes. When only the version moves, inspect the delta and refresh `Bound to` if the contract still holds.
