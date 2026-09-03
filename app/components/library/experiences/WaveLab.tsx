'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../../lib/usePrefersReducedMotion';
import { pixelRatioCap } from '../../../lib/three/deviceTier';

/**
 * Waves — one engine, three lessons.
 *
 * The three modes are not three simulations bolted together. Each one is a
 * sampler `y(x, t)` in centimetres over metres, stroked by the same routine onto
 * the same axis, which is why the readout row can stay identical across all
 * three: λ, f, T and v mean exactly the same thing whether the wave is
 * travelling, superposed or standing. A mode owns only its decorations.
 *
 * Two decisions here are pedagogy rather than code:
 *
 *   - The window is a fixed 2.4 m of medium, not an auto-fitted number of
 *     wavelengths. Auto-fitting looks tidier and teaches nothing, because λ
 *     would change while the picture stayed the same. On a fixed stretch of rope
 *     a shorter λ visibly packs in more crests, which is what λ *is*.
 *   - The probe P sits at a fixed x with a dashed guide drawn through it. The
 *     commonest misreading of a travelling wave is that the medium travels with
 *     it, and a caption never fixes that; a dot sliding up and down a vertical
 *     line while the crest walks past it does.
 *
 * Interference is a real phasor sum rather than two curves added by eye. The two
 * waves share the medium, so they share v — the second wave's k follows its own
 * f — which means "lệch tần số" produces honest beats in space *and* in time,
 * and the amplitude readout is √(A₁² + A₂² + 2A₁A₂·cos Δφ) evaluated at P.
 */

type Mode = 'single' | 'interfere' | 'standing';

const TAU = Math.PI * 2;

/** The stretch of medium on screen for the travelling modes, in metres. */
const WINDOW_X = 2.4;
/** Where the medium probe sits. A round 1.00 m so the canvas label reads clean. */
const PROBE_X = 1;
/**
 * The string in standing-wave mode. L and v are properties of the *string* — a
 * length and a tension — so they are constants here and n is what the student
 * changes; that is the whole point of the mode: only the harmonics fit.
 */
const STRING_LENGTH = 1.2;
const STRING_SPEED = 1.2;
/**
 * "Lệch tần số" ratio. 5:4 is the smallest ratio that still beats visibly inside
 * a few seconds: T_phách = 1/(f₂ − f₁) = 4/f₁, so at f₁ = 1 Hz the envelope
 * breathes once every four seconds.
 */
const DETUNE_RATIO = 1.25;

const MODES: { id: Mode; label: string }[] = [
  { id: 'single', label: 'Một sóng' },
  { id: 'interfere', label: 'Giao thoa' },
  { id: 'standing', label: 'Sóng dừng' },
];

const HARMONICS = [1, 2, 3, 4, 5, 6];

/** The manifest may open this lab straight into a mode. */
function resolveMode(value: string | undefined): Mode {
  if (value === 'interfere' || value === 'giao-thoa') return 'interfere';
  if (value === 'standing' || value === 'song-dung') return 'standing';
  return 'single';
}

/* ================================================================ physics === */

type SingleModel = {
  mode: 'single';
  domain: number;
  yMax: number;
  amplitude: number;
  wavelength: number;
  frequency: number;
  period: number;
  speed: number;
  k: number;
  omega: number;
  /** Displacement of the medium at x, in cm. */
  shape: (x: number, t: number) => number;
  /** Sign of ∂y/∂t at the probe, so the readout can say which way P is going. */
  probeRising: (t: number) => boolean;
};

type InterfereModel = {
  mode: 'interfere';
  domain: number;
  yMax: number;
  amp1: number;
  amp2: number;
  wavelength: number;
  wavelength2: number;
  frequency: number;
  frequency2: number;
  period: number;
  speed: number;
  phase: number;
  detune: boolean;
  beat: number;
  first: (x: number, t: number) => number;
  second: (x: number, t: number) => number;
  shape: (x: number, t: number) => number;
  /** Local phase difference between the two waves — the whole story of the mode. */
  delta: (x: number, t: number) => number;
  /** Local resultant amplitude: the exact phasor sum, so it doubles as envelope. */
  envelope: (x: number, t: number) => number;
};

type StandingModel = {
  mode: 'standing';
  domain: number;
  yMax: number;
  amplitude: number;
  harmonic: number;
  length: number;
  wavelength: number;
  frequency: number;
  period: number;
  speed: number;
  nodes: number[];
  antinodes: number[];
  shape: (x: number, t: number) => number;
  envelope: (x: number) => number;
};

