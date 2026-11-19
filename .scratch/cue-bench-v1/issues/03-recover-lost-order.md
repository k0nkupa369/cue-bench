# 03: Recover when the order was lost

**What to build:** A reviewer can distinguish an evidence-based retry from a lucky retry after an order failed to save.

**Blocked by:** 01 Place and rescore a fictional order

**Status:** complete

- [x] The initial submission saves nothing and shows the same timeout as the saved-order case. The browser returns an explicit empty result for the exact reference.
- [x] A scripted recording that shows the empty result, retries once, and leaves exactly one correct order passes both scores.
- [x] A blind second submission that happens to create one correct order passes outcome and fails recovery. Stopping with no order fails both.
- [x] The offline checker requires the empty result to have been visible before the retry. Opening a list or seeing a loading indicator is insufficient evidence.

**Verification:** Verified the three lost-order recordings and compared saved and lost timeout screenshots at desktop and mobile widths. The timeout screens matched.
