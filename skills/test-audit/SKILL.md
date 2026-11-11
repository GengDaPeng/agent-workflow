---
name: test-audit
description: "Audit or clean up low-value, duplicative, or implementation-coupled tests and test-only production seams."
---

# Test Audit

One question decides every candidate: **what real failure does this test catch that no stronger remaining test catches?** If you cannot name one, it is a candidate; if you can, it stays. Optimize for confidence, not deletion count.

A review request is read-only: report candidates with evidence and stop. Edit, including deleting tests or production seams, only when the user authorizes that audit change. Keep each audit to one coherent owner-boundary batch.

## Discovery

Read the complete test, its production owner, entry point, callers, sibling implementations, overlapping tests, CI routing, and relevant history before judging; read the dependency source when the test claims dependency-backed behavior. Run parallel discovery lanes for broad scopes. Prefer a few high-confidence candidates over a speculative inventory.

Common low-value shapes:

- assertion-free coverage probes, self-comparisons, identity copiers;
- copied fixtures, inventories, manifests, or export lists;
- exact source, import, or string greps;
- private predicate or call-shape tests duplicated at a real boundary;
- repeated invocations of one contract, or provider-local replays of shared helpers;
- tests that exist only to keep test-only exports, globals, wrappers, or dead production code alive.

A test that must change on behavior-preserving refactor is suspect, not automatically deletable. Static or slow is not a reason. Keep a test that independently enforces a public API, protocol, config, migration, storage, security, platform, default, prompt-byte, generated, package, release, or architecture contract; observable call ordering; a credible regression; or a source check that is the cheapest independent guard.

## Candidate evidence

A candidate is ready for deletion only when you can state:

- the exact test and the failure it can actually detect;
- the stronger owner-boundary proof that still detects it, or why none is needed;
- non-test callers of the covered seam, and the history behind the test;
- the production or test-support code its removal unlocks, and the focused validation command.

## Edit

Delete obsolete test-only exports, globals, wrappers, and dead production paths instead of aliasing them; move retained regressions to their canonical owner; fold repeated package assertions into one generic contract. Delete a production seam only after confirming no non-test callers and that the remaining proof still detects the original failure. Uncertain candidates stay as recommendations; replacement tests that restate the implementation are not added.

## Validation

Call the Skill tool: `tdd`, and read only what the action needs: `test-design` for test or proof-boundary changes, `verification-execution` for running or reusing checks (with the project's testing and environment policy), `verification-stop` before adding a proof layer or test support.

After an authorized edit, map each change to focused validation and affected regressions; for removed source checks or gate assertions, run the script or dry-run that owns the real contract; run `git diff --check`.

## Stop and report

Stop after the authorized batch; push, PR, merge, or another batch each need separate authorization. Report removed and retained tests (with why the retained ones matter), production simplifications, validation run and unrun scope, production versus test LOC, and remaining candidates as recommendations.
