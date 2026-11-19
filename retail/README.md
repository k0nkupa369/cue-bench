# Retail operations research

Run `npm ci --ignore-scripts`, then `npm start`. Open the loopback URL printed in the terminal. The visitor site works without a key. Human attempts stay in the local study directory. The original order-form demo remains available with `npm run demo`.

[Read the measured findings](FINDINGS.md) from the 172-attempt receiving study. The collection source is pinned at `1efbc2f`.

## Try the work

Open the delivery note, compare it with the purchase order and post the delivered quantities. A timeout can hide a saved, lost or partial write. Inventory can lag the journal; the conflict case gives two independently visible, inconsistent records. If they cannot be reconciled, cite the affected product and both quantities in a supervisor handoff. Finish the job to reveal its condition and underlying ledger.

Transfers debit Wharf and credit Depot. Refunds use integer cents and cannot exceed the original paid balance. Each session resets the products and balances for its dataset. These workflows share the product definitions but operate in independent jobs. No real inventory, shipments or money are involved.

## Inspect the evidence

The replay room aligns matched recordings on the first timeout. The underlying ledger shown to the reviewer stays inaccessible to the study browser. The results explorer separates scripted calibration, human and OpenAI cohorts. Follow an attempt ID to see its actions, evidence and ledger effects. A scripted recording may use a deliberately poor retry policy.

To regenerate the 36 scripted calibration recordings with installed Chromium, run `npx playwright install chromium`, then `node src/retail/calibrate.ts`. An existing Chrome executable can be selected with `CHROMIUM_PATH`. Regeneration changes recording timestamps. Read the checked-in examples without regeneration using `npm run research:report`.

## Experiment design

The schedule is deterministic. `node src/retail/study.ts plan` prints every slot. Four calibration attempts exercise GPT-5.4 mini and nano on the same partial receipt in both interfaces. Development uses a clean control, both whole-order timeout cases, a partial receipt and an unresolved conflict, four starting datasets, two models, three repetitions: 120 attempts. The held-out comparison uses mini, the same six conditions in both interfaces (including stale inventory), four different datasets and one repetition: 48 attempts. The transfer and refund suites have scripted evidence; the paid study is on receiving.

The structured interface exposes page text and numbered visible links, fields and buttons. The pixel interface supplies a 1024×900 screenshot and accepts mouse, scroll and keyboard operations. It uses the Responses API with an application-owned screen driver. Each attempt starts in an isolated Chromium context with the same job brief, a 40-action maximum and a four-minute deadline. Full-page text versus viewport-only screenshots is part of the treatment. Deterministic datasets vary product identifiers and quantities within the same UI.

The runner pins model snapshots, prices, the task layout and collection source. It requires an explicit paid flag. One active collector owns the budget ledger. Each request reserves the worst-case context and output cost before submission. Actual token receipts replace reservations. Unmetered requests retain their full reservations. There is no automatic paid retry. Collectors on separate checkouts cannot coordinate a shared spend ceiling.

## Read the measurements

- Completion checks business state and valid escalation. Recovery checks post-fault decision evidence separately. Attempted excess and actual excess can differ when a guard blocks a transaction.
- Compare the same model, seed and repetition in clean versus disrupted conditions. Use the recorded time, actions and differences in success for each pair.
- The repeat statistic counts three-run sets where all three attempts succeed. Cost per correct job includes metered failed jobs. Missing receipts make it unavailable. Interruptions remain in the denominator.
- The held-out comparison pairs each structured run with a screenshot run at the same seed and condition. Seed-level intervals use a cluster bootstrap. Four seeds provide limited information about generalization to new datasets.
- `npm run research:report -- --json` emits row counts, missing IDs, cohort measurements, matched comparisons and per-attempt clean/fault differences. Published traces demonstrate these snapshots, workflows and budgets only.

## Sources and reproducibility

The study draws on paired clean/disrupted comparisons in [StressWeb](https://arxiv.org/abs/2604.16385), repeated-trial reliability in [τ-bench](https://arxiv.org/abs/2406.12045), multi-step work in [WorkArena](https://github.com/ServiceNow/WorkArena), and inspectable deterministic evaluation in [WebArena Verified](https://github.com/ServiceNow/webarena-verified). The fixture, records and interactions here are original fictional retail cases.

Costs use standard token rates from [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano). Reported metered cost is an estimate from provider receipts. Unknown charges are counted at their reservation ceiling in the spend audit.

Verify a complete published release with `node src/retail/verify-publication.ts`. It checks every scheduled recording, ledger, screenshot digest and the spend ceiling offline. `retail/published/revisions` preserves setup attempts made before the final protocol was frozen. Those earlier requests count toward the shared budget.

A browser can visit an evidence screen during a batch before the model gets another observation. The standard recovery grader checks the visit. The live analysis also reports how many recoveries still qualify when evidence pages must appear at a model observation boundary. A screenshot captures only its viewport. Retained DOM text is for audit and was not transmitted in pixel mode. These metrics cannot establish what the model attended to.

Paired point estimates use available complete pairs and show both matched and scheduled counts. Cluster intervals are withheld until all pairs for the comparison are available. For conflict cases, correct completion can mean handing off the discrepancy with verified conflicting quantities.

### Reproduce the paid collection

Use a separate checkout for a deliberately authorized independent replication; independent checkouts each have their own budget file. The following invocations consume API credit. Run them only with the intended project key, its spend controls enabled, and Chromium installed.

1. Read the design with `node src/retail/study.ts plan`. Rehearse without spending with `node src/retail/study.ts rehearse`.
2. Run `node src/retail/study.ts calibration --allow-paid` and inspect the four attempts. Ensure each interface delivered observations and returned metered actions. A failed business task is a valid model outcome.
3. Run `node src/retail/study.ts development --allow-paid --reviewed-calibration`, followed by the equivalent `heldout` command. An unmetered response stops new requests. Inspect the receipt ledger before explicitly retaining unknown reservations to continue. No failed attempt is silently replaced.
4. Completed work survives a restart. If a collector process died, inspect its lock and use `--recover` to retain the last checkpoint as an interruption. One collector may own a study checkout at a time.
5. `node src/retail/publish.ts` packages the complete local series into a new evidence directory after verification. The published directory contains fictional study data only. A release already present is preserved.
