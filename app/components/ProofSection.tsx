'use client';

import { openLibraryExperience } from '../lib/library/openExperience';
import { READY_EXPERIENCES, SUBJECTS, experienceById } from '../lib/library/manifest';
import { RailVisual } from './library/RailVisual';
import type { ExperienceManifest } from '../lib/library/types';

/**
 * Proof, built from evidence rather than from claims.
 *
 * YooLab has published no customer list, so this section carries no school
 * logos, no testimonials and no user counts: inventing any of those would damage
 * trust more than having none. What it carries instead is stronger and checkable
 * on the spot — every card opens something that is running on this page right
 * now, and the set spans five different subjects so the range is evidence too.
 *
 * ## Why it is a belt now and not a row of four
 *
 * Four cards proved that a lesson exists. They could not prove there is a
 * *library* of them, and that is the claim this section is actually making — the
 * heading says "những bài học", plural, over a set small enough to count at a
 * glance. Sixteen cards moving past continuously say "there are more of these
 * than fit on your screen" in the one way a static grid cannot, and the fifteen
 * the visitor has not read yet are the argument.
 *
 * ## Every card is a manifest entry, and nothing here is authored
 *
 * `BELT` is a list of ids. Titles, subtitles, subject labels, subject tints and
 * pictures are all read from `lib/library/manifest.ts` at render time, so a card
 * cannot drift from the thing it opens and a renamed lesson renames its own
 * card. `experienceById` returning nothing is a build-time-visible mistake
 * rather than a silent gap: the id is dropped from the belt and the count in the
 * lede — which is `BELT.length` and not a typed number — goes down with it.
 *
 * ## The picture rule, and the one constraint on this set
 *
 * `RailVisual` is the Library's own rule about what a picture may be: anything
 * with a real mesh gets a real render of that mesh, everything else gets a drawn
 * diagram on its subject's tint. A picture here is therefore either the object
 * itself or visibly a diagram of it, never a decorative stand-in for an asset
 * that does not exist.
 *
 * **The set below is deliberately restricted to entries whose visual costs this
 * page nothing new.** Fifteen resolve to drawn marks, which are inline SVG; the
 * bee resolves to a bake this section was already paying for, and the workshop
 * to a photograph the Library rail already loads. No entry whose `rail` names an
 * unbaked GLB is in the list — a belt that pulled the T-rex, the clownfish and
 * the toolkit into every visitor's scroll would be several megabytes spent on a
 * marketing strip. When a lesson gets a real cover render, giving its manifest
 * entry a `thumbnail` rail is the whole change; it flows through here with no
 * edit to this file.
 */

/**
 * Sixteen ids, alternating a real render with a drawn one.
 *
 * Two rules fight here and the resolution is worth writing down.
 *
 * The first is **pictures over diagrams**. The belt shipped as sixteen drawn
 * `LibraryMark` line diagrams and came back from review as ugly, which it was:
 * they are drawings of objects this repository owns the actual meshes for. Eight
 * of the sixteen below are now pre-baked renders of those meshes — see
 * `scripts/bake-library-covers.mjs` and the `cover` field in `types.ts` — and
 * one is a photograph. The remaining seven are entries with **nothing to render**:
 * the periodic table is a DOM grid, the physics labs are simulations and the
 * molecules are generated from bond tables at runtime. A drawn mark is the
 * honest picture of those, and dropping them would make the belt claim the
 * library is only biology.
 *
 * A third rule arrived with the second review of the pictures: **a mesh existing
 * is not a reason to put it on the belt.** The lungs, the brain and the eye are
 * near-white HuBMAP meshes, anatomy may not be repainted to look better, and at
 * 240 px they read as pale smudges next to a bee. They are still in the Library,
 * where they are rendered live at full size and their pallor is the specimen
 * rather than the picture. The belt takes the covers that carry — the four
 * creatures, the heart, the liver, the kidney and the gallbladder — and leaves the
 * rest to the section that can show them properly. Eight, not the nine an
 * earlier draft of this note claimed: the paint jar is white on white and failed
 * exactly the same test as the lungs.
 *
 * The bacterial wall was on this list for one round, kept on the argument that a
 * peptidoglycan lattice is structurally distinctive in a way a pale organ is not.
 * Once the covers were relit as product shots the argument stopped holding: a
 * near-white lattice on cream is still a near-white shape on cream, and it was
 * the only cover in the set with no visible contact shadow, because it is flat
 * on the ground and hides its own. `organ-gallbladder` took the slot — it is the
 * one organ in the anatomy set that is genuinely *green*, so it carries at 240 px
 * and it is the only hue on a belt that is otherwise pink, red, blue and purple.
 *
 * The second is **colour rhythm**: grouped by subject the belt reads as four
 * blocks of one tint sliding past, so the order interleaves. But only Sinh học
 * has meshes, so a strict no-two-neighbours-alike rule would have capped the
 * renders at eight. The renders win — that is what the review was about — and
 * the order alternates render / diagram instead, which turns out to carry the
 * same rhythm: every card entering the frame is a different *kind* of picture
 * from the one leaving it.
 */
const BELT = [
  'bee',                // render
  'periodic-table',     // diagram — a DOM grid, no mesh
  'organ-heart',        // render
  'projectile-lab',     // diagram — a simulation
  'trex',               // render
  'globe-explorer',     // diagram — a canvas
  'organ-liver',        // render
  'molecule-caffeine',  // diagram — generated from a bond table
  'jellyfish',          // render
  'circuit-lab',        // diagram — a simulation
  'organ-gallbladder',  // render
  'earth-layers',       // diagram — a cross-section
  'clownfish',          // render
  'molecule-nacl',      // diagram — a generated lattice
  'organ-kidney',       // render
  'formula',            // photograph — the workshop is a full scene
];

