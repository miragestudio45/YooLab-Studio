'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Projectile motion — a real simulation.
 *
 * PhysicsSims (MIT) was audited as a source for this subject. Porting one of its
 * pages wholesale would have dragged in that project's Tailwind config, its own
 * UI component library and its routing, for one simulation — so what was taken
 * from it is the *shape* of a good sim module (a parameter panel, a live canvas,
 * a readout of derived quantities, and presets that make the physics obvious),
 * and the integrator below is written for YooLab.
 *
 * The maths is honest in both modes. With drag off it is the closed-form
 * parabola, so the readouts match what a student computes by hand. With drag on
 * there is no closed form, so it integrates — and the trajectory visibly stops
 * being symmetric, which is the whole point of the toggle.
 */

type Preset = { label: string; gravity: number };

const GRAVITY_PRESETS: Preset[] = [
  { label: 'Trái Đất', gravity: 9.81 },
  { label: 'Mặt Trăng', gravity: 1.62 },
  { label: 'Sao Hỏa', gravity: 3.72 },
];

type Sample = { x: number; y: number; t: number };

/**
 * Integrates the flight and returns the path plus the numbers worth showing.
 *
 * Semi-implicit Euler at a fixed 1 ms step: small enough that the drag-free case
 * agrees with the analytic solution to well under a pixel, and cheap enough to
 * re-run on every slider move without a worker.
 */
function simulate(
  speed: number,
  angleDeg: number,
  height: number,
  gravity: number,
  drag: number,
) {
  const angle = (angleDeg * Math.PI) / 180;
  const step = 0.001;
  const samples: Sample[] = [];
  let x = 0;
  let y = height;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  let t = 0;
  let peak = height;
  let peakAt = 0;
  samples.push({ x, y, t });
  // 60 s of flight is far beyond any classroom setup; the cap only stops a
  // pathological parameter set from spinning here forever.
  while (y >= 0 && t < 60) {
    if (drag > 0) {
      const magnitude = Math.hypot(vx, vy);
      const factor = drag * magnitude;
      vx -= factor * vx * step;
      vy -= factor * vy * step;
    }
    vy -= gravity * step;
    x += vx * step;
    y += vy * step;
    t += step;
    if (y > peak) { peak = y; peakAt = x; }
    // Sampled every 20 ms for drawing; the integration stays at 1 ms.
    if (samples.length === 0 || t - samples[samples.length - 1].t >= 0.02) {
      samples.push({ x, y, t });
    }
  }
  // Land exactly on the ground rather than one step under it.
  if (samples.length > 1 && y < 0) {
    const previous = samples[samples.length - 1];
    const ratio = previous.y / (previous.y - y || 1);
    samples.push({ x: previous.x + (x - previous.x) * ratio, y: 0, t: previous.t + (t - previous.t) * ratio });
  }
  const last = samples[samples.length - 1];
  return { samples, range: last.x, flightTime: last.t, peak, peakAt };
}

