# Finding disposition

## Root-cause minimum

The minimum correct fix closes the root cause everywhere it remains active inside the task proposition and affected subgraph. It is not the fewest changed lines or files.

Use the affected subgraph to determine where to investigate and prove behavior. Modify only the nodes needed to make the current task proposition true. A location being relevant to review does not automatically place its behavior inside the current modification scope.

When a same-root location would still falsify the current acceptance criteria or invariant, include it in the current fix. When a valid problem forms an independent proposition, owner, authority, lifecycle, or consumer and the current proposition can still be proved honestly without changing it, persist it as follow-up work instead of expanding the task.

## Dispose every finding

Classify every review, test, implementation, or investigation finding into exactly one disposition:

| Disposition | Use when | Required result |
|---|---|---|
| `FIX_CURRENT` | The current work introduced the regression, or the task cannot satisfy its acceptance criteria or invariants while the problem remains. | Fix and bind relevant verification to the delivered version. |
| `TRACK_ISSUE` | The problem is established, but resolving it is an independent proposition or crosses into a new owner, authority, lifecycle, or consumer without preventing honest completion of the current proposition. | Return a tracking request; the implementation workflow verifies the claim, then creates or reuses the project's durable task artifact and returns its reference. If verification rejects the claim, reclassify it as `INSUFFICIENT_EVIDENCE` and do not create an artifact. |
| `DECISION_REQUIRED` | Authoritative sources conflict or are missing, or different choices materially change product behavior, ownership, trust, or scope, and the choice requires user authority under the project contract. | Stop only the dependent work and return the decision package to the user. The user decides both the substance and whether the discussion needs a durable forum. |
| `INSUFFICIENT_EVIDENCE` | Available evidence does not establish the claimed problem. | Record the decisive evidence gap; do not repair or create mandatory follow-up from the unsupported claim. |

A finding is not disposed until its required result exists. An initial reviewer classification is provisional until the implementation workflow verifies and lands it. Resolve technical choices inside the current agent's documented authority; do not relabel them `DECISION_REQUIRED` merely because several implementations are possible. `INSUFFICIENT_EVIDENCE` applies to an unsupported problem claim, not to missing evidence required by the task proposition; the latter leaves the task `NOT_DONE`. A proposed future capability is not an established finding. It becomes `TRACK_ISSUE` only after an authorized owner accepts it as intended work; otherwise it remains a non-blocking review note outside the finding dispositions and completion gate.

## Stop scope drift

Re-evaluate the task proposition before proceeding when work would introduce or change any of the following:

- a formal owner, authority, trust boundary, store, session, or independent lifecycle;
- another business domain's behavior or a different real consumer;
- the acceptance proposition or the evidence needed to prove it;
- a unit of work that no longer fits one fresh implementation context.

If the change is necessary to prove the current proposition, return `DECISION_REQUIRED` and the boundary that no longer fits. If it is an established finding that is independently valid but not necessary, return `TRACK_ISSUE` and continue only within the original proposition. Preserve completed in-scope work and evidence; do not turn discovery into an unbounded patch loop. After a decision, any required multi-task structure is owned by `to-tickets`, not this contract.

Return the disposition, reason, evidence, and follow-up or decision reference when required.
