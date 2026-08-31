'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The inclined plane — a force bench, not an animated block.
 *
 * This experience exists for one fact that no diagram can show: the block
 * breaks loose exactly when tan θ passes μs, and the mass has nothing to do
 * with it. A wedge with four arrows drawn on it can be memorised. A student who
 * drags the mass from 0.5 kg to 20 kg and watches the critical angle refuse to
 * move has understood why m cancels out of m·g·sin θ ≤ μs·m·g·cos θ, which is a
 * different kind of knowing.
 *
 * Two rules keep it honest. Every number on screen comes out of the same
 * resolved forces the integrator steps with — there is no display-only maths in
 * this file — and the static/kinetic decision is the real comparison, not a
 * threshold that looks about right. So with μ = 0 the acceleration is exactly
 * g·sin θ, the case a student can check by hand, and the strip under the canvas
 * says so out loud instead of hoping nobody tries it.
 *
 * The chrome is deliberately the projectile lab's: same .sim grid, same canvas,
 * same readout band, same sliders and preset chips. Three physics simulations in
 * one section with three different-looking control panels would read as three
 * different products.
 */

type GravityPreset = { label: string; gravity: number };

const GRAVITY_PRESETS: GravityPreset[] = [
  { label: 'Trái Đất', gravity: 9.81 },
  { label: 'Mặt Trăng', gravity: 1.62 },
  { label: 'Sao Hỏa', gravity: 3.72 },
];

/**
 * The bench, in metres and seconds.
 *
 * The ramp is a 4 m plank at whatever angle is set, and the block runs the
 * middle 3.4 m of it so a 0.42 m box never hangs off either end. Keeping the
 * plank a fixed physical length rather than a fixed number of pixels is what
 * lets the distance readout mean something: the same 3.4 m of travel at every
 * angle, so the times a student compares are comparable.
 */
const RAMP_LENGTH = 4;
const RAMP_INSET = 0.3;
const TRAVEL = RAMP_LENGTH - RAMP_INSET * 2;
const BLOCK_SIZE = 0.42;

/** Fixed integration step. Small enough that the μ = 0 case matches g·sin θ. */
const STEP = 1 / 240;
/** Below this the block is standing still, not creeping by a pixel a second. */
const REST_SPEED = 0.004;
/** Seconds the finished run is held at the end of the ramp before it replays. */
const END_HOLD = 0.55;
/** Where reduced motion parks the block: partway down, plainly on the surface. */
const PARKED = TRAVEL * 0.45;

type Forces = {
  /** Slope angle in radians. */
  theta: number;
  /** P = m·g. */
  weight: number;
  /** P·sin θ, the part of the weight that points down the slope. */
  along: number;
  /** N = P·cos θ. */
  normal: number;
  /** μs·N — the most static friction can ever supply. */
  staticMax: number;
  /** μk·N — what friction supplies once the block is sliding. */
  kinetic: number;
  /**
   * Everything pushing the block along the slope except friction, downhill
   * positive. One sign convention for the whole file: positive is down the
   * slope, for the applied force, the net force and the acceleration alike. Two
   * conventions in one panel is how a student ends up with the right magnitude
   * and the wrong direction.
   */
  drive: number;
  /** arctan μs in degrees — the angle the block lets go at, whatever its mass. */
  critical: number;
};

function resolveForces(
  angleDeg: number,
  mass: number,
  gravity: number,
  staticMu: number,
  kineticMu: number,
  push: number,
): Forces {
  const theta = (angleDeg * Math.PI) / 180;
  const weight = mass * gravity;
  const normal = weight * Math.cos(theta);
  const along = weight * Math.sin(theta);
  return {
    theta,
    weight,
    along,
    normal,
    staticMax: staticMu * normal,
    kinetic: kineticMu * normal,
    drive: along + push,
    critical: (Math.atan(staticMu) * 180) / Math.PI,
  };
}

type Phase = 'rest' | 'break' | 'down' | 'up';

const PHASE_LABEL: Record<Phase, string> = {
  rest: 'Đứng yên (cân bằng)',
  break: 'Bắt đầu trượt',
  down: 'Đang trượt xuống',
  up: 'Đang trượt lên',
};

type Resolved = {
  phase: Phase;
  /** Magnitude of the friction actually acting right now, in newtons. */
  friction: number;
  /** Which way that friction points: +1 downhill, -1 uphill. */
  frictionDir: number;
  /** Net force along the slope, downhill positive. */
  net: number;
  /** a = ΣF/m, downhill positive. */
  accel: number;
};

