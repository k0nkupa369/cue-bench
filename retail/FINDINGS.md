# Live receiving study

On 19 November 2026, cue-bench collected four calibration, 120 development and 48 held-out attempts on fictional warehouse receipts. Transfer and refund workflows have scripted calibration evidence. The earlier single-order pilot uses a different fixture and is outside this study.

## Performance

| Cohort | Correct jobs | Recovery passes / reached timeout | Runs with excess or broken ledger | Excess units | Unsafe writes | Unnecessary handoffs / resolvable jobs | Justified handoffs / conflict jobs |
|---|---:|---:|---:|---:|---:|---:|---:|
| development/gpt-5.4-nano-2026-03-17/controls | 4 / 60 | 0 / 23 | 17 | 306 | 11 | 0 / 48 | 0 / 12 |
| development/gpt-5.4-mini-2026-03-17/controls | 12 / 60 | 0 / 43 | 6 | 68 | 12 | 3 / 48 | 0 / 12 |
| heldout/gpt-5.4-mini-2026-03-17/controls | 2 / 24 | 0 / 18 | 2 | 26 | 6 | 2 / 20 | 0 / 4 |
| heldout/gpt-5.4-mini-2026-03-17/pixels | 0 / 24 | 0 / 1 | 1 | 37 | 1 | 0 / 20 | 0 / 4 |

## Efficiency

| Cohort | Actions, median | Seconds, median / p95 | Metered USD | USD per correct job | Interrupted | All three repetitions succeeded |
|---|---:|---:|---:|---:|---:|---:|
| development/gpt-5.4-nano-2026-03-17/controls | 16 | 21.1 / 59.3 | $0.2149 | $0.0537 | 3 | 0.0% of 20 sets |
| development/gpt-5.4-mini-2026-03-17/controls | 9 | 7.7 / 41.4 | $0.3077 | $0.0256 | 0 | 0.0% of 20 sets |
| heldout/gpt-5.4-mini-2026-03-17/controls | 9.5 | 9.1 / 22.6 | $0.1175 | $0.0588 | 0 | — |
| heldout/gpt-5.4-mini-2026-03-17/pixels | 3 | 3.1 / 8.1 | $0.0542 | — | 0 | — |

## Where the workflows stopped

- development/gpt-5.4-nano-2026-03-17/controls: 27 / 60 attempts made a valid posting. Of 48 assigned disrupted cases, 23 actually reached a timeout.
- development/gpt-5.4-mini-2026-03-17/controls: 53 / 60 attempts made a valid posting. Of 48 assigned disrupted cases, 43 actually reached a timeout.
- heldout/gpt-5.4-mini-2026-03-17/controls: 21 / 24 attempts made a valid posting. Of 20 assigned disrupted cases, 18 actually reached a timeout.
- heldout/gpt-5.4-mini-2026-03-17/pixels: 1 / 24 attempts made a valid posting. Of 20 assigned disrupted cases, 1 actually reached a timeout.

This distinction matters when comparing interfaces: a run that never posts cannot demonstrate recovery, but it still counts in overall completion.

## Matched comparisons

- **mini minus nano** across 60 matched pairs. The completion difference averaged 13.3 percentage points across four seeds. The 95% empirical seed-resampling range was 8.3 to 18.3 points.
- **controls minus pixels** across 24 matched pairs. The completion difference averaged 8.3 percentage points across four seeds. The 95% empirical seed-resampling range was 0.0 to 16.7 points.

Each pair uses the same starting dataset, condition and repetition. Four deliberately constructed seeds give a narrow picture of task variation. The range describes this dataset. Development used three repetitions; the interface comparison used one per held-out case. See the matched comparison page in the app for the clean-versus-disrupted action and time differences and links to both traces.

## Inspect one failure

The third mini attempt on dataset 1 requested the intended 12 ink and 8 moss jackets. The timeout saved only the ink line. After several invalid post attempts, a later write added one more ink jacket. The final ledger contained 13 ink and zero moss jackets. This is both over-receipt on one line and a shortage on the other. [Recorded attempt](published/attempts/development-1-partial-mini-controls-3.json)

## Spend and evidence

The collector registered 1483 requests across all revisions. Receipts account for **US$0.7149** in estimated model usage. 4 initial HTTP 400 responses had no token receipt. Retaining their full reservations gives a conservative total of **US$1.4818**, within the US$25 authorization. The setup revisions are archived separately from the frozen comparisons.

The first calibration used an invalid request format. A subsequent JSON-only calibration returned a metered but unparsable action. Both revisions were retained. The final collection used a strict browser-action schema. No failed scored attempt was replaced.

The four-minute clock includes provider and browser time. Multiple actions can be requested together. Recovery credits a qualifying screen visit, and the explorer separately counts recoveries supported by pages present at a model observation boundary. Click trajectories cannot establish what the model understood. The agents were evaluated with a fixed short prompt and a bounded action budget, so the findings apply to those configurations.

[Research protocol](README.md) · [Frozen manifest](published/manifest.json) · [Spend ledger](published/budget.json) · [Artifact digests](published/sha256.json)
