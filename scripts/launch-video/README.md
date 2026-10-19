# Hunk video pipeline

Generates Hunk product videos from real Hunk sessions — no screen recording.
The same pipeline supports single-feature demos, workflow explainers, launch
videos, and full-release roundups. This directory holds only the current Hunk
storyboard: the capture scenes (`capture.ts`) and the shot list, cards, and
captions (`compose.mjs`). The generic machinery — PTY driving, keyframe
rendering, storyboard planning, Chromium compositing, and the stage template —
is the `@hunk/term-video` package in `packages/term-video/`.

The full procedure — regeneration steps, environment gotchas, scene authoring,
storyboard model, and content-accuracy rules — lives in
[`skills/hunk-launch-video/SKILL.md`](../../skills/hunk-launch-video/SKILL.md).

`promo/` holds a free-form social cut: `promo.html` exposes a deterministic
`renderAt(t)` motion page built around the brand mark (h-shaped zoom
transitions, offset-outline extrusions, keycaps, stickers) over the same
captured frames, and `promo/render.mjs` steps it frame by frame and encodes
`<workDir>/promo.mp4`. Its work dir also needs
`@fontsource-variable/jetbrains-mono`; `--stills 1.5,8` renders review stills.
