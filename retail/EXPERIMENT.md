# Does observing again after navigation reduce premature closure?

This pilot compares two screenshot policies on the same receiving desk. The control executes up to four requested actions per observation. The treatment discards the remainder of a batch when navigation occurs and obtains a new observation. Both use the same screenshot, decision prompt, viewport and action vocabulary. Any discarded actions consume no browser action. The next observation costs an API call.

## Frozen design

Use GPT-5.4 mini snapshot 2026-03-17 on standard processing. Run one calibration outside the scored series. Compare both policies on seeds 21, 22 and 23, clean and partial receipt cases, and two repetitions. Alternate policy order. Each attempt has at most eight provider calls, 40 actions and four minutes. Each scheduled slot is claimed once. A completed but incorrect job is evidence.

The primary outcome is closing via Finish job before any valid posting. Secondary outcomes are making a valid posting, correct final state, excess stock units, elapsed seconds and provider requests. Each difference is treatment minus control for the same seed, condition and repetition. An interrupted attempt stays in the record. A missing or unfinished checkpoint is displayed and excluded from numerical paired effects. Inspect the frequency of early closure alongside posting and correctness: an agent that exhausts its calls before finishing can avoid early closure without solving the job. Three synthetic seeds support a descriptive comparison only.

## Reproduce or inspect

From the repository root, run these commands without a key to inspect the schedule and local results.

```sh
node src/retail/navigation-experiment.ts plan
node src/retail/navigation-experiment.ts report
```

To collect a separately authorized replication, install Chromium or set `CHROMIUM_PATH` and configure an OpenAI project key. First run `node src/retail/navigation-experiment.ts calibrate --allow-paid`. Inspect the calibration trace and usage. Then run `node src/retail/navigation-experiment.ts collect --allow-paid`. Each checkout has its own budget ledger under `retail/local/navigation-v1`. Running independent copies does not enforce a shared cap across them. The collector reserves all eight requests at the maximum uncached context price before starting each attempt. It replaces reservations with usage estimates and stops on missing receipts, stale checkpoints or source drift. Inspect an existing collector lock and its PID after an abrupt process exit before manually clearing a stale lock. Do not remove or reuse slot claims.

Other providers can use the same standalone policies in separately funded experiments. This pilot's schedule, price guard and authorization apply only to the pinned OpenAI model.
