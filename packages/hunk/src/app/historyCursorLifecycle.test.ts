import { expect, test } from "bun:test";
import type { VcsHistorySource } from "../core/vcs/types";
import { createHistoryCursorLifecycle } from "./historyCursorLifecycle";

/** Reproduce a provider that closes automatically when cancellation releases its final read. */
test("close retains cleanup failure when an aborted read races EOF", async () => {
  const abort = new AbortController();
  let closed = false;
  let cleanupCalls = 0;
  const failure = new Error("Provider cleanup rejected");
  const source: VcsHistorySource = {
    async read({ signal }) {
      await new Promise<void>((resolve) =>
        signal!.addEventListener("abort", () => resolve(), { once: true }),
      );
      await source.close();
      return { commits: [], done: true };
    },
    async close() {
      if (closed) return;
      closed = true;
      cleanupCalls++;
      throw failure;
    },
  };
  const cursor = createHistoryCursorLifecycle(source, async () => source);
  const reading = source.read({ limit: 1, signal: abort.signal });

  abort.abort();
  const closing = cursor.close();
  const [cleanup, read] = await Promise.allSettled([closing, reading]);

  expect(cleanup).toEqual({ status: "rejected", reason: failure });
  expect(read.status).toBe("fulfilled");
  expect(cleanupCalls).toBe(1);
  expect(cursor.close()).toBe(closing);
});
