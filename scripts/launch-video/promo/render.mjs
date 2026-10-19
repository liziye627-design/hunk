// Renders the social promo cut: steps promo.html's renderAt(t) frame by frame
// in headless Chromium and encodes the frames with ffmpeg.
//
//   node scripts/launch-video/promo/render.mjs <workDir> [--stills 1.2,5.5] [--fps 30]
//
// <workDir> is the capture output dir (contains frames/) with playwright-core
// and @fontsource-variable/jetbrains-mono installed in its node_modules.
// Output: <workDir>/promo.mp4, or <workDir>/stills/*.png with --stills.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findCaptionFont, resolveChromium } from "@hunk/term-video/compose";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const args = process.argv.slice(2);
const workDir = resolve(args.find((arg) => !arg.startsWith("--")) ?? join(repoRoot, ".video-work"));
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const fps = Number(flag("fps") ?? 30);
const stills = flag("stills")?.split(",").map(Number);

const require = createRequire(join(workDir, "package.json"));
const { chromium } = require("playwright-core");
const fontPath =
  require.resolve("@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2");

const builtPath = join(workDir, "promo-built.html");
writeFileSync(
  builtPath,
  readFileSync(join(scriptDir, "promo.html"), "utf8")
    .replace("FONT_URL", pathToFileURL(fontPath).href)
    .replace("NERD_FONT_URL", pathToFileURL(findCaptionFont(repoRoot)).href)
    .replace("FRAMES_URL", pathToFileURL(join(workDir, "frames")).href),
);

const browser = await chromium.launch({
  executablePath: resolveChromium(),
  headless: true,
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (error) => console.error("page error:", error.message));
await page.goto(pathToFileURL(builtPath).href);
await page.evaluate(() => window.promoReady);
const duration = await page.evaluate(() => window.PROMO_DURATION);

if (stills) {
  const outDir = join(workDir, "stills");
  mkdirSync(outDir, { recursive: true });
  for (const t of stills) {
    await page.evaluate((time) => window.renderAt(time), t);
    await page.screenshot({ path: join(outDir, `t${t.toFixed(2)}.png`) });
  }
  console.log(`rendered ${stills.length} stills (duration ${duration.toFixed(2)}s) -> ${outDir}`);
} else {
  const outDir = join(workDir, "promo-out");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const total = Math.round(duration * fps);
  for (let frame = 0; frame < total; frame += 1) {
    await page.evaluate((time) => window.renderAt(time), frame / fps);
    await page.screenshot({ path: join(outDir, `f${String(frame).padStart(5, "0")}.png`) });
    if (frame % 60 === 0 || frame === total - 1) console.log(`frame ${frame + 1}/${total}`);
  }
  const output = join(workDir, "promo.mp4");
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(fps),
      "-i",
      join(outDir, "f%05d.png"),
      "-vf",
      "format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      output,
    ],
    { stdio: "inherit" },
  );
  if (ffmpeg.status !== 0) throw new Error("ffmpeg failed");
  console.log(`${total} frames, ${duration.toFixed(2)}s -> ${output}`);
}

await browser.close();
