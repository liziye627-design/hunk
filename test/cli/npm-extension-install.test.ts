import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNpmRegistryTest } from "../helpers/npmRegistryTest";

setDefaultTimeout(60_000);
const source = resolve(import.meta.dir, "../../packages/hunk/src/main.tsx");
const commands = [
  { label: "source", argv: [process.execPath, source] },
  ...(process.env.HUNK_TEST_BINARY
    ? [{ label: "compiled", argv: [resolve(process.env.HUNK_TEST_BINARY)] }]
    : []),
];

for (const command of commands) {
  test(`${command.label} CLI installs npm extensions that import host APIs and dependencies, then updates/removes them`, async () => {
    const root = mkdtempSync(join(tmpdir(), "hunk-npm-cli-test-"));
    const registry = await createNpmRegistryTest(root);
    try {
      registry.publish("hunk-cli-test-dependency", "1.0.0", {
        manifest: {
          hunk: undefined,
          type: "module",
          main: "index.js",
          peerDependencies: { hunkdiff: "999.0.0", react: "999.0.0" },
        },
        files: {
          "index.js": `import { HunkExtensionUserError } from "hunkdiff/extension";
import { useState } from "react";
export { HunkExtensionUserError as helperError, useState as helperUseState };
export default 42;`,
        },
      });
      const manifest = {
        hunk: { extensions: ["./entry.ts"] },
        dependencies: { "hunk-cli-test-dependency": "1.0.0" },
        peerDependencies: { hunkdiff: "999.0.0" },
      };
      const files = {
        "entry.ts": `import { HunkExtensionUserError } from "hunkdiff/extension";
import { useState } from "react";
import value, { helperError, helperUseState } from "hunk-cli-test-dependency";
export default function (hunk) {
  hunk.registerCliCommand({ name: "npm-test-command", summary: "Test installed npm imports" }, async (args, ctx) => {
    if (value !== 42 || helperError !== HunkExtensionUserError || helperUseState !== useState) throw new HunkExtensionUserError("Dependency host identity failed");
    await ctx.stdout.write("Host API and dependency OK: " + value + "\\n");
    return { kind: "exit" };
  });
}`,
      };
      const config = join(root, "config");
      const env = { ...process.env, ...registry.env, XDG_CONFIG_HOME: config };

      /** Run the real entrypoint without interactive UI or public registry access. */
      function run(args: string[], exitCode = 0) {
        const proc = Bun.spawnSync([...command.argv, ...args], {
          cwd: root,
          env,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          timeout: 30_000,
        });
        if (proc.exitCode !== exitCode)
          throw new Error(`Unexpected exit ${proc.exitCode}: ${proc.stderr?.toString()}`);
        return proc.stdout?.toString() ?? "";
      }

      registry.publish("@hunk-cli-test/guide", "1.0.0", { manifest, files });
      expect(run(["extension", "install", "npm:@hunk-cli-test/guide@^1.0.0", "--yes"])).toContain(
        "Installed @hunk-cli-test/guide v1.0.0",
      );
      expect(run(["npm-test-command"])).toContain("Host API and dependency OK: 42");
      expect(run(["extension", "list"])).toContain(
        "npm:@hunk-cli-test/guide  v1.0.0  npm:@hunk-cli-test/guide@^1.0.0",
      );
      registry.publish("@hunk-cli-test/guide", "1.1.0", { manifest, files });
      expect(run(["extension", "update", "npm:@hunk-cli-test/guide"])).toContain(
        "v1.0.0 -> v1.1.0",
      );
      expect(run(["npm-test-command"])).toContain("Host API and dependency OK: 42");
      const recordsPath = join(config, "hunk", "extensions", "installed", "records.json");
      const before = readFileSync(recordsPath, "utf8");
      registry.publish("@hunk-cli-test/guide", "1.2.0", {
        manifest: { hunk: { extensions: ["./missing.ts"] } },
      });
      run(["extension", "update", "npm:@hunk-cli-test/guide"], 1);
      expect(readFileSync(recordsPath, "utf8")).toBe(before);
      expect(run(["npm-test-command"])).toContain("Host API and dependency OK: 42");
      expect(run(["extension", "remove", "npm:@hunk-cli-test/guide"])).toContain(
        "Removed npm:@hunk-cli-test/guide",
      );
      expect(run(["extension", "list"])).toContain("No managed extension installs");
    } finally {
      await registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
