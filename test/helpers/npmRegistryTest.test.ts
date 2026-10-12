import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNpmRegistryTest } from "./npmRegistryTest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Isolate failed registry startup without launching a real server. */
function createRegistryRootTest() {
  const root = mkdtempSync(join(tmpdir(), "hunk-registry-startup-test-"));
  roots.push(root);
  return root;
}

test("does not start a registry process when configuration preparation fails", async () => {
  const root = createRegistryRootTest();
  mkdirSync(join(root, "user.npmrc"));
  const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
    throw new Error("Unexpected process launch during failed setup");
  });
  try {
    await expect(createNpmRegistryTest(root)).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
  }
});

for (const mode of ["invalid-url", "read-error"] as const) {
  test(`kills and awaits the registry process after ${mode} during startup`, async () => {
    const root = createRegistryRootTest();
    let exitAwaited = false;
    const kill = mock(() => {});
    const proc = {
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          if (mode === "read-error") {
            controller.error(new Error("Registry readiness failed"));
          } else {
            controller.enqueue(new TextEncoder().encode("invalid-registry-url\n"));
            controller.close();
          }
        },
      }),
      kill,
      get exited() {
        exitAwaited = true;
        return Promise.resolve(1);
      },
    };
    // Startup owns only readiness, termination, and exit; the fake omits unrelated process I/O.
    const spawn = spyOn(Bun, "spawn").mockReturnValue(
      proc as unknown as ReturnType<typeof Bun.spawn>,
    );
    try {
      await expect(createNpmRegistryTest(root)).rejects.toThrow(
        mode === "read-error" ? "Registry readiness failed" : "Test registry did not start",
      );
      expect(kill).toHaveBeenCalledTimes(1);
      expect(exitAwaited).toBe(true);
      expect(proc.stdout.locked).toBe(false);
    } finally {
      spawn.mockRestore();
    }
  });
}
