# 05: Publish the key-free recovery demo

**What to build:** A visitor can understand the two recovery decisions in the README and reproduce the example scores with one command.

**Blocked by:** 02 Recover when the order was saved, 03 Recover when the order was lost

**Status:** ready-for-agent

- [ ] Show the identical timeout cases side by side, including what the browser showed before the next decision and the final order records. Label scripted examples wherever scores appear.
- [ ] Provide one key-free replay command for both cases. Run that command in CI on pushes and pull requests and check the expected outcome and recovery scores, including deliberate failures.
- [ ] Document how to contribute a fictional recording via pull request. Keep contributed examples identifiable separately from baseline attempts.
- [ ] Include the MIT license for the original code and fictional fixtures. Use invented records in published examples.