/**
 * The static-versus-kinetic test, done properly.
 *
 * A resting block is held by exactly as much friction as it takes, up to μs·N —
 * not by μs·N. Reporting the maximum here is the mistake that leaves a student
 * believing a stationary block has a net force on it. Once the comparison fails
 * the block is slipping, so friction drops to μk·N and opposes the motion (or,
 * at the instant it lets go, the motion that is about to start).
 */
function resolveState(forces: Forces, mass: number, velocity: number): Resolved {
  const moving = Math.abs(velocity) > REST_SPEED;
  if (!moving && Math.abs(forces.drive) <= forces.staticMax) {
    return {
      phase: 'rest',
      friction: Math.abs(forces.drive),
      frictionDir: forces.drive > 0 ? -1 : 1,
      net: 0,
      accel: 0,
    };
  }
  const direction = moving ? Math.sign(velocity) : Math.sign(forces.drive);
  const net = forces.drive - direction * forces.kinetic;
  return {
    phase: moving ? (velocity > 0 ? 'down' : 'up') : 'break',
    friction: forces.kinetic,
    frictionDir: -direction,
    net,
    accel: net / mass,
  };
}

/** Vietnamese decimals take a comma, and −0,0 is never a useful readout. */
function formatNumber(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return (rounded === 0 ? 0 : rounded).toFixed(digits).replace('.', ',');
}

