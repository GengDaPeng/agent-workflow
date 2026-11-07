# Test design

## Proposition and value

Before adding or changing a test, verification script, fixture or execution scope, read the relevant existing proof. Identify the concrete reachable failure new proof must detect or the confidence changed proof must preserve. Reuse the task or design contract for behavior, owner, observable seam, independent oracle and non-proof boundary. Missing behavior semantics return to the acceptance source; tests do not invent requirements.

- Reuse adequate proof. For a gap, extend an existing case or fixture when it gives the same evidence; add a separate test only for a distinct gap. Compare assertions and actual dependency boundaries before consolidating: similar actions may prove different risks.
- Observe the real behavior boundary. Do not introduce an export, flag, wrapper or injection entry solely for tests when no production caller needs it.
- Derive expectations independently from acceptance criteria, worked examples or an external contract. Recomputing the implementation, comparing a constant to itself or counting mock calls alone does not prove behavior.
- Assert actual collection members and justified exceptions. A fixed count or full snapshot needs an independent contract; preserve evidence against empty collections and missing enumeration.
- Use decisive allowed, rejected and failure cases for authorization, identity, data scope, transitions, idempotency and error mapping. Case count follows real branches rather than a template.
- A test that breaks under behavior-preserving reorganization is suspect, not automatically deletable. Independently required protocols, architecture contracts and observable call ordering may justify structural assertions.

## Choose the direct seam

Use the cheapest layer that directly observes the proposition. Add another layer only for a distinct reachable risk; read [verification-stop.md](verification-stop.md) before adding proof infrastructure or another layer.

| Proposition | Direct evidence |
|---|---|
| Pure rules, state calculations, mappings and boundary values | Unit tests |
| Persistence, constraints, transactions, audit, cleanup or dependency integration | Integration tests with the relevant real dependency |
| HTTP, validation, authentication and response contracts | API or contract tests |
| UI state, DOM behavior and interactions | Unit or component tests |
| Routing, browser integration and critical user journeys | Browser or end-to-end tests |
| Producer-consumer compatibility | Contract tests or boundary tests on both sides |

Give each candidate seam a one-line note on what it catches and what it misses. A seam counts as agreed when the project's testing parameters say so; without that parameter, confirm the seams with the user before writing tests.

Before writing, trace discovery and affected consumers to the intended execution scope under the project's policy. Choose preparation and data size for the proposition, including their repeated cost. Justify costly scenarios' trigger scope separately from their correctness value.

Keep the reuse/extend/new and scope decision once per coherent proof group in the existing task or design record. Revisit it for a new gap or observed cost; reconcile intended scope with the first required run or still-applicable evidence before handoff. This does not require a separate document, approval or benchmark.

Mock collaborators outside the selected seam. A unit test with a mocked store does not prove persistence; a test claiming database, queue, object storage or network-adapter behavior must reach that dependency. For an uncontrollable external system, use a controlled substitute at its adapter boundary and report that real external integration remains unproved.

## Real dependencies and isolation

- An integration or end-to-end claim reaches the real dependencies it names. If unavailable, report the uncovered boundary.
- Observe rollback or absence of residual writes from outside the completed transaction. An assertion inside the transaction cannot prove rollback.
- Make tests repeatable, independent and order-insensitive. Before parallel runs, isolate shared database schemas, cache/queue namespaces and object-storage buckets; do not rely on previous runs' mutable state.
- Keep fixture size proportional to the proposition. Reuse established support; extract shared support only after multiple real consumers need it.
- Test, fixture, preview and demo data do not establish production initialization or production readiness.

Before touching shared resources, read the environment and test-data policy named in [`docs/agents/testing.md`](../../../../docs/agents/testing.md). Apply its ownership, access and cleanup rules in addition to these methods.
