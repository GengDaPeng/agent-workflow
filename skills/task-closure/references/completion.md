# Completion

A task is complete only when:

- evidence bound to the delivered version proves its task proposition;
- no `FIX_CURRENT` or required decision remains unresolved;
- every established out-of-scope problem has a durable reference;
- the non-proof boundary is explicit.

A parent goal is complete only when:

- completed child evidence covers every remaining clause of the parent proposition;
- all blocking edges and integration seams are closed;
- the combined system reaches the promised observable outcome;
- deferred work is durably tracked and does not contradict the claimed outcome.

Default completion to `NOT_DONE`; change it to `DONE` only from the evidence above.

## Repair-loop stop

Stop repairing a problem when it has gone back to review three consecutive rounds as "fixed" and is still open. The project parameter file [`docs/agents/git.md`](../../../../docs/agents/git.md) may set a different round limit. Commits and test reruns are not rounds; different problems are counted separately; a new finding number for the same root cause does not reset the count. Stop at once, without waiting for the limit, when authorization is missing, authoritative sources conflict, no viable path remains, or the next step needs an unauthorized destructive, production, or paid action.

On stop, pause only that problem and its dependent work, record each round's finding, repair, evidence version, and remaining cause in the original record, and request a decision from the reporting owner. Continue any other authorized, independent work; when none remains, report the evidence, open items, and resume condition.

## Report

For task closeout, return `DONE` or `NOT_DONE`, delivered-version evidence, unresolved items, and the non-proof boundary. For parent closeout, also return clause-to-child evidence coverage, the integration result, and durable deferred work.
