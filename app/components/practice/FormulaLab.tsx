'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { LabChrome, LabPad, type LabFlash, type LabStep } from './LabChrome';
import { PracticeIcon } from './PracticeIcons';
import { createCarWorkshop, type CarWorkshop } from '../../lib/formula/carScene';
import { createPracticeRoom, trackShadow } from '../../lib/three/practiceRoom';

/**
 * Lab 01 — the Formula workshop, inline.
 *
 * This is the *same* car as the full-screen overlay: the same protected GLB,
 * the same material set, the same authored kit ⇄ assembled endpoints, the same
 * wheel identification, all of it through `createCarWorkshop`. Nothing about
 * the model was re-made to get it onto this stage. What differs is the room —
 * the overlay is a dark neon studio and this is the Library's ivory one —
 * because the whole point of the hub is that three labs from three different
 * origins stand in one place.
 *
 * The three modes are the three capabilities the brief column lists, in the
 * order a real kit is built: lay the parts out, look at what they became, drive
 * it. That order is the lesson, so the steps are a route rather than three
 * equal tabs — but every one of them stays clickable, because a student who
 * wants to drive first should be allowed to drive first.
 */

type Mode = 'KIT' | 'STUDIO' | 'DRIVE';

const MODES: Mode[] = ['KIT', 'STUDIO', 'DRIVE'];

const STEPS: LabStep[] = [
  { id: 'KIT', label: 'Lắp ráp' },
  { id: 'STUDIO', label: 'Quan sát' },
  { id: 'DRIVE', label: 'Lái thử' },
];

const COPY: Record<Mode, { objective: string; hint: string }> = {
  KIT: {
    objective: 'Kéo để xoay quanh bàn lắp ráp — mọi chi tiết đang nằm rời trên khung nhựa.',
    hint: 'Khung nhựa bên trái là nơi các chi tiết được đúc ra. Thảm cắt, kéo và dao rọc nằm sẵn quanh bàn, đúng như một bộ mô hình thật.',
  },
  STUDIO: {
    objective: 'Xe đã lắp xong. Kéo để xem thân, bánh, khoang lái và cánh gió.',
    hint: 'Cánh gió sau lớn hơn cánh trước rất nhiều: nó tạo lực ép xuống cầu sau, nơi động cơ truyền lực xuống mặt đường.',
  },
  DRIVE: {
    objective: 'Nhấp vào khung 3D, rồi dùng W A S D hoặc phím mũi tên để lái.',
    hint: 'Vào cua thì nhả ga trước, đừng phanh giữa cua. Xe càng nhanh, bán kính cua càng rộng — đúng như xe thật.',
  },
};

const PAD_BUTTONS = [
  { id: 'KeyW', glyph: '↑', name: 'Tăng tốc', area: 'up' },
  { id: 'KeyA', glyph: '←', name: 'Rẽ trái', area: 'left' },
  { id: 'KeyS', glyph: '↓', name: 'Phanh hoặc lùi', area: 'down' },
  { id: 'KeyD', glyph: '→', name: 'Rẽ phải', area: 'right' },
];

/** How far the room extends. The drive floor follows the car inside it. */
const ROOM_SPAN = 26;

/**
 * No step in this lab is ever ticked.
 *
 * The drone and the robot have steps you *complete*; these three are ways of
 * looking at one car, and a ✓ against "Lắp ráp" would be the chrome claiming
 * the visitor had assembled something they only watched.
 */
const NOTHING_TICKED = 0;

