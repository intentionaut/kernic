import { beforeEach, vi } from "vitest";

// Global safety net: no test should hit the real network. Individual tests
// that need to exercise fonts.ts's fetch call stub it explicitly with their
// own response/rejection; this default just makes an unstubbed real call
// fail loudly instead of silently reaching out from CI.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected real network call in a test — stub fetch explicitly in this test.");
    })
  );
});
