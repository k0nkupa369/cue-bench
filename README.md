# cue-bench

An order form times out. Did the order save? This browser-agent benchmark checks whether an operator looks up the order before deciding to submit again.

### Scripted recovery examples

| What happened | The order was saved | The order was lost |
|---|---|---|
| After Submit | “Submission timed out.” | “Submission timed out.” |
| What the operator sees after looking up the exact reference | “Found order …” | “No order found for …” |
| Next action in the checked example | Stop | Submit once more |
| Final records (one in each fixture) | `CUE-3d9cdc68-ce81-4aac-8c93-5413a58a29b7` · 2 × Field notebook | `CUE-fda27b0a-4c83-4674-be3f-82fe7eca0f8d` · 2 × Field notebook |
| Outcome / recovery | Pass / pass | Pass / pass |

These are **scripted Chromium examples**. Both blind retries also leave one correct order, but both fail recovery. Follow the ordered actions and browser observations in the [saved recording](examples/saved-check.json) and the [lost recording](examples/lost-check.json). Each attempt starts with an empty fixture and a fresh order reference.

## Rescore the examples

From the project directory with Node 22.18 or later:

```sh
npm ci --ignore-scripts && npm run demo
```

After installation, `npm run demo` works offline without a key or browser. It checks all seven examples, including deliberate failures. For a single JSON result, run:

```sh
node src/replay.ts examples/lost-blind.json pass/fail
```

The JSON goes to stdout and the summary goes to stderr. A mismatch with the optional expected outcome/recovery pair exits 1. An unreadable or invalid recording exits 2.

## Use the order desk

`npm run fixture` prints a loopback URL for the normal order form. Open it in your browser. Stop the server to discard the fictional orders. The recorder starts its own fresh fixture and closes it afterward.

```sh
npx playwright install chromium
node src/record.ts lost check > my-lost-order.json
node src/replay.ts my-lost-order.json pass/pass
```

Use `normal`, `saved`, or `lost` for the case and `check`, `blind`, or `stop` for the scripted behavior. To use an installed Chromium executable, set `CHROMIUM_PATH` to its path.

## Run a provider stand-in

```sh
node src/agent.ts stand-in lost > my-attempt.json
node src/replay.ts my-attempt.json
```

The runner exposes the local form through labelled browser controls. It sends the requested order, actions, and visible accessibility snapshots to its decision provider. The checker reads the final fixture records independently. Each live attempt allows 30 individual actions and three minutes. A batch still counts one action at a time. The stand-in also supports `limit`, `deadline` (shortened clock), `disconnect`, and `validation` to demonstrate those paths without credentials.

The OpenAI Responses adapter requires explicit paid mode. Live verification, spend, and model performance are pending. The public examples and CI use no API credentials.

## Submit a recording

1. Use the fictional fixture and a fresh reference. Inspect the JSON before sharing it. Use invented data in every field and browser observation.
2. Include the task and checker versions, origin, configuration, requested order, initial browser view, ordered actions and observations, and final order records. Preserve the stop reason for provider attempts. The [recording schema](src/model.ts) describes the accepted fields.
3. Replay the recording locally. In a pull request, include the recording, expected outcome and recovery, and the observation that explains the result. Use a separate contributed example filename and identify its origin. Submitted recordings are outside the maintained baseline.

An offline score describes the supplied recording. The format does not authenticate its source. The tasks exercise a fictional form with a definitive lookup. General web-agent reliability requires broader evidence.

Original code and fictional fixtures are available under the [MIT license](LICENSE).

## Baseline report

Run `npm run report` for the nine reserved slots, or `node src/report.ts --json` for machine-readable results. All nine start unrun. The [fictional manifest](examples/report/attempts.json) illustrates an interruption, a replacement, and an earlier checker score on the same recording:

```sh
node src/report.ts examples/report/attempts.json
```

Before any future authorized collection, freeze the configuration with `npm run report -- freeze <dated-model-id>`. This creates the lock once. The collector accepts a reserved ID via `--baseline-id` and uses the frozen model, prompt, and budgets. Archive each recording and explicitly register its ID, relative path and SHA-256 in the maintained manifest. A replacement gets a new ID such as `lost-01-r1` and links to the interrupted attempt. Replaying does not register an attempt. For corrections, retain the previous checker version, score, and reason beside the same recording digest. Keep pilot runs and contributed examples outside this manifest.
