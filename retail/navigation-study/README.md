# Screenshot refresh experiment

Collected one OpenAI calibration and 12 matched pairs on the receiving desk. Each pair used the same seed, condition, repetition, model and limits. The treatment discarded queued actions after navigation.

| Outcome | Batch | Refresh after navigation |
|---|---:|---:|
| Finished before a valid posting | 12 / 12 | 9 / 12 |
| Made a valid posting | 0 / 12 | 3 / 12 |
| Correct final outcome | 0 / 12 | 1 / 12 |
| Excess units across attempts | 0 | 13 |
| Total API calls | 16 | 38 |
| Median elapsed seconds | 2.3 | 3.9 |

The treatment discarded 32 queued actions after navigation. Two refresh attempts reached their limit. All 12 batch attempts closed. In this sample refresh helped three runs reach a posting, but it also allowed excess stock to enter the ledger.

Including calibration, metered tokens imply US$0.07175. The conservative accounted total was US$0.07175 against a US$25 ceiling. These are token-price estimates from receipts.

The experiment covers one model snapshot and three fictional starting datasets. Repetitions on these seeds do not establish performance on other stores, interfaces or providers.

[Protocol](../EXPERIMENT.md) · [Paired differences and per-run IDs](report.json) · [Recordings](attempts) · [Evidence hashes](sha256.json)
