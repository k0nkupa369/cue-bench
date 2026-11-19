# 01: Place and rescore a fictional order

**What to build:** A contributor can place an order through a local fictional form and independently score the resulting recording.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Use TypeScript for the runner and checker. The normal case starts fresh, gives the operator a unique reference, and visibly confirms submission.
- [ ] A scripted browser session submits the requested fields. The JSON recording identifies its scripted origin, task and checker versions, configuration, ordered actions, observations after each action, and final order records.
- [ ] One key-free command rescores the recording offline. It reports outcome pass when exactly one correct order exists and recovery N/A for normal confirmation. Missing, duplicate, or incorrect orders fail the outcome check.
- [ ] The command emits a JSON result and a readable summary. Its exit status lets CI detect an invalid recording or a score that differs from the expected example.
