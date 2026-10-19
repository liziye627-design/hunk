// Hunk's current video storyboard: its shot list, cards, and captions,
// composited by @hunk/term-video.
//
//   node scripts/launch-video/compose.mjs <workDir>
//
// <workDir> is the capture output dir (contains frames/) and must have a
// node_modules with playwright-core matching the Chromium build (see
// skills/hunk-launch-video/SKILL.md). Composited frames land in <workDir>/out.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeStoryboard } from "@hunk/term-video/compose";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const workDir = resolve(process.argv[2] ?? join(repoRoot, ".video-work"));

/** Inline one of the brand page's paper-colored logo exports at a fixed width. */
function brandLogo(id, width) {
  const svg = readFileSync(
    join(repoRoot, "website/public/brand/downloads", `${id}-paper.svg`),
    "utf8",
  ).trim();
  return svg.replace("<svg ", `<svg style="width: ${width}px; height: auto; display: block" `);
}

const FULL_FRAME = { x: 0.5, y: 0.5, scale: 1 };
const OPEN_TITLE = "hunk open — taskboard";
const DOCUMENT_CAMERA = { x: 0.62, y: 0.4, scale: 1.25 };
const LAYOUT_TITLE = "hunk diff — auto layout";
const SHELL_TITLE = "shell — taskboard";
const COMPLETION_CAMERA = { x: 0, y: 0, scale: 1.3 };

const OPEN_CARD = `
  ${brandLogo("logo-lockup", 640)}
  <div class="sub" style="margin-top: 22px">version <span class="hl">0.24</span> · made for review</div>
`;

const BROWSE_CARD = `
  <div class="badge">NEW</div>
  <h2>Browse any file or folder</h2>
  <div class="cmds">
    <div class="cmd"><span class="p">❯</span> hunk open</div>
  </div>
  <div class="foot">full syntax-highlighted files · lazy directory tree · live refresh</div>
`;

const LAYOUT_CARD = `
  <div class="badge">NEW</div>
  <h2>Pane-aware auto layout</h2>
  <div class="sub">split when there's room · unified when there isn't</div>
  <div class="foot">tunable with <span style="color: #e0af68">auto_split_min_width</span></div>
`;

const SKILL_CARD = `
  <div class="badge">NEW</div>
  <h2>Agent skills, version-matched</h2>
  <div class="cmds">
    <div class="cmd" style="font-size: 38px"><span class="p">❯</span> npx skills add modem-dev/hunk -g --skill hunk-review</div>
    <div class="cmd" style="font-size: 38px"><span class="p">❯</span> hunk skill show hunk-review</div>
  </div>
  <div class="foot">instructions load from the hunk you have installed</div>
`;

const COMPLETION_CARD = `
  <div class="badge">NEW</div>
  <h2>Shell completions</h2>
  <div class="cmds">
    <div class="cmd"><span class="p">❯</span> source &lt;(hunk completion bash)</div>
  </div>
  <div class="foot">bash and zsh · commands, flags, and flag values</div>
`;

const ALSO_ITEMS = [
  ["npm extensions", "hunk extension install @scope/pkg"],
  ["faster first keypress", "syntax highlighting moved to a worker"],
  ["scroll_off", "keeps 5 rows of context while stepping"],
  ["conflict diffs", "during paused merges and rebases"],
  ["extension APIs", "independent side panes and review filters"],
];

const ALSO_CARD = `
  <h2>Also in 0.24</h2>
  <div style="display: grid; grid-template-columns: auto auto; gap: 18px 40px; text-align: left; font-size: 36px; margin-top: 10px">
    ${ALSO_ITEMS.map(
      ([name, detail]) =>
        `<div style="color: #e0af68; font-weight: 700">${name}</div><div style="color: #c3cadf">${detail}</div>`,
    ).join("\n    ")}
  </div>
  <div class="foot">plus 50+ fixes and polish · full notes at hunk.dev/changelog</div>
`;

const OUTRO_CARD = `
  ${brandLogo("logo-lockup", 420)}
  <div class="cmds" style="margin-top: 18px">
    <div class="cmd" style="font-size: 38px"><span class="p">❯</span> curl -fsSL https://hunk.dev/install.sh | sh</div>
    <div class="cmd" style="font-size: 38px"><span class="p">❯</span> npm i -g hunkdiff</div>
  </div>
  <div class="foot">already installed? <span style="color: #e0af68">hunk update</span> · hunk.dev</div>
`;

