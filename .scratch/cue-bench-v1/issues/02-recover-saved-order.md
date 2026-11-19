# 02: Recover when the order was saved

**What to build:** A reviewer can see whether the operator checked a timed-out submission before risking a duplicate.

**Blocked by:** 01 Place and rescore a fictional order

**Status:** ready-for-agent

- [ ] The fixture saves the order and shows a timeout. The exact-reference lookup visibly returns the saved order. The task instructions and visible timeout are the same as in the lost-order case.
- [ ] A scripted recording that shows the matching order before stopping passes both outcome and recovery. Stopping without that observation passes outcome and fails recovery.
- [ ] A second submission before observing the matching record fails recovery, even if duplicate prevention leaves exactly one correct order. Count a keyboard submission the same way as a button submission.
- [ ] The offline checker uses the ordered UI evidence for recovery and the final records for outcome. Merely opening the list or finding the record after the retry does not establish a prior check.
