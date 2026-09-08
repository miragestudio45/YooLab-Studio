# Reference & audit material

Files here are development references only. Nothing in this directory is fetched
at runtime, and keeping it outside `public/` stops ~55 MB of capture data from
shipping as website assets.

| Path | What it is | Why it is kept |
| --- | --- | --- |
| `har/bee.har` | 22-request capture of the source bee demo | Verifies model, clips, textures and the optical pipeline |
| `har/peachweb.io.har` | 99-request capture | Verifies the Fish/Jelly models, material names, clips and scene state |
| `har/Car.har` | 112-entry capture | Verifies the protected loader, Formula textures, props and transforms |
| `design/figma.png` | Screenshot of the shipped YooStudio product UI | Source of the official YooLab mark, the brand teal, and the timeline track colours reproduced in `StudioDemo` |
| `design/ezgif-1b0b7f3260a94a.webp` | Reference raster | Unused by the site |
| `design/Background/1.jpg` | Earlier background candidate | Superseded by the liquid shader |

The YooLab mark **used to be** traced from `design/figma.png`. It no longer is:
`public/brand/yoolab-logo.svg` and `public/brand/yoolab-icon.svg` are the
official vectors, and `app/components/BrandMark.tsx` is generated from them by
`scripts/build-brand-mark.mjs`. Nothing about the mark is read off this
screenshot any more — only the YooStudio timeline colours still are.

## The harnesses

Every one of these drives a real headed Chrome off-screen over CDP, because the
agent browser pane reports `visibilityState: hidden`, so `requestAnimationFrame`
never fires and WebGL never composites.

| Command | Answers |
| --- | --- |
| `node reference-audit/shots.mjs [--viewport w2560] [shot ...]` | What does it look like? |
| `node reference-audit/measure.mjs` | Does every section compose in one viewport, at eleven of them? |
| `node reference-audit/probe.mjs <script.js> [--viewport w1512] [--motion]` | One ad-hoc question, answered in the live page |
| `node reference-audit/wash-clip.mjs` | Is any soft wash clipped into a visible rectangle, at any ratio? |
| `node reference-audit/cinema.mjs` | Scroll-sequence capture |

`--motion` on `probe.mjs` forces `prefers-reduced-motion: no-preference`. It
exists because its absence produced a false pass: the harness inherits the host
OS's animation setting, so on a machine with Windows' animations off every motion
path correctly switches itself off and the probe reports the opt-out working
while asserting nothing.

`probes/` holds committed probe scripts for `probe.mjs`. `wash-clip.js` is the
one with its own runner.

### They find the dev server rather than assuming it

`vite.config.ts` prefers port 3000 and takes the next free one if something else
holds it, so a hard-coded `localhost:3000` is a guess — and the dangerous kind:
pointed at a *stale* server it returns plausible, wrong answers. It cost real
time here, reporting a fix as not working while reading a server two edits
behind.

So the dev server records the port it actually bound to `.cache/dev-server.json`
and `dev-url.mjs` verifies something is listening there before using it. An
explicit `--url` still wins, and 3000 is the fallback for a first run with no
cache file. When a run prints `[dev-url] using recorded dev-server port 3001`,
that is why.
