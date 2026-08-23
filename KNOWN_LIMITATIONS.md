# Known limitations

What this build does not do, stated plainly. The site itself says the same things
where a visitor would otherwise assume otherwise.

---

## Subjects with no content

**Khoa học vũ trụ** and **Lịch sử & Văn hóa** are listed in the subject switcher
and have nothing behind them. Both show a full-size empty state in the middle of
the workspace explaining why.

They are listed rather than hidden on purpose: the taxonomy is what YooLab is
building toward, and a visitor who can see the whole plan — including the parts
that are not done — can trust the parts that are. The reason in both cases is
that no source with verifiable commercial-use rights was found. See
[SOURCE_AUDIT.md](SOURCE_AUDIT.md) §6.

**Mô hình phân tử** (Chemistry) and **Phòng thực hành 3D** (STEM) exist as
`planned` manifest entries. They render as stated gaps with no controls, because
there is nothing behind a control to run.

## The virtual lab does not exist

The Practice & STEM section carries one working thing — the Formula workshop —
and an outline of a lab bench that has nothing behind it. There is deliberately
no button on that half of the section: a disabled "Bắt đầu" would be the one
piece of furniture on the page that lies.

Chemistry and physics lab work (instruments, procedures, reagents) is the next
large piece of work and is not started.

## Two cell models were rejected, not lost

The NIH Animal Cell (3DPX-015797) and Neuron (3DPX-015796) meshes are
`CC-BY-NC-SA` — NonCommercial — and cannot ship on a product site. The animal
cell in the Library is therefore YooLab-authored procedural geometry rather than
a scanned mesh, and there is **no neuron**. Recorded in
[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) so nobody re-adds them believing
the surrounding repository's MIT licence covered them.

## Commercial terms are not stated anywhere

No pricing, no free tier, no trial length, no seat or asset quota, no
feature-gating. YooLab has published none of those, so the site invents none of
them. The CTA asks for a conversation.

## No customer evidence

No school logos, no testimonials, no user counts, no case studies. YooLab has not
published a customer list. The Proof section says this outright and offers
product evidence instead — five things that open and run on the page.

## Things named in the UI that are not implemented

- **YooStudio's rail** lists nine modules (Không gian, Bước, Mô hình, Văn bản, Âm
  thanh, Media, Hotspot, Hiệu ứng, Tạo Quiz). Selecting one switches the tool and
  the properties panel; Model, Văn bản and Hiệu ứng do real work on the live
  scene. Media, Hotspot and Tạo Quiz change the tool but have no authoring UI
  behind them yet.
- **The audio track** in the timeline says so in its own panel: "Bản demo này
  chưa kèm tệp âm thanh."
- **"Xem trước" and "Đặt góc nhìn"** in the Studio topbar: "Đặt góc nhìn" frames
  the selection for real; "Xem trước" is inert.
- **Footer legal links** (Quyền riêng tư · Điều khoản) have no destinations.
- **"Thêm vào bài giảng"** in the Library links to the YooStudio section; it does
  not transfer the selected specimen into the editor. The editor demo is a fixed
  jellyfish scene.

## Interaction gaps in the Library

- **Compare** — the Library has no side-by-side comparison mode. The knowledge
  panel describes one specimen at a time.
- **Cross-section / layer isolation** exists only in the cell (`tách bào quan`)
  and in the Explore jellyfish. GLB specimens support orbit and zoom, not
  clipping planes or per-part isolation, because those meshes are not authored
  in separable parts.
- **Quiz** — no assessment anywhere. Learning goals are stated, not tested.
- **The molecule viewer** is not built (see above).

## Verification not performed

**No screenshots were captured.** The browser pane in this environment reports
`visibilityState: "hidden"`, so `requestAnimationFrame` never fires, no WebGL
frames are composited, and screenshot capture times out. Consequences:

- Layout, copy, DOM structure, computed styles, element geometry, breakpoint
  behaviour, state transitions, asset delivery and console cleanliness were all
  verified by measurement and interaction — at 1920, 1440, 1366, 768 and 375,
  with no horizontal overflow at any of them, and every interactive surface
  exercised in both dev and the production build.
- **Rendered 3D output was not seen.** The bee's entrance timing, its size in the
  hero, the jellyfish's diagonal framing, material appearance, the atom, the cell
  and the globe are all correct by construction and by arithmetic, but no human
  or machine has looked at a frame of them in this build. The camera framing in
  particular is calculated (the bee spans ~49% of frame width at its shot
  distance) rather than eyeballed, and is the most likely thing to want a nudge
  once someone can see it.

Anyone with a visible browser should scroll the whole page once and look at:
the bee's entrance and its scale in the hero, the bee→fish and fish→jellyfish
hand-offs, reverse scrolling back up through them, the jellyfish framing, and
each of the four Library experiences.

## Environment note for the next person

The mobile knowledge sheet toggles with `display` rather than animating its
height. That is deliberate — the panel's content runs to ~880 px and a fixed
`max-height` collapse silently clipped it into a nested scroller — but it means
the sheet appears instantly rather than sliding. If a slide is wanted later, it
needs a measured-height animation, not a magic number.

## Browser and platform

- WebGL2 is assumed. There is no 2D fallback; a context failure shows a message
  rather than a degraded scene.
- The Explore stage, YooStudio and the Library viewer are three separate WebGL
  contexts. They pause when off screen, but a browser with a low context limit
  and other WebGL tabs open may drop one.
- Touch: orbit and pick work; there is no pinch-zoom gesture on the Library
  viewer (wheel zoom only).
- `prefers-reduced-motion` is honoured everywhere — the bee's entrance resolves
  instantly, idle turns stop, mixers hold their pose.

## Content

All copy is Vietnamese. There is no i18n layer, no locale routing and no English
version. Element names use the IUPAC forms of the 2018 curriculum, with the
familiar Vietnamese name in parentheses where one is established.
