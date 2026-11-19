# Retail operations research

Run `npm ci --ignore-scripts`, then `npm start`. Open the loopback URL printed in the terminal. The visitor site works without a key. Human attempts stay in the local study directory. The original order-form demo remains available with `npm run demo`.

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
