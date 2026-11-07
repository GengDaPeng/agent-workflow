---
name: tdd
description: "Use for test-first implementation, or when a caller requests test-design, verification-execution, or verification-stop guidance."
---

# Test-Driven Development

Use the current project's acceptance criteria, testing policy, vocabulary and runtime configuration as inputs. This package owns reusable methods; the project owns required coverage, environments and delivery approval.

Before starting, read the project parameter file [`docs/agents/testing.md`](../../../docs/agents/testing.md). It should provide:

- the testing policy and mandatory evidence;
- the test-data, environment and shared-resource policy;
- first-run preparation, rerun and evidence-reuse rules;
- when a seam under test counts as agreed.

Missing items use this skill's defaults. When exploring the codebase, read the project glossary named in [`docs/agents/domain.md`](../../../docs/agents/domain.md) (default: a root CONTEXT.md, if it exists) so test names and interface vocabulary match the project's domain language, and respect the decision records in the area you're touching.

## Select the current action

- **Design or change tests**: read [test-design.md](references/test-design.md). This branch does not require test-first implementation.
- **Run checks or reuse evidence**: read [verification-execution.md](references/verification-execution.md).
- **Add a proof layer, test support, fault injection or verification-tool tests**: read [verification-stop.md](references/verification-stop.md) and return the boundary decision.
- **Test-first implementation**: read both [test-design.md](references/test-design.md) and [verification-execution.md](references/verification-execution.md), then follow the loop below. Both are required for the complete TDD workflow; they are separate references so other actions can reuse either method independently.

For standalone actions, read the corresponding references without starting the red → green loop. Use [tests.md](references/tests.md) for test-shape examples and [mocking.md](references/mocking.md) for collaborator-isolation examples when those choices are unclear.

## Red → green loop

- Write one test for an observable behavior and run it. Confirm it fails because the behavior is missing or defective, not because the environment is broken.
- Implement the smallest change that makes that test pass. Work one behavior at a time rather than writing a batch of tests for an imagined implementation.
- Refactor after green when needed, preserve behavior, and rerun affected tests before taking the next slice.
