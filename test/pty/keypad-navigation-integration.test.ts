import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPtyHarness } from "./harness";

const harness = createPtyHarness();

/** Allow real terminal startup and paging acknowledgements on slower CI hosts. */
setDefaultTimeout(30_000);

afterEach(() => {
  harness.cleanup();
});

/** Compare the visible source rows without including transient status messages. */
function visibleTestLines(text: string) {
  return text.split("\n").filter((line) => /\bline\d{3}\b/.test(line));
}

describe.each(["split", "unified"])("PTY keypad paging in %s layout", (mode) => {
  test.each([
    { label: "default", modifier: "", rejectedModifiers: [";2", ";5"] },
    { label: "Ctrl-rebound", modifier: ";5", rejectedModifiers: ["", ";6"] },
  ])(
    "$label bindings match ordinary paging and reject wrong modifiers",
    async ({ modifier, rejectedModifiers }) => {
      const beforeLines = Array.from(
        { length: 200 },
        (_, index) => `export const line${String(index + 1).padStart(3, "0")} = ${index + 1};`,
      );
      const fixture = harness.createGitRepoFixture([
        {
          path: "paging.ts",
          before: `${beforeLines.join("\n")}\n`,
          after: `${beforeLines.map((line) => line.replace(" = ", " = 1000 + ")).join("\n")}\n`,
        },
      ]);
      const configHome = harness.createIsolatedConfigHome();
      if (modifier) {
        const configDir = join(configHome, "hunk");
        mkdirSync(configDir, { recursive: true });
        writeFileSync(
          join(configDir, "config.toml"),
          '[keybindings]\n"hunk.review.pageDown" = "ctrl+pagedown"\n"hunk.review.pageUp" = "ctrl+pageup"\n',
        );
      }

      const session = await harness.launchHunk({
        args: [
          "diff",
          "--mode",
          mode,
          "--theme",
          "github-dark-default",
          "--no-sidebar",
          "--no-wrap",
          "--cursor-line",
          "off",
        ],
        cwd: fixture.dir,
        cols: 120,
        rows: 30,
        env: { XDG_CONFIG_HOME: configHome },
      });

      try {
        await session.waitForText("line001", { timeout: 15_000 });
        await harness.ensureKeyboardIsLive(session);
        const initialLines = visibleTestLines(await session.text());
        expect(initialLines.length).toBeGreaterThan(0);
        expect(initialLines[0]).toContain("line001");

        // Ordinary PageDown/PageUp establish the expected viewport in this layout and keymap.
        session.writeRaw(`\x1b[6${modifier}~`);
        const ordinaryDown = await harness.waitForSnapshot(
          session,
          (text) => visibleTestLines(text).length > 0 && !text.includes("line001"),
        );
        const downLines = visibleTestLines(ordinaryDown);
        session.writeRaw(`\x1b[5${modifier}~`);
        const ordinaryUp = await harness.waitForSnapshot(session, (text) =>
          text.includes("line001"),
        );
        expect(visibleTestLines(ordinaryUp)).toEqual(initialLines);

        // Send Kitty's actual keypad codes through the live CLI, rather than synthesizing events.
        session.writeRaw(`\x1b[57422${modifier}u`);
        const keypadDown = await harness.waitForSnapshot(
          session,
          (text) => visibleTestLines(text).length > 0 && !text.includes("line001"),
        );
        expect(visibleTestLines(keypadDown)).toEqual(downLines);

        for (const rejectedModifier of rejectedModifiers) {
          for (const code of [57421, 57422]) {
            // Help acknowledges the preceding key; test rejection away from either scroll boundary.
            session.writeRaw(`\x1b[${code}${rejectedModifier}u?`);
            await session.waitForText("Controls help");
            session.sendKey("escape");
            const afterRejectedKey = await harness.waitForSnapshot(
              session,
              (text) => !text.includes("Controls help") && visibleTestLines(text).length > 0,
            );
            expect(visibleTestLines(afterRejectedKey)).toEqual(downLines);
          }
        }

        session.writeRaw(`\x1b[57421${modifier}u`);
        const keypadUp = await harness.waitForSnapshot(session, (text) => text.includes("line001"));
        expect(visibleTestLines(keypadUp)).toEqual(initialLines);
      } finally {
        session.close();
      }
    },
  );
});
