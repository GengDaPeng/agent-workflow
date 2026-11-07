# Verification execution and evidence

Read the affected project's runtime declaration, nearby scripts, test configuration and change-based check routing before choosing a command. Prepare only missing dependencies needed by the selected check; preserve package-script setup and environment when invoking a runner directly.

- Run the smallest check that proves the proposition, then regressions required by its actual impact. Follow the project's mandatory gates at their declared triggers.
- If no expected tests were selected, correct the working directory, forwarded arguments and selection, then rerun the target. An empty selection is not success; allowing zero tests or running an unrelated suite does not repair it.
- Bind expensive verification to a commit or fixed working-tree diff. Before reuse, inspect the complete change since that version plus runtime, configuration, dependency and test-data changes. Rerun affected or uncertain evidence; a new commit or review comment alone does not invalidate everything.
- When changing a runner, verification script or CI routing, check the changed tool and its consumer. Routing changes need both an input that should trigger and one that should not. Apply [verification-stop.md](verification-stop.md) before creating additional test infrastructure.
- Record the evidence version, exact command, exit status, proven proposition, unrun scope, environment limitations and remaining risks. For reused evidence, identify the original version, subsequent delta, applicability and reruns.
- Keep failed, pending, skipped and unavailable results distinct. Screenshots, manual inspection and static checks prove only their actual scope; they are not automated runtime-test success.
- Test-file presence and gate success do not replace direct behavioral evidence. Lower the conclusion when evidence is insufficient; do not weaken assertions or delete failing cases to manufacture completion.