type Model = SingleModel | InterfereModel | StandingModel;

/* ============================================================== rendering === */

type Palette = {
  ink: string;
  accent: string;
  line: string;
  muted: string;
  first: string;
  second: string;
  label: (size: number, weight?: number) => string;
  mono: (size: number, weight?: number) => string;
};

type Frame = {
  ctx: CanvasRenderingContext2D;
  left: number;
  plotW: number;
  plotH: number;
  midY: number;
  domain: number;
  yMax: number;
  palette: Palette;
  /** Below roughly 200 px of canvas the secondary annotations stop fitting. */
  compact: boolean;
  toX: (metres: number) => number;
  toY: (cm: number) => number;
};

type TextOptions = {
  font: string;
  color: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  alpha?: number;
};

function label(frame: Frame, value: string, x: number, y: number, options: TextOptions) {
  const { ctx } = frame;
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'alphabetic';
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillText(value, x, y);
  ctx.restore();
}

/** A grid step that lands on a readable number and keeps 8–13 lines on screen. */
function niceStep(domain: number) {
  for (const step of [0.05, 0.1, 0.2, 0.25, 0.5, 1]) {
    if (domain / step <= 13) return step;
  }
  return domain / 10;
}

function strokeCurve(
  frame: Frame,
  sample: (x: number) => number,
  style: { color: string; width: number; alpha?: number; dash?: number[] },
) {
  const { ctx } = frame;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (style.dash) ctx.setLineDash(style.dash);
  ctx.beginPath();
  // 1.4 px per sample: finer than the eye at this scale and cheap enough to run
  // three curves plus an envelope every frame.
  for (let px = 0; px <= frame.plotW; px += 1.4) {
    const py = frame.toY(sample((px / frame.plotW) * frame.domain));
    if (px === 0) ctx.moveTo(frame.left, py);
    else ctx.lineTo(frame.left + px, py);
  }
  ctx.lineTo(frame.left + frame.plotW, frame.toY(sample(frame.domain)));
  ctx.stroke();
  ctx.restore();
}