type Card = { entry: ExperienceManifest; subject: string; tint: string };

const CARDS: Card[] = BELT.flatMap((id) => {
  const entry = experienceById(id);
  const subject = entry && SUBJECTS.find((item) => item.id === entry.subject);
  if (!entry || !subject) {
    /* Loud, because the failure is otherwise invisible: a mistyped id silently
       shortens the belt and the lede's count goes down with it, so the page
       stays internally consistent while quietly showing fewer lessons than the
       list asks for. `formula-workshop` for `formula` cost exactly one card
       before this line existed. */
    console.warn(`ProofSection: no ready manifest entry "${id}"`);
    return [];
  }
  return [{ entry, subject: subject.label, tint: subject.tint }];
});

/**
 * One card, and it is one control.
 *
 * The four-card version split each card into an `aria-hidden` button around the
 * picture plus a labelled "Mở bài học" link, so a pointer could click the object
 * and a keyboard got exactly one tab stop. At sixteen cards that shape costs
 * thirty-two focusable nodes for sixteen destinations, so the whole card is the
 * button instead: its accessible name is its own text, the entire surface is the
 * target, and the belt is sixteen tab stops rather than thirty-two.
 *
 * `hidden` is the clone's flag. The belt is the same run twice — that is how the
 * loop is seamless, see `.proof-belt-track` — and the second run must be
 * invisible to assistive technology and unreachable by Tab, or the section
 * announces every lesson twice.
 */
function BeltCard({ card, clone }: { card: Card; clone?: boolean }) {
  const { entry, subject, tint } = card;
  return (
    <li className="proof-belt-item">
      <button
        type="button"
        className="proof-belt-card"
        style={{ '--proof-tint': tint } as React.CSSProperties}
        tabIndex={clone ? -1 : undefined}
        /*
         * Every card opens in the Library workspace, including the workshop —
         * whose own card used to open the full-screen build directly. One
         * destination for sixteen cards is the honest one here: the section's
         * claim is that these are library entries, and landing on the entry with
         * its knowledge panel beside it is what proves that. The workshop's
         * "Mở trải nghiệm" button is waiting one click away in the viewer.
         */
        onClick={() => openLibraryExperience(entry.id)}
      >
        {/*
          A baked render if the entry has one, its drawn mark if it does not.

          `cover` and `rail` are not alternatives to choose between per surface —
          `rail` stays what the Library's own rail uses, where the GLBs are
          coming anyway and a live bake is the better picture. This is the
          homepage, where sixteen live bakes would be sixteen GLB fetches.
        */}
        <span className={`proof-belt-plate proof-belt-plate--${entry.cover ? 'cover' : entry.rail.kind}`}>
          {entry.cover
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={`/asset/Library/cover/${entry.cover}.webp`} alt="" width={480} height={360} loading="lazy" decoding="async" draggable={false} />
            : <RailVisual visual={entry.rail} />}
        </span>
        <span className="proof-belt-subject">{subject}</span>
        <span className="proof-belt-title">{entry.title}</span>
        <span className="proof-belt-sub">{entry.subtitle}</span>
      </button>
    </li>
  );
}

export function ProofSection() {
  return (
    <section className="proof" id="bai-hoc-mau" data-snap="assist" aria-labelledby="proof-title">
      <div className="shell-editorial">
        <div className="section-heading section-heading--split" data-reveal>
          <div>
            <p className="section-kicker">Bài học mẫu</p>
            <h2 id="proof-title" data-kinetic>Những bài học<br /><em>bạn có thể mở ngay.</em></h2>
          </div>
          {/*
            Both numbers are counted, not typed. The first is the belt's own
            length and the second is how many entries the manifest marks
            `ready` — so the sentence stays true when a lesson is added, and the
            gap between the two is the point: the belt is a window onto a larger
            shelf rather than the whole shelf.
          */}
          <p>
            {CARDS.length} bài học dưới đây đang chạy thật trên trang này, trong{' '}
            {READY_EXPERIENCES.length} học liệu mở được ngay. Bấm một thẻ để mở.
          </p>
        </div>
      </div>

      {/*
        Full-bleed, and that is the composition rather than a shortcut.

        A belt that begins and ends at the editorial shell's gutters reads as a
        grid someone clipped; one that runs off both edges of the screen reads as
        a strip continuing past the window, which is the whole claim. The heading
        and the note above and below it stay on the shell, so the section still
        has one left edge for its words.

        `role="group"` with a label, not a list landmark: the moving strip is a
        set of controls the visitor may pick from, and the `ul` inside already
        carries the list semantics.
      */}
      <div className="proof-belt" role="group" aria-label="Bài học mở được ngay" data-reveal>
        <div className="proof-belt-track">
          <ul className="proof-belt-run">
            {CARDS.map((card) => <BeltCard card={card} key={card.entry.id} />)}
          </ul>
          {/* The clone. Same run, hidden from assistive technology and out of the
              tab order, and dropped entirely in the regimes where the belt is a
              native scroller instead of an animation. */}
          <ul className="proof-belt-run proof-belt-run--clone" aria-hidden="true">
            {CARDS.map((card) => <BeltCard card={card} clone key={card.entry.id} />)}
          </ul>
        </div>
      </div>

      <div className="shell-editorial">
        <p className="proof-note" data-reveal>
          Không logo trường, không lời nhận xét, không con số người dùng — YooLab
          chưa công bố danh sách trường đang triển khai, nên trang này không dựng
          ra một danh sách.
        </p>
      </div>
    </section>
  );
}
