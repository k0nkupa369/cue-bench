# 04: Record a bounded OpenAI attempt in a local browser

**What to build:** Provide a runner for an OpenAI agent to operate the local fictional app and produce a recording the same checker can score. Verify this ticket with a scripted provider stand-in.

**Blocked by:** 01 Place and rescore a fictional order

**Status:** ready-for-agent

- [ ] The agent can use only the browser UI. The checker alone can inspect fixture records and internal events. Credentials stay outside the browser and recording.
- [ ] The runner records actions and observations in order and identifies the agent configuration and run origin. A stand-in run produces a recording accepted by the offline checker.
- [ ] Stop at 30 individual browser actions or three minutes, whichever comes first. Enforce the cap inside a batch of actions, record the reason for stopping, and score the state reached.
- [ ] A simulated provider disconnect leaves an interrupted recording with the last known state. Release the browser on completion, interruption, or budget expiry.
- [ ] Verification requires no credentials or paid requests. Label live provider verification as pending.
