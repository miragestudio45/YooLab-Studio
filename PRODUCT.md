# YooLab — product context

*Captured for Impeccable. Product truth only; visual decisions live in DESIGN.md.*

## What it is

A Vietnamese 3D/XR learning platform, presented as a single-page product site. Three
things are real and running on the page itself: a multi-subject **Library** of 3D
learning material, the **YooStudio** authoring workspace, and the **Formula**
hands-on workshop (assemble → observe → drive).

## Who it is for

| Role | Wants | Success on this page |
|---|---|---|
| **Giáo viên** (teacher) | Build a 3D lesson without writing code | Believes the editor is real; opens a specimen |
| **Học sinh** (student) | Explore and create, not just watch | Rotates a model, changes its state |
| **Nhà trường** (school) | One shared digital library, deployable | Sees range and asks for a consult |

Primary language is Vietnamese. Copy is long-word, diacritic-heavy — every type
decision has to survive `Bạn vừa khám phá một bài học trong YooLab.`

## Non-negotiable product truths

- **No invented proof.** No school logos, no testimonials, no user counts — none
  are published. Evidence is "open it now and judge for yourself".
- **Unfinished things say so.** The 3D lab bench does not exist; it is a stated gap
  with nothing to click. `Đang bổ sung` flags are honest, not decorative.
- **Every visual is a real render** of an asset that ships in this repository,
  baked through the shared thumbnail renderer.
- Formula, the Library and the bridge all open the **same** full-screen overlay,
  so it is one gate (`FormulaGate`), not three.

## The journey (nine stops, one question each)

1. **Explore** — what is YooLab? (Bee → Fish → Jellyfish, one continuous camera)
2. **Bridge** — that was a lesson, and you can build it
3. **YooStudio** — how do I make one?
4. **Workflow ribbon** — where does a lesson go?
5. **Library** — where does content come from?
6. **Practice / STEM** — what can I simulate?
7. **Education** — what do I get out of it? (teacher / student / school)
8. **Proof** — what actually works?
9. **Start** — what do I do now?

A stop says its one thing once. Two sections making the same claim is how the page
gets long without getting stronger.

## Technical constraints

- Next.js 16 App Router served through `vinext` / Vite; deploys to Cloudflare
  Workers. No image CDN, no runtime service — the site is static plus WebGL.
- `three` 0.185 hand-rolled: no react-three-fiber. Every stage mounts from an
  effect, sizes its canvas from a `ResizeObserver`, and is gated on visibility.
- Percentage canvas heights need a **definite** ancestor height, or canvas and
  observer chase each other. Every workspace pins a height for this reason.
- Bee (2.6 MB rigged, two-pass refraction), fish and jellyfish shaders are
  finished work and out of scope for visual passes. Camera framing is not.
- `svh`, never `vh`: mobile Safari's `vh` is the largest viewport, so a `100vh`
  block is taller than the screen while the URL bar shows.
- QA is screenshot-led through `reference-audit/shots.mjs` (off-screen real Chrome
  over CDP — the agent browser pane reports `visibilityState: hidden`, so
  `requestAnimationFrame` never fires and WebGL never composites).

## Scope of the 2026-08-23 pass

Visual lock. One grid, one font, viewport-first composition, responsive regimes
1920 / 1512 / 1440 / 1366 / 1024 / 768 / 390. No new educational content, no new
repositories, no product-architecture changes.