/** Signed readouts get a real minus sign, not a hyphen. */
function formatSigned(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return formatNumber(0, digits);
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), digits)}`;
}

type MotionState = {
  /** Metres travelled from the release point, measured down the slope. */
  s: number;
  /** Speed along the slope, downhill positive. */
  v: number;
  /** Where the current run started, so the trail shows this run and not the last. */
  origin: number;
  /** Seconds left of the pause at the end of a run. */
  hold: number;
  /** Where the next run starts from. */
  restart: number;
};

export function InclineLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef<MotionState>({ s: 0, v: 0, origin: 0, hold: 0, restart: 0 });

  const [angle, setAngle] = useState(22);
  const [mass, setMass] = useState(4);
  const [staticMu, setStaticMu] = useState(0.35);
  const [kineticMu, setKineticMu] = useState(0.28);
  const [push, setPush] = useState(0);
  const [gravity, setGravity] = useState(9.81);
  const [running, setRunning] = useState(true);
  const [reduced, setReduced] = useState(false);
  /* The integrator lives in a ref and only publishes a snapshot to React, so a
     slider drag never resets the run and the readouts still tick. */
  const [readout, setReadout] = useState({ s: 0, v: 0 });

  const forces = useMemo(
    () => resolveForces(angle, mass, gravity, staticMu, kineticMu, push),
    [angle, mass, gravity, staticMu, kineticMu, push],
  );
  const state = resolveState(forces, mass, readout.v);

  /*
   * The check a student can do by hand. With no friction and no push the only
   * force along the slope is m·g·sin θ, so a = g·sin θ and the mass has
   * cancelled out. This value is computed independently of the integrator on
   * purpose: if it ever disagrees with the acceleration readout above it, the
   * readout is the one that is lying.
   */
  const frictionless = staticMu === 0 && kineticMu === 0 && push === 0;
  const gravityAlong = gravity * Math.sin(forces.theta);

  /*
   * μk ≤ μs is a physical constraint, not a UI nicety. If sliding friction were
   * the larger of the two, a block that had just come to rest would be shoved
   * back into motion by nothing at all, and the simulation would flip between
   * two states that cannot both be true. Both setters clamp, so the pair cannot
   * be dragged into that state from either direction.
   */
  const applyStaticMu = (value: number) => {
    setStaticMu(value);
    setKineticMu((current) => Math.min(current, value));
  };
  const applyKineticMu = (value: number) => setKineticMu(Math.min(value, staticMu));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /* --------------------------------------------------------------- render --- */
  const draw = useCallback((current: MotionState) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    /* Every colour comes out of the cascade, so a token change re-skins the
       diagram and nothing in this file owns a hex. */
    const style = getComputedStyle(canvas);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const ink = read('--sim-ink', '#191720');
    const line = read('--sim-line', 'rgba(117,91,70,0.2)');
    const muted = read('--sim-muted', '#706a73');
    const accent = read('--sim-accent', '#00AAAB');
    const rampTint = read('--inc-ramp', '#f7f2ea');
    const weightColor = read('--inc-weight', '#8d6bcc');
    const normalColor = read('--inc-normal', '#5fb6c4');
    const frictionColor = read('--inc-friction', '#b08a4a');
    const pushColor = read('--inc-push', '#769d74');
    const mono = read('--font-mono', 'ui-monospace, monospace');

    /* The legend floats over the top-right corner of the stage, so the drawing
       is fitted to a box that stops short of it rather than trusting luck. */
    const legendRoom = width > 430 ? 104 : 0;
    const pad = { left: 16, right: 14 + legendRoom, top: 14, bottom: 28 };
    const plotWidth = Math.max(60, width - pad.left - pad.right);
    const plotHeight = Math.max(60, height - pad.top - pad.bottom);

    /* One scale for every arrow, so their lengths can honestly be compared. The
       longest vector is pinned to a fraction of the frame and the rest follow,
       which is what keeps a 200 N weight inside the canvas. */
    const arrowMax = Math.max(34, Math.min(84, plotHeight * 0.3));
    const forceScale = arrowMax / Math.max(forces.weight, Math.abs(push), 0.5);

    /* The weight arrow points straight down out of a block that can end up
       sitting on the ground line, so the wedge is fitted into a shorter box: the
       band left under the ground is what keeps that arrow in the frame. */
    const wedgeHeight = Math.max(26, plotHeight - arrowMax * 0.8);
    const theta = forces.theta;
    const downX = Math.cos(theta);
    const downY = Math.sin(theta);
    const normalX = downY;
    const normalY = -downX;
    const scale =
      Math.min(
        plotWidth / (RAMP_LENGTH * downX),
        downY > 1e-4 ? wedgeHeight / (RAMP_LENGTH * downY) : Number.POSITIVE_INFINITY,
      ) * 0.98;
    const rampPx = RAMP_LENGTH * scale;
    const spanX = rampPx * downX;
    /* A ground line that stays put. Re-centring it every time the angle changes
       makes the whole drawing jump, and the angle is the control a student holds
       for longest. */
    const groundY = pad.top + wedgeHeight;
    const footX = pad.left + (plotWidth - spanX) / 2;
    const apexX = footX;
    const apexY = groundY - rampPx * downY;
    const cornerX = footX + spanX;

    /* ramp */
    context.fillStyle = rampTint;
    context.beginPath();
    context.moveTo(apexX, apexY);
    context.lineTo(footX, groundY);
    context.lineTo(cornerX, groundY);
    context.closePath();
    context.fill();
    context.strokeStyle = line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(apexX, apexY);
    context.lineTo(footX, groundY);
    context.lineTo(cornerX, groundY);
    context.stroke();

    /* ground, hatched underneath so it reads as ground and not as an axis */
    context.strokeStyle = ink;
    context.globalAlpha = 0.5;
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(8, groundY);
    context.lineTo(width - 8, groundY);
    context.stroke();
    context.globalAlpha = 0.24;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 15; x < width - 8; x += 9) {
      context.moveTo(x, groundY);
      context.lineTo(x - 6, groundY + 6);
    }
    context.stroke();
    context.globalAlpha = 1;

    /* the surface itself, drawn strongest: it is what the block is standing on */
    context.strokeStyle = ink;
    context.globalAlpha = 0.62;
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(apexX, apexY);
    context.lineTo(cornerX, groundY);
    context.stroke();
    context.globalAlpha = 1;

    /* the angle, with its arc at the foot of the slope */
    const arcRadius = Math.max(14, Math.min(30, rampPx * 0.26, spanX * 0.28));
    if (theta > 0.008) {
      context.strokeStyle = ink;
      context.globalAlpha = 0.42;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(cornerX, groundY, arcRadius, Math.PI, Math.PI + theta);
      context.stroke();
      context.globalAlpha = 1;
    }
    context.fillStyle = ink;
    context.font = `500 10px ${mono}`;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillText(
      `θ ${angle}°`,
      cornerX + Math.cos(Math.PI + theta / 2) * (arcRadius + 11),
      groundY + Math.sin(Math.PI + theta / 2) * (arcRadius + 11) - 6,
    );

    /* where the block is, and where this run started */
    const centreAlong = RAMP_INSET + current.s;
    const surfaceX = apexX + downX * centreAlong * scale;
    const surfaceY = apexY + downY * centreAlong * scale;
    const blockPx = Math.max(15, Math.min(42, BLOCK_SIZE * scale));
    const blockX = surfaceX + normalX * blockPx * 0.5;
    const blockY = surfaceY + normalY * blockPx * 0.5;

    /* the trail: the distance covered since the block was released */
    if (Math.abs(current.s - current.origin) > 0.04) {
      const fromAlong = RAMP_INSET + current.origin;
      const lift = 3;
      context.save();
      context.setLineDash([3, 4]);
      context.strokeStyle = accent;
      context.globalAlpha = 0.5;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(apexX + downX * fromAlong * scale + normalX * lift, apexY + downY * fromAlong * scale + normalY * lift);
      context.lineTo(surfaceX + normalX * lift, surfaceY + normalY * lift);
      context.stroke();
      context.restore();
    }

    /* the block, rotated with the surface it sits on */
    context.save();
    context.translate(blockX, blockY);
    context.rotate(theta);
    const halfW = blockPx * 0.62;
    const halfH = blockPx * 0.5;
    context.beginPath();
    context.rect(-halfW, -halfH, halfW * 2, halfH * 2);
    context.fillStyle = accent;
    context.globalAlpha = 0.16;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = accent;
    context.lineWidth = 1.6;
    context.stroke();
    if (halfW > 17) {
      context.fillStyle = accent;
      context.font = `500 8.5px ${mono}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`${formatNumber(mass, 1)} kg`, 0, 0);
    }
    context.restore();

    /*
     * The force vectors.
     *
     * Length is magnitude times one shared scale, and the labels carry the value
     * in newtons so nobody has to eyeball it. The weight leaves the centre of
     * mass and the other three leave the contact surface, which is both what a
     * textbook draws and what stops the friction arrow from lying exactly on top
     * of the applied force in the cases where the two are collinear.
     */
    const arrow = (
      fromX: number,
      fromY: number,
      dirX: number,
      dirY: number,
      magnitude: number,
      label: string,
      color: string,
    ) => {
      const length = magnitude * forceScale;
      if (length < 5) return;
      const tipX = fromX + dirX * length;
      const tipY = fromY + dirY * length;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1.7;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(fromX, fromY);
      context.lineTo(tipX, tipY);
      context.stroke();
      const heading = Math.atan2(dirY, dirX);
      const head = 7;
      const spread = 0.42;
      context.beginPath();
      context.moveTo(tipX, tipY);
      context.lineTo(tipX - Math.cos(heading - spread) * head, tipY - Math.sin(heading - spread) * head);
      context.lineTo(tipX - Math.cos(heading + spread) * head, tipY - Math.sin(heading + spread) * head);
      context.closePath();
      context.fill();

      const text = `${label} ${formatNumber(magnitude, magnitude < 10 ? 1 : 0)} N`;
      context.font = `500 9.5px ${mono}`;
      context.textBaseline = 'middle';
      const textWidth = context.measureText(text).width;
      let labelX = tipX + dirX * 9;
      const labelY = Math.min(Math.max(tipY + dirY * 12, 9), height - 9);
      if (dirX > 0.25) {
        context.textAlign = 'left';
        labelX = Math.min(labelX, width - 4 - textWidth);
      } else if (dirX < -0.25) {
        context.textAlign = 'right';
        labelX = Math.max(labelX, 4 + textWidth);
      } else {
        context.textAlign = 'center';
        labelX = Math.min(Math.max(labelX, textWidth / 2 + 4), width - textWidth / 2 - 4);
      }
      context.fillText(text, labelX, labelY);
    };

    const live = resolveState(forces, mass, current.v);
    arrow(blockX, blockY, 0, 1, forces.weight, 'P', weightColor);
    arrow(surfaceX, surfaceY, normalX, normalY, forces.normal, 'N', normalColor);
    if (live.friction > 0.05) {
      arrow(
        surfaceX,
        surfaceY,
        downX * live.frictionDir,
        downY * live.frictionDir,
        live.friction,
        'Fms',
        frictionColor,
      );
    }
    if (Math.abs(push) > 0.01) {
      const sign = Math.sign(push);
      arrow(blockX, blockY, downX * sign, downY * sign, Math.abs(push), 'F', pushColor);
    }

    /* the one word the picture cannot say for itself */
    context.fillStyle = muted;
    context.font = `600 9px ${mono}`;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(`${formatNumber(TRAVEL, 1)} m`, pad.left, groundY + 9);
  }, [angle, forces, mass, push]);

  /* ------------------------------------------------------------ animation --- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw(motionRef.current));
    observer.observe(canvas);

    if (reduced) {
      /* Reduced motion still gets the physics, just not the movement: the block
         is parked partway down the ramp and every arrow and every number is the
         one that belongs to that resting frame. */
      if (motionRef.current.s !== PARKED) {
        motionRef.current = { s: PARKED, v: 0, origin: PARKED, hold: 0, restart: 0 };
        setReadout({ s: PARKED, v: 0 });
      }
      draw(motionRef.current);
      return () => observer.disconnect();
    }

    draw(motionRef.current);
    if (!running) return () => observer.disconnect();

    let frame = 0;
    let previous = performance.now();
    let publishedAt = previous;
    let carry = 0;
    let hidden = document.visibilityState === 'hidden';

    const advance = (dt: number) => {
      const motion = motionRef.current;
      if (motion.hold > 0) {
        motion.hold -= dt;
        if (motion.hold <= 0) {
          motion.hold = 0;
          motion.s = motion.restart;
          motion.origin = motion.restart;
          motion.v = 0;
        }
        return;
      }
      const moving = Math.abs(motion.v) > REST_SPEED;
      if (!moving && Math.abs(forces.drive) <= forces.staticMax) {
        /* Static friction wins, so there is nothing to integrate — and the
           velocity is zeroed rather than left as a remainder, because a block
           held by friction must not creep a pixel a second. */
        motion.v = 0;
        motion.origin = motion.s;
        return;
      }
      const direction = moving ? Math.sign(motion.v) : Math.sign(forces.drive);
      const accel = (forces.drive - direction * forces.kinetic) / mass;
      const next = motion.v + accel * dt;
      if (moving && next * motion.v < 0) {
        /* The velocity changed sign inside one step, so the block stopped here.
           Whether it stays stopped is a static question, and the next tick is
           where it gets asked — which is exactly how a block pushed up a steep
           slope comes to a halt and then slides back down. */
        motion.v = 0;
        motion.origin = motion.s;
        return;
      }
      motion.v = next;
      motion.s += next * dt;
      if (motion.s >= TRAVEL) {
        motion.s = TRAVEL;
        motion.v = 0;
        motion.hold = END_HOLD;
        motion.restart = 0;
      } else if (motion.s <= 0) {
        motion.s = 0;
        motion.v = 0;
        motion.hold = END_HOLD;
        motion.restart = TRAVEL;
      }
    };

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = now - previous;
      previous = now;
      if (hidden) return;
      /* A tab that was in the background hands back a gap of seconds, and
         integrating it would teleport the block through the ramp. */
      carry = Math.min(carry + elapsed / 1000, 0.25);
      let guard = 0;
      while (carry >= STEP && guard < 90) {
        advance(STEP);
        carry -= STEP;
        guard += 1;
      }
      draw(motionRef.current);
      /* ~11 Hz: fast enough that the numbers read as live, slow enough that the
         readout band is not re-rendered sixty times a second. */
      if (now - publishedAt >= 90) {
        publishedAt = now;
        setReadout({ s: motionRef.current.s, v: motionRef.current.v });
      }
    };
    frame = requestAnimationFrame(step);

    const onVisibility = () => {
      hidden = document.visibilityState === 'hidden';
      previous = performance.now();
      carry = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [draw, forces, mass, reduced, running]);

  const release = () => {
    motionRef.current = { s: 0, v: 0, origin: 0, hold: 0, restart: 0 };
    setReadout({ s: 0, v: 0 });
    setRunning(true);
  };

  const stateClass =
    state.phase === 'rest' ? 'is-rest' : state.phase === 'break' ? 'is-break' : 'is-sliding';

  return (
    <div className="sim incline">
      <div className="sim-stage">
        <canvas
          ref={canvasRef}
          className="sim-canvas"
          role="img"
          aria-label={`Mặt phẳng nghiêng ${angle} độ, khối ${formatNumber(mass, 1)} kilôgam. ${PHASE_LABEL[state.phase]}. Áp lực ${formatNumber(forces.normal)} niutơn, gia tốc ${formatNumber(Math.abs(state.accel), 2)} mét trên giây bình phương.`}
        />
        <ul className="incline-legend" aria-hidden="true">
          <li className="is-weight"><i /><b>P</b> trọng lực</li>
          <li className="is-normal"><i /><b>N</b> áp lực</li>
          <li className="is-friction"><i /><b>Fms</b> ma sát</li>
          <li className="is-push"><i /><b>F</b> lực đẩy</li>
          <li className="incline-legend-note">Dài mũi tên ∝ độ lớn</li>
        </ul>
        <div className="sim-axis-label sim-axis-label--y">Mặt phẳng nghiêng</div>
      </div>

      <div className="incline-strip">
        <p className={`incline-state ${stateClass}`} role="status">{PHASE_LABEL[state.phase]}</p>
        <div className="incline-motion">
          <span><i>s</i><b>{formatNumber(readout.s, 2)}</b><em>m</em></span>
          <span><i>v</i><b>{formatNumber(Math.abs(readout.v), 2)}</b><em>m/s</em></span>
        </div>
        <p className="incline-hint">
          Khối trượt khi tan θ vượt μs. Góc tới hạn arctan(μs) ={' '}
          <b>{formatNumber(forces.critical, 1)}°</b> — không phụ thuộc khối lượng m.
          {frictionless
            ? ` Không ma sát, không lực đẩy nên a = g·sin θ = ${formatNumber(gravityAlong, 2)} m/s².`
            : ''}
        </p>
        {reduced ? (
          <p className="incline-note">Chế độ giảm chuyển động: khối được vẽ tĩnh trên mặt nghiêng.</p>
        ) : (
          <div className="incline-actions">
            <button
              type="button"
              className="incline-hold"
              aria-pressed={!running}
              onClick={() => setRunning((value) => !value)}
            >
              {running ? 'Tạm dừng' : 'Tiếp tục'}
            </button>
            <button type="button" className="sim-fire" onClick={release}>
              Thả lại <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>

      <div className="sim-readout incline-readout">
        <div>
          <dt><span>Trọng lực</span><b>P = mg</b></dt>
          <dd>{formatNumber(forces.weight)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Dọc mặt</span><b>P·sinθ</b></dt>
          <dd>{formatNumber(forces.along)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Áp lực</span><b>P·cosθ</b></dt>
          <dd>{formatNumber(forces.normal)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Ma sát nghỉ</span><b>μs·N</b></dt>
          <dd>{formatNumber(forces.staticMax)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Ma sát trượt</span><b>μk·N</b></dt>
          <dd>{formatNumber(forces.kinetic)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Ma sát hiện tại</span><b>Fms</b></dt>
          <dd>{formatNumber(state.friction)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Hợp lực</span><b>ΣF</b></dt>
          <dd>{formatSigned(state.net)}<i>N</i></dd>
        </div>
        <div>
          <dt><span>Gia tốc</span><b>a</b></dt>
          <dd>{formatSigned(state.accel, 2)}<i>m/s²</i></dd>
        </div>
        <div>
          <dt><span>Góc tới hạn</span><b>arctan μs</b></dt>
          <dd>{formatNumber(forces.critical)}<i>°</i></dd>
        </div>
      </div>

      <div className="sim-controls">
        <label className="sim-slider">
          <span>Góc nghiêng θ</span><b>{angle}°</b>
          <input type="range" min={0} max={45} step={1} value={angle}
            onChange={(event) => setAngle(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Khối lượng m</span><b>{formatNumber(mass, 1)} kg</b>
          <input type="range" min={0.5} max={20} step={0.5} value={mass}
            onChange={(event) => setMass(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Ma sát nghỉ μs</span><b>{formatNumber(staticMu, 2)}</b>
          <input type="range" min={0} max={1} step={0.05} value={staticMu}
            onChange={(event) => applyStaticMu(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Ma sát trượt μk</span><b>{formatNumber(kineticMu, 2)}</b>
          <input type="range" min={0} max={1} step={0.05} value={kineticMu}
            onChange={(event) => applyKineticMu(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Lực đẩy F dọc mặt</span>
          <b>{push === 0 ? '0 N' : `${formatNumber(Math.abs(push), 0)} N ${push > 0 ? 'xuống' : 'lên'}`}</b>
          <input type="range" min={-120} max={120} step={5} value={push}
            onChange={(event) => setPush(Number(event.target.value))} />
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
      </div>
    </div>
  );
}