export function FormulaLab({ onOpenFull }: { onOpenFull: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<Mode>('STUDIO');
  const keysRef = useRef(new Set<string>());
  const resetRef = useRef<() => void>(() => {});

  /*
   * Opens on STUDIO, not on KIT.
   *
   * The three modes are three views of one model rather than a sequence, so the
   * question is only which frame the section should arrive on — and an exploded
   * kit is the wrong answer. A visitor scrolling into this band gets about a
   * second to decide whether the thing in front of them is a product; a finished
   * Formula car standing in a lit room answers that, and a table of loose parts
   * reads as a scene that has not loaded yet. The bench is one click away, and
   * the step strip says so.
   */
  const [mode, setMode] = useState<Mode>('STUDIO');
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [speed, setSpeed] = useState(0);
  /* Keyed on the mode rather than a boolean: a hint is spent when the step it
     answered is over, and deriving that needs no effect. */
  const [hintFor, setHintFor] = useState<Mode | null>(null);

  /* Everything a mode change implies, in one place. Doing the bookkeeping here
     rather than in an effect on `mode` keeps it out of the render cascade. */
  const goMode = useCallback((next: Mode) => {
    setMode(next);
    setHintFor(null);
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === 'DRIVE') requestAnimationFrame(() => hostRef.current?.focus());
  }, [mode]);

  useEffect(() => {
    const host = hostRef.current;
    const mount = viewRef.current;
    if (!host || !mount) return;
    let disposed = false;
    setState('loading');

    const room = createPracticeRoom(host, { mount, span: ROOM_SPAN, fov: 32 });
    const { stage } = room;
    const world = new THREE.Group();
    stage.scene.add(world);

    let workshop: CarWorkshop | null = null;
    /** Distance the car has to be lifted for its tyres to touch the floor. */
    let wheelDrop = 0;
    /** Where the desk surface has to sit for the bench to rest on the floor. */
    const KIT_LIFT = 1.34;

    createCarWorkshop(stage.renderer, world, { initialKitProgress: 0, bench: 'ivory' })
      .then((built) => {
        if (disposed) {
          built.dispose();
          return;
        }
        workshop = built;
        /*
         * Measure the assembled pose, so the tyres land on the grid rather than
         * near it.
         *
         * Two things have to be true for this number to mean anything, and
         * getting either wrong sinks the car through the floor. `update(0, …)`
         * is what puts every piece at its *assembled* endpoint — the GLB opens
         * exploded, and measuring that gives a box the size of the whole bench.
         * And `Box3.setFromObject` returns a **world** box while what is wanted
         * is a distance in the car's own frame, so the answer has to be taken
         * relative to the car's world origin. Measuring the world box directly
         * folds in whatever the room's lift happens to be at that instant — the
         * first version did, and the car spent the opening frame buried under
         * the ivory floor with only its rear wing showing.
         */
        built.update(0, 0, 0);
        built.carRoot.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(built.carRoot);
        const origin = built.carRoot.getWorldPosition(new THREE.Vector3());
        wheelDrop = origin.y - box.min.y;
        setState('ready');
      })
      .catch((error) => {
        console.error('Practice: Formula workshop failed to load', error);
        if (!disposed) setState('failed');
      });

    /* --- camera ---------------------------------------------------------- */
    let orbitYaw = 0.78;
    let orbitPitch = 0.24;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest('button, a')) return;
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      host.setPointerCapture(event.pointerId);
      host.dataset.grabbing = 'true';
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || modeRef.current === 'DRIVE') return;
      orbitYaw -= (event.clientX - previousX) * 0.006;
      orbitPitch = THREE.MathUtils.clamp(orbitPitch + (event.clientY - previousY) * 0.004, 0.06, 0.82);
      previousX = event.clientX;
      previousY = event.clientY;
    };
    const endDrag = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      delete host.dataset.grabbing;
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);

    /* --- driving --------------------------------------------------------- */
    const keys = keysRef.current;
    const relevant = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
    const onKeyDown = (event: KeyboardEvent) => {
      if (modeRef.current !== 'DRIVE' || !relevant.has(event.code)) return;
      event.preventDefault();
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('keyup', onKeyUp);

    let carSpeed = 0;
    let heading = 0;
    let studioYaw = 0.78;
    let wheelRoll = 0;
    let kitProgress = 0;
    /* Seeded near the assembled lift rather than at the bench's, so the opening
       frame does not glide up from the floor while the car is still loading. */
    let worldLift = 0.86;
    const drivePosition = new THREE.Vector3();
    const targetCamera = new THREE.Vector3();
    const carTarget = new THREE.Vector3();
    const carWorld = new THREE.Vector3();
    const floorTarget = new THREE.Vector3();

    resetRef.current = () => {
      carSpeed = 0;
      heading = 0;
      drivePosition.set(0, 0, 0);
      studioYaw = 0.78;
      orbitYaw = 0.78;
      orbitPitch = 0.24;
      keys.clear();
    };

    let hudElapsed = 0;
    const timer = new THREE.Timer();
    stage.renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!stage.active()) return;
      const active = modeRef.current;
      const built = workshop;

      const kitTarget = active === 'KIT' ? 1 : 0;
      kitProgress += (kitTarget - kitProgress) * Math.min(1, delta * 3.2);
      // The room lifts with the mode: in KIT the bench's surface is the floor,
      // everywhere else the tyres are. Blended on the same easing as the kit
      // itself, so the two never disagree mid-transition.
      const liftTarget = active === 'KIT' ? KIT_LIFT : wheelDrop + 0.36;
      worldLift += (liftTarget - worldLift) * Math.min(1, delta * 3.2);
      world.position.y = worldLift;

      /*
       * The bench appears and disappears rather than fading.
       *
       * Fading it would mean writing `transparent` and `opacity` onto every
       * material under `kitRoot` each frame — which forces a shader recompile
       * on the frame `transparent` flips, and would also reach the two custom
       * shader materials the cutting mat and the sprue frame use. Threshold at
       * 4% instead: the pieces themselves are still travelling then, so the eye
       * is following the car and not the desk, and the pop is not seen.
       */
      if (built) built.kitRoot.visible = kitProgress > 0.04;

      if (active === 'DRIVE') {
        const throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1
          : keys.has('KeyS') || keys.has('ArrowDown') ? -0.62 : 0;
        const steer = keys.has('KeyA') || keys.has('ArrowLeft') ? 1
          : keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0;
        carSpeed += throttle * delta * 6.5;
        carSpeed *= Math.pow(throttle === 0 ? 0.975 : 0.986, delta * 60);
        carSpeed = THREE.MathUtils.clamp(carSpeed, -2.6, 8.5);
        heading += steer * delta * (0.7 + Math.abs(carSpeed) * 0.105) * Math.sign(carSpeed || 1);
        drivePosition.x += Math.sin(heading) * carSpeed * delta;
        drivePosition.z += Math.cos(heading) * carSpeed * delta;
        if (built) {
          carTarget.set(drivePosition.x, -0.36, drivePosition.z);
          built.carRoot.position.lerp(carTarget, 0.2);
          // The authored Formula points along local +X; heading zero drives +Z.
          built.carRoot.rotation.y = heading - Math.PI / 2;
        }
        wheelRoll -= carSpeed * delta * 1.8;
        targetCamera.set(
          drivePosition.x - Math.sin(heading) * 8.6,
          3.3,
          drivePosition.z - Math.cos(heading) * 8.6,
        );
        stage.camera.position.lerp(targetCamera, 1 - Math.pow(0.035, delta));
        stage.camera.lookAt(drivePosition.x, worldLift - 0.1, drivePosition.z);

        /*
         * The floor follows the car.
         *
         * A fitted grid is a finite disc, and a car driving off the edge of one
         * is the most jarring thing this stage could show. Re-seating the disc
         * and the grid on the car's own position makes an infinite floor out of
         * one mesh — the fade travels with it, so there is no edge to reach.
         */
        floorTarget.set(drivePosition.x, 0, drivePosition.z);
        room.ground.position.x = floorTarget.x;
        room.ground.position.z = floorTarget.z;
        stage.grid.mesh.position.x = floorTarget.x;
        stage.grid.mesh.position.z = floorTarget.z;
      } else {
        carSpeed *= Math.pow(0.9, delta * 60);
        if (active === 'STUDIO' && !dragging && !stage.reduceMotion) studioYaw += delta * 0.16;
        if (built) {
          carTarget.set(0, active === 'KIT' ? -0.3 : -0.36, 0);
          built.carRoot.position.lerp(carTarget, 1 - Math.pow(0.012, delta));
          built.carRoot.rotation.y = active === 'STUDIO' ? studioYaw : 0;
        }
        const radius = active === 'KIT' ? 9.2 : 6.7;
        targetCamera.set(
          Math.sin(orbitYaw) * radius,
          worldLift + Math.sin(orbitPitch) * radius * (active === 'KIT' ? 0.86 : 0.62),
          Math.cos(orbitYaw) * radius,
        );
        stage.camera.position.lerp(targetCamera, 1 - Math.pow(0.025, delta));
        /* Aimed a little *below* the subject, which lifts it in the frame: an
           aim above the car's centre pushed it into the bottom third. */
        stage.camera.lookAt(0, worldLift + (active === 'KIT' ? -0.92 : -0.26), 0);
        room.ground.position.set(0, room.ground.position.y, 0);
        stage.grid.mesh.position.set(0, stage.grid.mesh.position.y, 0);
      }

      if (built) {
        const steer = active === 'DRIVE'
          ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 0.16 : keys.has('KeyD') || keys.has('ArrowRight') ? -0.16 : 0)
          : 0;
        built.update(kitProgress, wheelRoll, steer);
        built.carRoot.getWorldPosition(carWorld);
        room.shadow.mesh.visible = kitProgress < 0.6;
        trackShadow(room.shadow, carWorld.setY(0.02), 2.1, 0, 4);
      }

      hudElapsed += delta;
      if (hudElapsed > 0.12) {
        setSpeed(Math.round(Math.abs(carSpeed) * 21));
        hudElapsed = 0;
      }

      stage.renderer.render(stage.scene, stage.camera);
      stage.noteFrame(delta);
    });

    return () => {
      disposed = true;
      stage.renderer.setAnimationLoop(null);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('keydown', onKeyDown);
      host.removeEventListener('keyup', onKeyUp);
      keys.clear();
      delete host.dataset.grabbing;
      workshop?.dispose();
      world.removeFromParent();
      room.dispose();
    };
  }, []);

  const press = useCallback((code: string) => { keysRef.current.add(code); }, []);
  const release = useCallback((code: string) => { keysRef.current.delete(code); }, []);

  const index = MODES.indexOf(mode);
  const copy = COPY[mode];
  const flash: LabFlash | null = null;

  return (
    <div className="lab lab--formula" data-state={state} ref={hostRef} tabIndex={mode === 'DRIVE' ? 0 : -1}>
      <div ref={viewRef} role="img" aria-label="Mô hình xe đua F1 trong không gian 3D" className="lab-view" />

      {state !== 'ready' && (
        <p className={`lab-status${state === 'failed' ? ' is-error' : ''}`}>
          <i />
          {state === 'failed' ? 'Không tải được xưởng mô hình.' : 'Đang dựng xưởng mô hình…'}
        </p>
      )}

      {state === 'ready' && (
        <LabChrome
          live
          steps={STEPS}
          activeStep={index}
          completedSteps={NOTHING_TICKED}
          onStepSelect={(next) => goMode(MODES[next])}
          objective={copy.objective}
          hint={copy.hint}
          hintOpen={hintFor === mode}
          onHint={() => setHintFor((current) => (current === mode ? null : mode))}
          /* Back to STUDIO, which is where the lab opens — not to KIT. "Làm
             lại" means "put it back how you found it", and putting it back
             somewhere the visitor never started is a different promise. */
          onReset={() => { goMode('STUDIO'); resetRef.current(); }}
          flash={flash}
          readout={mode === 'DRIVE' ? <><b>{speed}</b><span>km/h</span></> : undefined}
          actions={
            index < MODES.length - 1 ? (
              <button type="button" className="lab-button is-primary" onClick={() => goMode(MODES[index + 1])}>
                <span>{index === 0 ? 'Xem xe hoàn thiện' : 'Lái thử'}</span>
                <PracticeIcon name={index === 0 ? 'inspect' : 'drive'} />
              </button>
            ) : (
              <button type="button" className="lab-button is-primary" onClick={onOpenFull}>
                <span>Toàn màn hình</span>
                <PracticeIcon name="depth" />
              </button>
            )
          }
        >
          {mode === 'DRIVE' && (
            <LabPad label="Điều khiển lái xe" buttons={PAD_BUTTONS} onPress={press} onRelease={release} />
          )}
        </LabChrome>
      )}
    </div>
  );
}
