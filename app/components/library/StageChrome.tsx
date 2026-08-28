'use client';

import type { ReactNode } from 'react';
import { LibraryIcon } from './LibraryIcons';
import type { MotionGlyph, StageGlyph } from '../../lib/library/glyphs';

/**
 * The chrome that sits on top of a running 3D canvas — one implementation, two
 * stages.
 *
 * This used to be duplicated: `CreatureStage` and `ModelStage` each wrote their
 * own tool rail, caption, auto-rotate switch and hint line, which is why the two
 * had drifted apart on control order, label case and the switch's own geometry.
 * Anything a visitor sees over a specimen is now built from these four pieces, so
 * a new experience gets the same instrument for free and cannot invent a fifth
 * kind of button.
 *
 * The composition is fixed and deliberate, and it splits along one line: what you
 * do to the **camera** lives in a column, what the **specimen** does lives in a
 * row.
 *
 *   - **rail, top-left** — camera verbs only. Four cells, ~190 px. It carried the
 *     specimen's behaviours too for one round, which made it nine cells and 410
 *     px of a 715 px stage: more than half the frame's height was chrome down one
 *     edge, and the T-rex's head was drawn behind it.
 *   - **clips, bottom-centre** — the specimen's own behaviours, horizontal. Their
 *     axis is time, not space, and a row of five reads as a set of takes to
 *     choose between where a column of five read as more buttons.
 *   - **guide, top-right** — three lines of how-to, on paper, which fade out for
 *     good the moment the visitor drags, scrolls or opens a pin. A hint that stays
 *     after it has been obeyed is furniture.
 *   - **caption, bottom-left** — what the specimen is and what its surface is.
 *   - **switch, bottom-right** — auto-rotation, as a real switch with a real
 *     track, because it is a *state* and a pressed-looking button is not how a
 *     state is drawn.
 *
 * The three items along the bottom are one visual row on three anchors rather
 * than a flex container, because two of the three are also used by stages that
 * have no clips at all.
 */

export function StageRail({ children }: { children: ReactNode }) {
  return (
    <div className="stage-rail" role="group" aria-label="Điều khiển khung nhìn">
      {children}
    </div>
  );
}

/** One band of the rail. Kept as its own element so the rail can grow a second
 *  group later without every stage re-learning the markup. */
export function StageRailGroup({ children }: { children: ReactNode }) {
  return <div className="stage-rail-group">{children}</div>;
}

/**
 * The specimen's behaviours, along the bottom.
 *
 * `title` is the 7 px word over the row — "Trạng thái" — and it is inside the
 * pill rather than above it so the whole control reads as one object between the
 * caption and the auto-rotate switch.
 */
export function StageClipRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="stage-clips" role="group" aria-label={title}>
      <p className="stage-clips-title">{title}</p>
      <div className="stage-clips-row">{children}</div>
    </div>
  );
}

export function StageToolButton({
  glyph,
  label,
  title,
  active,
  onClick,
}: {
  glyph: StageGlyph | MotionGlyph;
  /** The word in the 52 px cell. One line, always. */
  label: string;
  /** The full phrase, when the cell had to abbreviate it. */
  title?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`stage-tool${active ? ' is-active' : ''}`}
      aria-pressed={active === undefined ? undefined : active}
      aria-label={title ?? label}
      title={title ?? label}
      onClick={onClick}
    >
      <LibraryIcon name={glyph} />
      <span>{label}</span>
    </button>
  );
}

export function StageChrome({
  name,
  note,
  spinning,
  onSpin,
  guide,
}: {
  name: string;
  /** Second caption line: what the surface is, or what the render is doing. */
  note: string;
  spinning: boolean;
  onSpin: () => void;
  /** `<li>` children, or null once the visitor has driven the model. */
  guide?: ReactNode;
}) {
  return (
    <>
      {guide && (
        <aside className="stage-guide" aria-hidden="true">
          <ul>{guide}</ul>
        </aside>
      )}

      <div className="stage-caption">
        <b>{name}</b>
        <span>{note}</span>
      </div>

      {/*
        A label, then the track. `aria-pressed` carries the state and the visible
        switch is its picture — so the control is one button rather than a
        checkbox with a label glued to it, and a screen reader hears
        "Tự động xoay, toggle button, pressed".
      */}
      <button
        type="button"
        className="stage-spin"
        aria-pressed={spinning}
        onClick={onSpin}
      >
        <LibraryIcon name="spin" className="stage-spin-mark" />
        <span>Tự động<br />xoay</span>
        <i className="stage-switch" aria-hidden="true"><em /></i>
      </button>
    </>
  );
}
