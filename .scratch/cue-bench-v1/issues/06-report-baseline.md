# 06: Produce an auditable baseline report

**What to build:** A reader can audit which attempts were scheduled, which produced usable evidence, and how each published score was calculated.

**Blocked by:** 02 Recover when the order was saved, 03 Recover when the order was lost

**Status:** complete

- [x] Reserve three distinct attempt IDs for each of the three cases. Before the first scored run, freeze the task version, checker version, model version, prompt, and action and time budgets.
- [x] Generate machine-readable and human-readable results. Show each attempt, its origin, status, and applicable scores. Empty slots remain unrun. Replaying a recording adds no attempt.
- [x] Demonstrate an interruption and a separately identified replacement using clearly labelled fictional inputs. Preserve the original slot, last known state, and link to its replacement.
- [x] Demonstrate rescoring the same recording after a checker correction. Preserve the original score alongside the revised score, checker versions, and reason for the change.
- [x] Verify the report without a provider call. Leave the actual nine baseline slots unrun and keep pilot and contributed recordings outside the measured baseline.

**Verification:** Generated the text and JSON reports offline. Verified nine unrun real slots, the fictional interruption and replacement, checker 0 to 1 score history, and exclusive attempt claims in a temporary checkout. The actual model freeze and collection are deferred.