export function ProjectileLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(24);
  const [angle, setAngle] = useState(45);
  const [height, setHeight] = useState(0);
  const [gravity, setGravity] = useState(9.81);
  const [drag, setDrag] = useState(0);
  const [playing, setPlaying] = useState(true);

  const result = useMemo(() => simulate(speed, angle, height, gravity, drag), [speed, angle, height, gravity, drag]);

  /* --------------------------------------------------------------- render --- */
  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(cssHeight * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(cssHeight * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, cssHeight);

    const style = getComputedStyle(canvas);
    const ink = style.getPropertyValue('--sim-ink').trim() || '#191720';
    const accent = style.getPropertyValue('--sim-accent').trim() || '#e87868';
    const line = style.getPropertyValue('--sim-line').trim() || 'rgba(117,91,70,0.2)';
    const muted = style.getPropertyValue('--sim-muted').trim() || '#706a73';

    const padding = { left: 46, right: 22, top: 20, bottom: 34 };
    const plotWidth = Math.max(10, width - padding.left - padding.right);
    const plotHeight = Math.max(10, cssHeight - padding.top - padding.bottom);
    // One scale for both axes so the parabola keeps its true shape; anything
    // else makes 45° look wrong.
    const spanX = Math.max(result.range * 1.08, 10);
    const spanY = Math.max(result.peak * 1.2, 6);
    const scale = Math.min(plotWidth / spanX, plotHeight / spanY);
    const toScreenX = (value: number) => padding.left + value * scale;
    const toScreenY = (value: number) => padding.top + plotHeight - value * scale;

    /* grid */
    const gridStep = spanX > 160 ? 40 : spanX > 80 ? 20 : spanX > 40 ? 10 : 5;
    context.strokeStyle = line;
    context.fillStyle = muted;
    context.font = '500 10px Inter, system-ui, sans-serif';
    context.lineWidth = 1;
    for (let value = 0; value <= spanX; value += gridStep) {
      const screenX = toScreenX(value);
      context.globalAlpha = 0.5;
      context.beginPath();
      context.moveTo(screenX, padding.top);
      context.lineTo(screenX, toScreenY(0));
      context.stroke();
      context.globalAlpha = 1;
      context.fillText(`${value}`, screenX - 5, toScreenY(0) + 15);
    }
    for (let value = 0; value <= spanY; value += gridStep) {
      const screenY = toScreenY(value);
      if (screenY < padding.top) break;
      context.globalAlpha = 0.5;
      context.beginPath();
      context.moveTo(padding.left, screenY);
      context.lineTo(padding.left + plotWidth, screenY);
      context.stroke();
      context.globalAlpha = 1;
      context.fillText(`${value}`, 14, screenY + 3);
    }

    /* ground */
    context.strokeStyle = ink;
    context.globalAlpha = 0.55;
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(padding.left, toScreenY(0));
    context.lineTo(padding.left + plotWidth, toScreenY(0));
    context.stroke();
    context.globalAlpha = 1;

    /* full trajectory, faint */
    context.strokeStyle = accent;
    context.globalAlpha = 0.24;
    context.lineWidth = 1.6;
    context.beginPath();
    result.samples.forEach((sample, index) => {
      const screenX = toScreenX(sample.x);
      const screenY = toScreenY(sample.y);
      if (index === 0) context.moveTo(screenX, screenY);
      else context.lineTo(screenX, screenY);
    });
    context.stroke();

    /* travelled portion, solid */
    const upTo = Math.max(1, Math.round(result.samples.length * progress));
    context.globalAlpha = 1;
    context.lineWidth = 2.4;
    context.lineJoin = 'round';
    context.beginPath();
    for (let index = 0; index < upTo; index += 1) {
      const sample = result.samples[index];
      const screenX = toScreenX(sample.x);
      const screenY = toScreenY(sample.y);
      if (index === 0) context.moveTo(screenX, screenY);
      else context.lineTo(screenX, screenY);
    }
    context.stroke();

    /* projectile */
    const current = result.samples[Math.min(upTo - 1, result.samples.length - 1)];
    context.fillStyle = accent;
    context.beginPath();
    context.arc(toScreenX(current.x), toScreenY(current.y), 5.5, 0, Math.PI * 2);
    context.fill();

    /* apex marker */
    if (result.peak > 0.2) {
      context.strokeStyle = ink;
      context.globalAlpha = 0.28;
      context.setLineDash([3, 4]);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(toScreenX(result.peakAt), toScreenY(result.peak));
      context.lineTo(toScreenX(result.peakAt), toScreenY(0));
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
    }
  }, [result]);

  /* ------------------------------------------------------------ animation --- */
  useEffect(() => {
    let frame = 0;
    let start = performance.now();
    let paused = false;
    // Real flight time, but held between 0.8 s and 6 s of wall clock: a lunar
    // lob takes 20 s of flight and nobody watches 20 s of it.
    const duration = Math.max(0.8, Math.min(result.flightTime, 6)) * 1000;
    const hold = 900;

    const step = (now: number) => {
      if (!paused) {
        const elapsed = now - start;
        let progress: number;
        if (!playing) progress = 1;
        else if (elapsed <= duration) progress = elapsed / duration;
        else if (elapsed <= duration + hold) progress = 1;   // hold the finished arc
        else { start = now; progress = 0; }                  // then replay
        draw(progress);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    const onVisibility = () => { paused = document.visibilityState === 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);
    const canvas = canvasRef.current;
    // A resize needs one redraw of the finished arc; the loop resumes the
    // animation on its own next frame.
    const observer = new ResizeObserver(() => draw(1));
    if (canvas) observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [draw, playing, result.flightTime]);

  const fire = () => {
    setPlaying(false);
    // A frame apart so the animation effect restarts its clock.
    requestAnimationFrame(() => setPlaying(true));
  };

  return (
    <div className="sim">
      <div className="sim-stage">
        <canvas ref={canvasRef} className="sim-canvas" aria-label="Quỹ đạo vật ném" role="img" />
        <div className="sim-axis-label sim-axis-label--x">Tầm xa (m)</div>
        <div className="sim-axis-label sim-axis-label--y">Độ cao (m)</div>
      </div>

      <div className="sim-readout">
        <div><dt>Tầm xa</dt><dd>{result.range.toFixed(1)} m</dd></div>
        <div><dt>Cao nhất</dt><dd>{result.peak.toFixed(1)} m</dd></div>
        <div><dt>Thời gian bay</dt><dd>{result.flightTime.toFixed(2)} s</dd></div>
        <div><dt>Vận tốc đầu</dt><dd>{speed} m/s · {angle}°</dd></div>
      </div>

      <div className="sim-controls">
        <label className="sim-slider">
          <span>Góc ném</span><b>{angle}°</b>
          <input type="range" min={5} max={85} step={1} value={angle}
            onChange={(event) => setAngle(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Tốc độ đầu</span><b>{speed} m/s</b>
          <input type="range" min={5} max={60} step={1} value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Độ cao ban đầu</span><b>{height} m</b>
          <input type="range" min={0} max={40} step={1} value={height}
            onChange={(event) => setHeight(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Lực cản không khí</span><b>{drag === 0 ? 'Không' : drag.toFixed(3)}</b>
          <input type="range" min={0} max={0.06} step={0.002} value={drag}
            onChange={(event) => setDrag(Number(event.target.value))} />
        </label>

        <div className="sim-presets" role="group" aria-label="Trọng lực">
          <span>Trọng lực</span>
          {GRAVITY_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className={Math.abs(gravity - preset.gravity) < 0.01 ? 'is-active' : ''}
              aria-pressed={Math.abs(gravity - preset.gravity) < 0.01}
              onClick={() => setGravity(preset.gravity)}
            >
              {preset.label} <i>{preset.gravity}</i>
            </button>
          ))}
        </div>

        <button type="button" className="sim-fire" onClick={fire}>
          Bắn lại <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