function dot(frame: Frame, x: number, y: number, color: string, radius: number) {
  const { ctx } = frame;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function ring(frame: Frame, x: number, y: number, color: string, radius: number) {
  const { ctx } = frame;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function diamond(frame: Frame, x: number, y: number, color: string, radius: number) {
  const { ctx } = frame;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGrid(frame: Frame) {
  const { ctx, palette } = frame;
  const top = frame.toY(frame.yMax);
  const bottom = frame.toY(-frame.yMax);
  const step = niceStep(frame.domain);
  const perStep = (step / frame.domain) * frame.plotW;
  const labelEvery = Math.max(1, Math.ceil(40 / perStep));

  ctx.save();
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  let index = 0;
  for (let value = 0; value <= frame.domain + 1e-6; value += step, index += 1) {
    const x = Math.round(frame.toX(value)) + 0.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    if (index % labelEvery === 0) {
      label(frame, value.toFixed(step < 0.1 ? 2 : 1), x, bottom + (frame.compact ? 11 : 14), {
        font: palette.mono(9),
        color: palette.muted,
        align: 'center',
      });
    }
  }
  for (let cm = 5; cm <= frame.yMax - 2; cm += 5) {
    for (const sign of [1, -1]) {
      const y = Math.round(frame.toY(cm * sign)) + 0.5;
      ctx.globalAlpha = 0.42;
      ctx.beginPath();
      ctx.moveTo(frame.left, y);
      ctx.lineTo(frame.left + frame.plotW, y);
      ctx.stroke();
      if (!frame.compact) {
        label(frame, `${sign > 0 ? '' : '−'}${cm}`, frame.left - 6, y + 3, {
          font: palette.mono(9),
          color: palette.muted,
          align: 'right',
        });
      }
    }
  }
  ctx.restore();

  /* The baseline is the equilibrium position of the medium, so it is drawn as an
     instrument axis rather than as one more gridline. */
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(frame.left, Math.round(frame.midY) + 0.5);
  ctx.lineTo(frame.left + frame.plotW, Math.round(frame.midY) + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** The dashed vertical through the probe, plus its ±A travel limits. */
function drawProbeGuide(frame: Frame, x: number, limit: number) {
  const { ctx, palette } = frame;
  const screenX = Math.round(frame.toX(x)) + 0.5;
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(screenX, frame.toY(frame.yMax));
  ctx.lineTo(screenX, frame.toY(-frame.yMax));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 1.3;
  for (const sign of [1, -1]) {
    const y = Math.round(frame.toY(limit * sign)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(screenX - 5, y);
    ctx.lineTo(screenX + 5, y);
    ctx.stroke();
  }
  ctx.restore();
}

/* --------------------------------------------------------------- one wave --- */

function drawSingle(frame: Frame, model: SingleModel, t: number) {
  const { ctx, palette } = frame;
  const sample = (x: number) => model.shape(x, t);

  drawProbeGuide(frame, PROBE_X, model.amplitude);
  strokeCurve(frame, sample, { color: palette.accent, width: 2.3 });

  /*
   * The λ measure is hung at crest level and follows the wave.
   *
   * kx − ωt = π/2 is the first crest in the window, so the bracket always spans
   * exactly one period of the shape and the space above it — the wave never goes
   * higher than A — is guaranteed free for the label.
   */
  const firstCrest = (((Math.PI / 2 + model.omega * t) / model.k) % model.wavelength + model.wavelength)
    % model.wavelength;
  const crestY = frame.toY(model.amplitude);
  if (firstCrest + model.wavelength <= frame.domain) {
    const x1 = frame.toX(firstCrest);
    const x2 = frame.toX(firstCrest + model.wavelength);
    ctx.save();
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x1, crestY);
    ctx.lineTo(x2, crestY);
    ctx.moveTo(x1, crestY - 4);
    ctx.lineTo(x1, crestY + 4);
    ctx.moveTo(x2, crestY - 4);
    ctx.lineTo(x2, crestY + 4);
    ctx.stroke();
    ctx.restore();
    label(frame, `λ = ${model.wavelength.toFixed(2)} m`, (x1 + x2) / 2, crestY - 7, {
      font: palette.mono(10, 500),
      color: palette.ink,
      align: 'center',
      alpha: 0.82,
    });
  }

  /* Crest and trough, named on the picture rather than in a caption. */
  const troughX = (firstCrest + model.wavelength / 2) % frame.domain;
  dot(frame, frame.toX(firstCrest), crestY, palette.ink, 2.4);
  if (!frame.compact) {
    label(frame, 'đỉnh', frame.toX(firstCrest) + 6, crestY + 11, {
      font: palette.label(10, 600),
      color: palette.muted,
    });
  }
  const troughY = frame.toY(-model.amplitude);
  dot(frame, frame.toX(troughX), troughY, palette.ink, 2.4);
  if (!frame.compact) {
    label(frame, 'đáy', frame.toX(troughX) + 6, troughY - 5, {
      font: palette.label(10, 600),
      color: palette.muted,
    });
  }

  /* The probe. This dot is the lesson. */
  const probeY = frame.toY(sample(PROBE_X));
  dot(frame, frame.toX(PROBE_X), probeY, palette.accent, 5);
  ring(frame, frame.toX(PROBE_X), probeY, palette.accent, 8);
  label(frame, frame.compact ? 'P' : 'P · x = 1.00 m', frame.toX(PROBE_X) + 12, probeY - 9, {
    font: palette.mono(10, 500),
    color: palette.ink,
    alpha: 0.85,
  });

  /* Direction of travel, with the derived speed on it. */
  const arrowY = frame.toY(-frame.yMax) - 4;
  const tip = frame.left + frame.plotW - 2;
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.fillStyle = palette.accent;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(tip - 34, arrowY);
  ctx.lineTo(tip, arrowY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip, arrowY);
  ctx.lineTo(tip - 5, arrowY - 3.2);
  ctx.lineTo(tip - 5, arrowY + 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  label(frame, `v = ${model.speed.toFixed(2)} m/s`, tip - 40, arrowY + 3.5, {
    font: palette.mono(10, 500),
    color: palette.accent,
    align: 'right',
  });
}

/* ------------------------------------------------------------ two waves --- */

function drawInterfere(frame: Frame, model: InterfereModel, t: number) {
  const { palette } = frame;

  /*
   * The envelope is drawn from the phasor amplitude, not fitted to the curve.
   * With equal frequencies it collapses to a flat pair of lines — which is
   * exactly the point at Δφ = π, where it lands on the axis and the resultant
   * goes flat with it. With the frequencies detuned it becomes the beat
   * envelope, and it is still the same expression.
   */
  strokeCurve(frame, (x) => model.envelope(x, t), {
    color: palette.accent,
    width: 1,
    alpha: 0.42,
    dash: [3, 3],
  });
  strokeCurve(frame, (x) => -model.envelope(x, t), {
    color: palette.accent,
    width: 1,
    alpha: 0.42,
    dash: [3, 3],
  });

  drawProbeGuide(frame, PROBE_X, model.envelope(PROBE_X, t));

  strokeCurve(frame, (x) => model.first(x, t), { color: palette.first, width: 1.3, alpha: 0.75 });
  strokeCurve(frame, (x) => model.second(x, t), { color: palette.second, width: 1.3, alpha: 0.75 });
  strokeCurve(frame, (x) => model.shape(x, t), { color: palette.accent, width: 2.4 });

  const probeY = frame.toY(model.shape(PROBE_X, t));
  dot(frame, frame.toX(PROBE_X), probeY, palette.accent, 4.6);
  ring(frame, frame.toX(PROBE_X), probeY, palette.accent, 7.6);
  label(frame, 'P', frame.toX(PROBE_X) + 11, probeY - 8, {
    font: palette.mono(10, 500),
    color: palette.ink,
    alpha: 0.85,
  });

  if (!frame.compact && model.detune) {
    label(
      frame,
      `phách: Δf = ${model.beat.toFixed(2)} Hz · T = ${(1 / model.beat).toFixed(1)} s`,
      frame.left + frame.plotW,
      frame.toY(frame.yMax) + 9,
      { font: palette.mono(10, 500), color: palette.muted, align: 'right' },
    );
  }
}

/* --------------------------------------------------------- standing wave --- */

function drawStanding(frame: Frame, model: StandingModel, t: number) {
  const { ctx, palette } = frame;

  /* The two fixed ends. Everything about the mode follows from them. */
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  for (const x of [0, model.length]) {
    const screenX = Math.round(frame.toX(x)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(screenX, frame.toY(frame.yMax * 0.92));
    ctx.lineTo(screenX, frame.toY(-frame.yMax * 0.92));
    ctx.stroke();
  }
  ctx.restore();

  /* The swept region: the string never leaves it, so it is a fill, not a line. */
  ctx.save();
  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  for (let px = 0; px <= frame.plotW; px += 2) {
    const y = frame.toY(model.envelope((px / frame.plotW) * frame.domain));
    if (px === 0) ctx.moveTo(frame.left, y);
    else ctx.lineTo(frame.left + px, y);
  }
  for (let px = frame.plotW; px >= 0; px -= 2) {
    ctx.lineTo(frame.left + px, frame.toY(-model.envelope((px / frame.plotW) * frame.domain)));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  strokeCurve(frame, (x) => model.envelope(x), { color: palette.accent, width: 1, alpha: 0.4, dash: [3, 3] });
  strokeCurve(frame, (x) => -model.envelope(x), { color: palette.accent, width: 1, alpha: 0.4, dash: [3, 3] });
  strokeCurve(frame, (x) => model.shape(x, t), { color: palette.accent, width: 2.4 });

  /* Nodes: a hollow ring on the axis, numbered. They never move — that is the
     property worth marking. */
  model.nodes.forEach((x, index) => {
    const screenX = frame.toX(x);
    ring(frame, screenX, frame.midY, palette.ink, 3.4);
    if (!frame.compact) {
      label(frame, `${index + 1}`, screenX, frame.midY + 15, {
        font: palette.mono(9),
        color: palette.muted,
        align: 'center',
      });
    }
  });

  /* Antinodes: a filled diamond at the top of the envelope, numbered. */
  model.antinodes.forEach((x, index) => {
    const screenX = frame.toX(x);
    const y = frame.toY(model.envelope(x));
    diamond(frame, screenX, y - 7, palette.accent, 3.4);
    if (!frame.compact) {
      label(frame, `${index + 1}`, screenX, y - 14, {
        font: palette.mono(9),
        color: palette.muted,
        align: 'center',
      });
    }
  });

  if (!frame.compact) {
    const secondNode = model.nodes[1] ?? model.nodes[0];
    label(frame, 'nút', frame.toX(secondNode) + 7, frame.midY + 15, {
      font: palette.label(10, 600),
      color: palette.muted,
    });
    const firstAnti = model.antinodes[0];
    label(frame, 'bụng', frame.toX(firstAnti) + 8, frame.toY(model.envelope(firstAnti)) - 11, {
      font: palette.label(10, 600),
      color: palette.muted,
    });
    label(
      frame,
      `L = ${model.length.toFixed(2)} m · v = ${model.speed.toFixed(2)} m/s`,
      frame.left,
      frame.toY(frame.yMax) + 9,
      { font: palette.mono(10, 500), color: palette.muted },
    );
  }
}

/* ================================================================ export === */

export function WaveLab({ params }: { params?: Record<string, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Wall-clock seconds of simulated time, in a ref: a parameter change rebuilds
     the draw callback and restarts the effect, and the wave must not jump back
     to t = 0 every time a slider moves. */
  const clock = useRef(0);

  const [mode, setMode] = useState<Mode>(() => resolveMode(params?.mode));
  const [amplitude, setAmplitude] = useState(8);
  const [wavelength, setWavelength] = useState(0.6);
  const [frequency, setFrequency] = useState(0.8);
  const [amp1, setAmp1] = useState(6);
  const [amp2, setAmp2] = useState(6);
  const [phase, setPhase] = useState(0);
  const [detune, setDetune] = useState(false);
  const [harmonic, setHarmonic] = useState(3);
  const [playing, setPlaying] = useState(true);
  const reduced = usePrefersReducedMotion();
  /* A throttled snapshot of the clock, only so the live readout can be rendered
     from the same maths the canvas uses instead of a second copy of it. */
  const [tickT, setTickT] = useState(0);
  /* Under reduced motion the canvas holds t = 0, so the readout must read 0 too
     — derived rather than pushed into state, which is what the animation effect
     used to do on its first pass. */
  const liveT = reduced ? 0 : tickT;

  /* ---------------------------------------------------------------- model --- */
  const model = useMemo<Model>(() => {
    if (mode === 'single') {
      const k = TAU / wavelength;
      const omega = TAU * frequency;
      return {
        mode: 'single',
        domain: WINDOW_X,
        yMax: 17,
        amplitude,
        wavelength,
        frequency,
        period: 1 / frequency,
        speed: frequency * wavelength,
        k,
        omega,
        shape: (x, t) => amplitude * Math.sin(k * x - omega * t),
        probeRising: (t) => -Math.cos(k * PROBE_X - omega * t) > 0,
      };
    }

    if (mode === 'interfere') {
      /* One medium, one speed. Wave 2's wavelength is therefore not free: it is
         v / f₂, which is why detuning shifts the pattern in space as well. */
      const speed = frequency * wavelength;
      const frequency2 = detune ? frequency * DETUNE_RATIO : frequency;
      const wavelength2 = speed / frequency2;
      const k1 = TAU / wavelength;
      const k2 = TAU / wavelength2;
      const w1 = TAU * frequency;
      const w2 = TAU * frequency2;
      const first = (x: number, t: number) => amp1 * Math.sin(k1 * x - w1 * t);
      const second = (x: number, t: number) => amp2 * Math.sin(k2 * x - w2 * t + phase);
      const delta = (x: number, t: number) => (k2 - k1) * x - (w2 - w1) * t + phase;
      return {
        mode: 'interfere',
        domain: WINDOW_X,
        yMax: 19,
        amp1,
        amp2,
        wavelength,
        wavelength2,
        frequency,
        frequency2,
        period: 1 / frequency,
        speed,
        phase,
        detune,
        beat: Math.abs(frequency2 - frequency),
        first,
        second,
        shape: (x, t) => first(x, t) + second(x, t),
        delta,
        envelope: (x, t) =>
          Math.sqrt(amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(delta(x, t))),
      };
    }

    const standingWavelength = (2 * STRING_LENGTH) / harmonic;
    const standingFrequency = (harmonic * STRING_SPEED) / (2 * STRING_LENGTH);
    return {
      mode: 'standing',
      domain: STRING_LENGTH,
      yMax: 15,
      amplitude,
      harmonic,
      length: STRING_LENGTH,
      wavelength: standingWavelength,
      frequency: standingFrequency,
      period: 1 / standingFrequency,
      speed: STRING_SPEED,
      nodes: Array.from({ length: harmonic + 1 }, (_, index) => (index * STRING_LENGTH) / harmonic),
      antinodes: Array.from({ length: harmonic }, (_, index) => ((index + 0.5) * STRING_LENGTH) / harmonic),
      shape: (x, t) =>
        amplitude
        * Math.sin((harmonic * Math.PI * x) / STRING_LENGTH)
        * Math.cos(TAU * standingFrequency * t),
      envelope: (x) => amplitude * Math.abs(Math.sin((harmonic * Math.PI * x) / STRING_LENGTH)),
    };
  }, [mode, amplitude, wavelength, frequency, amp1, amp2, phase, detune, harmonic]);

  /* --------------------------------------------------------------- render --- */
  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 8 || height < 8) return;
    const ratio = pixelRatioCap('panel');
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const style = getComputedStyle(canvas);
    const bodyStack = style.getPropertyValue('--font-body').trim() || 'Inter, system-ui, sans-serif';
    const monoStack = style.getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace';
    const palette: Palette = {
      ink: style.getPropertyValue('--sim-ink').trim() || '#191720',
      accent: style.getPropertyValue('--sim-accent').trim() || '#00AAAB',
      line: style.getPropertyValue('--sim-line').trim() || 'rgba(117,91,70,0.2)',
      muted: style.getPropertyValue('--sim-muted').trim() || '#706a73',
      first: style.getPropertyValue('--wave-first').trim() || '#5fb6c4',
      second: style.getPropertyValue('--wave-second').trim() || '#8d6bcc',
      label: (size, weight = 600) => `${weight} ${size}px ${bodyStack}`,
      mono: (size, weight = 500) => `${weight} ${size}px ${monoStack}`,
    };

    const compact = height < 200;
    const padLeft = 32;
    const padRight = 16;
    const padTop = compact ? 12 : 20;
    const padBottom = compact ? 16 : 24;
    const plotW = Math.max(24, width - padLeft - padRight);
    const plotH = Math.max(24, height - padTop - padBottom);
    const midY = padTop + plotH / 2;
    const frame: Frame = {
      ctx,
      left: padLeft,
      plotW,
      plotH,
      midY,
      domain: model.domain,
      yMax: model.yMax,
      palette,
      compact,
      toX: (metres) => padLeft + (metres / model.domain) * plotW,
      toY: (cm) => midY - (cm / model.yMax) * (plotH / 2),
    };

    drawGrid(frame);
    if (model.mode === 'single') drawSingle(frame, model, t);
    else if (model.mode === 'interfere') drawInterfere(frame, model, t);
    else drawStanding(frame, model, t);
  }, [model]);

  /* ------------------------------------------------------------ animation --- */
  useEffect(() => {
    const canvas = canvasRef.current;

    /* Reduced motion: one still frame at t = 0, which is a meaningful instant in
       all three modes — the standing wave in particular is at full displacement
       there, so its envelope and its shape coincide and the figure still reads. */
    if (reduced) {
      clock.current = 0;
      draw(0);
      const observer = new ResizeObserver(() => draw(0));
      if (canvas) observer.observe(canvas);
      return () => observer.disconnect();
    }

    draw(clock.current);
    let frame = 0;
    let last = performance.now();
    let lastPush = last;

    const step = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (playing && document.visibilityState !== 'hidden') {
        clock.current += delta;
        draw(clock.current);
        // ~5 Hz is fast enough to feel live and slow enough that a screen reader
        // is not read a new number every frame.
        if (now - lastPush > 190) {
          lastPush = now;
          setTickT(clock.current);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    // Coming back from a hidden tab, the first delta would otherwise be the whole
    // absence; the clamp above already caps it, this keeps it exact.
    const onVisibility = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new ResizeObserver(() => draw(clock.current));
    if (canvas) observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [draw, playing, reduced]);

  /* --------------------------------------------------------------- readout --- */
  const readout = useMemo(() => {
    if (model.mode === 'single') {
      return {
        amplitude: `${model.amplitude.toFixed(1)} cm`,
        wavelength: `${model.wavelength.toFixed(2)} m`,
        frequency: `${model.frequency.toFixed(2)} Hz`,
      };
    }
    if (model.mode === 'interfere') {
      return {
        amplitude: `${model.amp1.toFixed(1)} + ${model.amp2.toFixed(1)} cm`,
        wavelength: model.detune
          ? `${model.wavelength.toFixed(2)} / ${model.wavelength2.toFixed(2)} m`
          : `${model.wavelength.toFixed(2)} m`,
        frequency: model.detune
          ? `${model.frequency.toFixed(2)} / ${model.frequency2.toFixed(2)} Hz`
          : `${model.frequency.toFixed(2)} Hz`,
      };
    }
    return {
      amplitude: `${model.amplitude.toFixed(1)} cm`,
      wavelength: `${model.wavelength.toFixed(2)} m`,
      frequency: `${model.frequency.toFixed(2)} Hz`,
    };
  }, [model]);

  /*
   * The live line. Everything in it comes from the model, so the number under the
   * canvas cannot drift away from the number in it.
   */
  const live = useMemo(() => {
    if (model.mode === 'single') {
      const y = model.shape(PROBE_X, liveT);
      return {
        label: 'Phần tử P',
        value: `y = ${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(1)} cm · ${model.probeRising(liveT) ? 'đi lên' : 'đi xuống'}`,
        note: 'Sóng truyền ngang sang phải, còn P chỉ dao động lên xuống quanh vị trí cân bằng.',
      };
    }
    if (model.mode === 'interfere') {
      const delta = model.delta(PROBE_X, liveT);
      const cos = Math.cos(delta);
      const resultant = model.envelope(PROBE_X, liveT);
      const name = cos > 0.98
        ? 'Giao thoa tăng cường'
        : cos < -0.98
          ? 'Giao thoa triệt tiêu'
          : 'Giao thoa một phần';
      return {
        label: model.detune ? 'Tại P — có phách' : 'Tại P',
        value: `${name} · A = ${resultant.toFixed(1)} cm`,
        note: model.detune
          ? `f₂ = 1.25·f₁ nên độ lệch pha trôi liên tục: phách Δf = ${model.beat.toFixed(2)} Hz, T = ${(1 / model.beat).toFixed(1)} s.`
          : 'A = √(A₁² + A₂² + 2A₁A₂·cos Δφ): cùng pha thì cộng biên độ, ngược pha thì trừ.',
      };
    }
    return {
      label: `Sóng dừng bậc n = ${model.harmonic}`,
      value: `${model.harmonic + 1} nút · ${model.harmonic} bụng`,
      note: `λ = 2L/n = ${model.wavelength.toFixed(2)} m · f = n·v/2L = ${model.frequency.toFixed(2)} Hz · dây L = ${model.length.toFixed(2)} m, v = ${model.speed.toFixed(2)} m/s.`,
    };
  }, [model, liveT]);

  const ariaLabel = model.mode === 'single'
    ? `Đồ thị một sóng ngang truyền sang phải: biên độ ${model.amplitude.toFixed(1)} xăng-ti-mét, bước sóng ${model.wavelength.toFixed(2)} mét, tần số ${model.frequency.toFixed(2)} héc.`
    : model.mode === 'interfere'
      ? `Đồ thị giao thoa hai sóng: biên độ ${model.amp1.toFixed(1)} và ${model.amp2.toFixed(1)} xăng-ti-mét, độ lệch pha ${(model.phase / Math.PI).toFixed(2)} pi.`
      : `Đồ thị sóng dừng bậc ${model.harmonic} trên dây hai đầu cố định, ${model.harmonic + 1} nút và ${model.harmonic} bụng.`;

  return (
    <div className="sim wave">
      <div className="sim-stage">
        <canvas ref={canvasRef} className="sim-canvas" role="img" aria-label={ariaLabel} />
        <div className="sim-axis-label sim-axis-label--x">Vị trí (m)</div>
        <div className="sim-axis-label sim-axis-label--y">Li độ (cm)</div>
      </div>

      <div className="wave-live">
        <span>{live.label}</span>
        <b role="status">{live.value}</b>
        <p>{live.note}</p>
      </div>

      <div className="sim-readout">
        <div><dt>Biên độ</dt><dd>{readout.amplitude}</dd></div>
        <div><dt>Bước sóng λ</dt><dd>{readout.wavelength}</dd></div>
        <div><dt>Tần số f</dt><dd>{readout.frequency}</dd></div>
        <div><dt>Chu kỳ T = 1/f</dt><dd>{model.period.toFixed(2)} s</dd></div>
        <div><dt>Tốc độ v = f·λ</dt><dd>{model.speed.toFixed(2)} m/s</dd></div>
      </div>

      <div className="sim-controls">
        <div className="wave-head">
          <div className="wave-modes" role="group" aria-label="Chế độ sóng">
            {MODES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={mode === entry.id}
                onClick={() => setMode(entry.id)}
              >
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          {mode === 'interfere' && (
            <ul className="wave-legend">
              <li><i className="is-first" />Sóng 1</li>
              <li><i className="is-second" />Sóng 2</li>
              <li><i className="is-sum" />Tổng hợp</li>
            </ul>
          )}
          {mode === 'standing' && (
            <ul className="wave-legend">
              <li><i className="is-node" />Nút — không dao động</li>
              <li><i className="is-anti" />Bụng — biên độ cực đại</li>
            </ul>
          )}
        </div>

        {mode === 'single' && (
          <>
            <label className="sim-slider">
              <span>Biên độ A</span><b>{amplitude.toFixed(1)} cm</b>
              <input type="range" min={1} max={12} step={0.5} value={amplitude}
                onChange={(event) => setAmplitude(Number(event.target.value))} />
            </label>
            <label className="sim-slider">
              <span>Bước sóng λ</span><b>{wavelength.toFixed(2)} m</b>
              <input type="range" min={0.3} max={1.2} step={0.05} value={wavelength}
                onChange={(event) => setWavelength(Number(event.target.value))} />
            </label>
            <label className="sim-slider">
              <span>Tần số f</span><b>{frequency.toFixed(2)} Hz</b>
              <input type="range" min={0.2} max={2} step={0.05} value={frequency}
                onChange={(event) => setFrequency(Number(event.target.value))} />
            </label>
          </>
        )}

        {mode === 'interfere' && (
          <>
            <label className="sim-slider">
              <span>Biên độ A₁</span><b>{amp1.toFixed(1)} cm</b>
              <input type="range" min={0} max={8} step={0.5} value={amp1}
                onChange={(event) => setAmp1(Number(event.target.value))} />
            </label>
            <label className="sim-slider">
              <span>Biên độ A₂</span><b>{amp2.toFixed(1)} cm</b>
              <input type="range" min={0} max={8} step={0.5} value={amp2}
                onChange={(event) => setAmp2(Number(event.target.value))} />
            </label>
            <label className="sim-slider">
              <span>Bước sóng λ chung</span><b>{wavelength.toFixed(2)} m</b>
              <input type="range" min={0.3} max={1.2} step={0.05} value={wavelength}
                onChange={(event) => setWavelength(Number(event.target.value))} />
            </label>
            <label className="sim-slider">
              <span>Độ lệch pha Δφ</span><b>{(phase / Math.PI).toFixed(2)} π</b>
              <input type="range" min={0} max={TAU} step={Math.PI / 12} value={phase}
                onChange={(event) => setPhase(Number(event.target.value))} />
            </label>
            <div className="sim-presets" role="group" aria-label="Tần số của sóng 2">
              <span>Tần số sóng 2</span>
              <button type="button" className={detune ? '' : 'is-active'} aria-pressed={!detune}
                onClick={() => setDetune(false)}>Bằng f₁</button>
              <button type="button" className={detune ? 'is-active' : ''} aria-pressed={detune}
                onClick={() => setDetune(true)}>Lệch tần số <i>×1.25</i></button>
            </div>
          </>
        )}

        {mode === 'standing' && (
          <>
            <div className="sim-presets" role="group" aria-label="Bậc dao động">
              <span>Bậc dao động n</span>
              {HARMONICS.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={harmonic === value ? 'is-active' : ''}
                  aria-pressed={harmonic === value}
                  onClick={() => setHarmonic(value)}
                >
                  {value} <i>{((2 * STRING_LENGTH) / value).toFixed(2)} m</i>
                </button>
              ))}
            </div>
            <label className="sim-slider">
              <span>Biên độ bụng A</span><b>{amplitude.toFixed(1)} cm</b>
              <input type="range" min={1} max={12} step={0.5} value={amplitude}
                onChange={(event) => setAmplitude(Number(event.target.value))} />
            </label>
          </>
        )}

        {/* Under reduced motion the canvas holds a still frame on purpose, so a
            play control would promise something the lab will not do. */}
        {!reduced && (
          <button type="button" className="sim-fire" aria-pressed={!playing} onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Tạm dừng' : 'Chạy'} <span aria-hidden="true">{playing ? '❙❙' : '▶'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
