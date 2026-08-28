'use client';

import type { ReactNode } from 'react';
import { PracticeIcon } from './PracticeIcons';

/**
 * The chrome that sits on top of a running practice lab — one implementation,
 * three labs.
 *
 * The Library learned this lesson already (`StageChrome`): when each stage
 * writes its own caption, its own control rail and its own hint line, the three
 * drift, and a visitor moving between them meets three products. Here the risk
 * is sharper, because the three labs came from three different places — a
 * Formula workshop, a flight sandbox and an industrial simulator — and each
 * arrived with a house style of its own.
 *
 * The composition is fixed, and it splits along one line: what the lab is
 * *asking for* lives on the left, what the student can *do about it* lives on
 * the right.
 *
 *   - **badge, top-left** — that this is live, not a render. One dot, one word.
 *   - **steps, top-right** — the four or five beats of the lesson, with the
 *     current one lit. This is the single most important element on the stage:
 *     it is what makes a lab feel like a route rather than a sandbox, and it is
 *     the thing a student checks when they are lost.
 *   - **brief, bottom-left** — one objective, one line. Never two.
 *   - **actions, bottom-right** — reset, hint, and whatever the current step
 *     needs. Progressive: a step that needs no controls shows none.
 *   - **flash, centre** — the success beat. It arrives, it is read, it leaves.
 *
 * Everything here is `pointer-events: none` except the buttons, so the whole
 * frame stays draggable through the chrome.
 */

export type LabStep = {
  id: string;
  /** Two words at most. The strip has five of these on a 700 px stage. */
  label: string;
};

export type LabFlash = {
  text: string;
  tone: 'success' | 'warn';
  /** Bumped by the caller on every new event, so a repeat message replays. */
  key: number;
};

export function LabChrome({
  live,
  steps,
  activeStep,
  completedSteps,
  onStepSelect,
  objective,
  hint,
  hintOpen,
  onHint,
  onReset,
  flash,
  actions,
  readout,
  children,
}: {
  /** False before the student has started: the badge reads "sẵn sàng". */
  live: boolean;
  steps: LabStep[];
  activeStep: number;
  /** How many steps are behind the student. Drives the ✓ marks. */
  completedSteps: number;
  /**
   * Makes the strip navigable.
   *
   * Only the Formula lab passes this, and the difference is real rather than
   * cosmetic: its three steps are three *views* of one model, so jumping to
   * "lái thử" first is a legitimate thing to want. The drone's and the robot's
   * are a state machine — you cannot land before you have taken off — and a
   * clickable chip there would be a control that either lies or breaks.
   */
  onStepSelect?: (index: number) => void;
  /** The one thing to do right now. */
  objective: string;
  /** The answer, when they ask for it. Absent = the hint button is hidden. */
  hint?: string;
  hintOpen: boolean;
  onHint: () => void;
  onReset: () => void;
  flash?: LabFlash | null;
  /** Step-specific controls, to the left of reset. */
  actions?: ReactNode;
  /** Live numbers — altitude, speed, joint angle. Bottom centre, tabular. */
  readout?: ReactNode;
  /** Touch control pad, or anything else the lab wants inside the frame. */
  children?: ReactNode;
}) {
  return (
    <>
      <p className={`lab-badge${live ? ' is-live' : ''}`}>
        <i aria-hidden="true" />
        {live ? 'Đang trải nghiệm' : 'Sẵn sàng'}
      </p>

      <ol className="lab-steps" aria-label="Các bước của bài thực hành">
        {steps.map((step, index) => {
          const done = index < completedSteps;
          const current = index === activeStep;
          const className = `lab-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`;
          const body = (
            <>
              <b aria-hidden="true">
                {done ? <PracticeIcon name="check" /> : String(index + 1).padStart(2, '0')}
              </b>
              <span>{step.label}</span>
            </>
          );
          return (
            <li key={step.id} aria-current={current ? 'step' : undefined}>
              {onStepSelect ? (
                <button
                  type="button"
                  className={className}
                  aria-pressed={current}
                  onClick={() => onStepSelect(index)}
                >
                  {body}
                </button>
              ) : (
                <p className={className}>{body}</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="lab-brief">
        <p className="lab-objective">{objective}</p>
        {hint && hintOpen && <p className="lab-hint">{hint}</p>}
      </div>

      <div className="lab-actions">
        {actions}
        {hint && (
          <button
            type="button"
            className={`lab-button${hintOpen ? ' is-active' : ''}`}
            aria-pressed={hintOpen}
            onClick={onHint}
          >
            <PracticeIcon name="hint" />
            <span>Gợi ý</span>
          </button>
        )}
        <button type="button" className="lab-button" onClick={onReset}>
          <PracticeIcon name="restart" />
          <span>Làm lại</span>
        </button>
      </div>

      {readout && <div className="lab-readout">{readout}</div>}

      {/*
        Keyed on the event counter rather than on the text: the same message can
        arrive twice in a row — two soft landings, two boxes placed — and a node
        whose content did not change never restarts its animation, so the second
        success would land silently.
      */}
      {flash && (
        <p className={`lab-flash lab-flash--${flash.tone}`} key={flash.key} role="status">
          {flash.tone === 'success' && <PracticeIcon name="check" />}
          {flash.text}
        </p>
      )}

      {children}
    </>
  );
}

/**
 * A directional pad, for touch and for anyone who would rather click than type.
 *
 * The keyboard is the real control surface in both moving labs, and on a phone
 * there is no keyboard at all — so this is not an accessibility afterthought,
 * it is the mobile control scheme. `onPointerDown`/`onPointerUp` rather than
 * `onClick`, because holding is the gesture: a tap that yields one frame of
 * thrust is not flying.
 */
export function LabPad({
  label,
  buttons,
  onPress,
  onRelease,
  className,
}: {
  label: string;
  /** id, glyph text, accessible name. */
  buttons: { id: string; glyph: string; name: string; area: string }[];
  onPress: (id: string) => void;
  onRelease: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={`lab-pad${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          aria-label={button.name}
          style={{ gridArea: button.area }}
          onPointerDown={(event) => { event.preventDefault(); onPress(button.id); }}
          onPointerUp={() => onRelease(button.id)}
          onPointerCancel={() => onRelease(button.id)}
          onPointerLeave={() => onRelease(button.id)}
        >
          {button.glyph}
        </button>
      ))}
    </div>
  );
}