// One entry per storyboard shot; timing/caption semantics are documented in
// @hunk/term-video/plan.
const SHOTS = [
  { kind: "card", html: OPEN_CARD, dur: 3.0, enter: true },

  // hunk open: tree walk, then the complete document.
  { kind: "card", html: BROWSE_CARD, dur: 2.8, enter: true },
  {
    kind: "term",
    img: "open-overview",
    title: OPEN_TITLE,
    dur: 1.8,
    enter: true,
    camera: FULL_FRAME,
    capKey: "open-tree",
    caption: `<span class="badge">NEW</span> browse a project — no diff required`,
  },
  ...Array.from({ length: 6 }, (_, i) => ({
    kind: "term",
    img: `open-tree-${i}`,
    title: OPEN_TITLE,
    dur: i === 5 ? 1.2 : 0.32,
    camera: FULL_FRAME,
    highlight: { x: 0.004, y: 0.03, width: 0.236, height: 0.395, label: "Git-aware tree" },
    highlightKey: "open-tree",
    capKey: "open-tree",
  })),
  {
    kind: "term",
    img: "open-document",
    title: OPEN_TITLE,
    dur: 3.0,
    camera: DOCUMENT_CAMERA,
    cameraKey: "open-document",
    motion: 0.85,
    capKey: "open-document",
    caption: `<span class="hl">Enter</span> opens the complete, highlighted file`,
  },
  ...Array.from({ length: 6 }, (_, i) => ({
    kind: "term",
    img: `open-scroll-${i}`,
    title: OPEN_TITLE,
    dur: i === 5 ? 1.4 : 0.4,
    camera: DOCUMENT_CAMERA,
    cameraKey: "open-document",
    capKey: "open-scroll",
    caption: `scroll it like any review — keyboard or mouse`,
  })),

  // Pane-aware auto layout: the files pane toggles split ⇄ unified.
  { kind: "card", html: LAYOUT_CARD, dur: 2.6, enter: true },
  {
    kind: "term",
    img: "layout-split",
    title: LAYOUT_TITLE,
    dur: 2.4,
    enter: true,
    capKey: "layout-split",
    caption: `plenty of width — <span class="hl">split</span> view`,
  },
  {
    kind: "term",
    img: "layout-unified",
    title: LAYOUT_TITLE,
    dur: 2.8,
    highlight: { x: 0.004, y: 0.068, width: 0.162, height: 0.256, label: "files pane" },
    capKey: "layout-unified",
    caption: `open the files pane — it switches to <span class="hl">unified</span>`,
  },
  {
    kind: "term",
    img: "layout-split-again",
    title: LAYOUT_TITLE,
    dur: 2.0,
    capKey: "layout-split-again",
    caption: `close it — back to split`,
  },

  // Agent skills printed by the installed binary.
  { kind: "card", html: SKILL_CARD, dur: 3.2, enter: true },
  {
    kind: "term",
    img: "skill-output",
    title: SHELL_TITLE,
    dur: 1.2,
    enter: true,
    camera: FULL_FRAME,
    cameraKey: "skill",
    capKey: "skill",
    caption: `skills ship <span class="hl">inside</span> the hunk binary`,
  },
  {
    kind: "term",
    img: "skill-output",
    title: SHELL_TITLE,
    dur: 2.8,
    camera: { x: 0, y: 0, scale: 1.5 },
    cameraKey: "skill",
    motion: 0.8,
    capKey: "skill",
  },

  // Shell completions.
  { kind: "card", html: COMPLETION_CARD, dur: 2.6, enter: true },
  {
    kind: "term",
    img: "completion-commands",
    title: SHELL_TITLE,
    dur: 2.6,
    enter: true,
    camera: COMPLETION_CAMERA,
    capKey: "completion-commands",
    caption: `<span class="hl">Tab</span> completes every command`,
  },
  {
    kind: "term",
    img: "completion-mode-typed",
    title: SHELL_TITLE,
    dur: 0.6,
    camera: COMPLETION_CAMERA,
    capKey: "completion-modes",
    caption: `…and flag values`,
  },
  {
    kind: "term",
    img: "completion-modes",
    title: SHELL_TITLE,
    dur: 2.4,
    camera: COMPLETION_CAMERA,
    capKey: "completion-modes",
  },

  { kind: "card", html: ALSO_CARD, dur: 5.0, enter: true },
  { kind: "card", html: OUTRO_CARD, dur: 4.2, enter: true },
];

const result = await composeStoryboard({ shots: SHOTS, workDir, rootDir: repoRoot });
console.log(
  `${result.uniqueFrames} unique frames, ${result.totalSeconds.toFixed(1)}s total -> ${result.concatPath}`,
);
