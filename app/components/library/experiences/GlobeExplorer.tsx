'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createVisibilityGate } from '../../../lib/three/visibility';

/**
 * Interactive globe.
 *
 * The geography reference for this release was the David Rumsey historical globe
 * collection, whose own viewer and scans are not ours to take. What the subject
 * needed was a rights-clear dataset with real geography in it, and Natural Earth
 * is exactly that: explicitly public domain, and it ships a `NAME_VI` field, so
 * the country names are correct Vietnamese from the source rather than
 * transliterated by us.
 *
 * `public/data/world-110m.json` is that dataset, decimated to ~10,600 points and
 * delta-encoded at 1/32° — about 90 kB for 177 countries with population, GDP,
 * continent and sub-region. Every border below is real coastline.
 */

type RawCountry = {
  n: string;   // Vietnamese name
  e: string;   // English name
  iso: string;
  c: string;   // continent
  s: string;   // sub-region
  pop: number | null;
  gdp: number | null;
  lx: number;  // label longitude
  ly: number;  // label latitude
  r: number[][]; // delta-encoded quantised rings
};

type Country = {
  name: string;
  english: string;
  iso: string;
  continent: string;
  subregion: string;
  population: number | null;
  gdp: number | null;
  /** Flattened lon/lat rings in degrees. */
  rings: Float32Array[];
  centroid: THREE.Vector3;
};

type Layer = 'continent' | 'population';

const CONTINENT_LABEL: Record<string, string> = {
  Africa: 'Châu Phi',
  Asia: 'Châu Á',
  Europe: 'Châu Âu',
  'North America': 'Bắc Mỹ',
  'South America': 'Nam Mỹ',
  Oceania: 'Châu Đại Dương',
  Antarctica: 'Nam Cực',
  'Seven seas (open ocean)': 'Đại dương',
};

const CONTINENT_COLOR: Record<string, number> = {
  Africa: 0xe79a5c,
  Asia: 0xe0705f,
  Europe: 0x9a7cc4,
  'North America': 0x6aa9bd,
  'South America': 0x63a98c,
  Oceania: 0xd9b45e,
  Antarctica: 0xa9b3bd,
  'Seven seas (open ocean)': 0x8fa9b5,
};

const RADIUS = 2;

/** Fraction of the panel's narrow axis the globe spans. */
const GLOBE_FILL = 0.9;

/** Longitude/latitude in degrees to a point on the sphere. */
function toSphere(lon: number, lat: number, radius: number, out = new THREE.Vector3()) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function formatPopulation(value: number | null) {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} triệu`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} nghìn`;
  return String(value);
}

export function GlobeExplorer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>('continent');
  const [query, setQuery] = useState('');
  // Mirrored into refs so the render loop can read them without the scene
  // effect depending on them; written in an effect, not during render.
  const selectedRef = useRef<string | null>(null);
  const layerRef = useRef<Layer>('continent');
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { layerRef.current = layer; }, [layer]);
  /** Set by the scene so the list can fly the globe to a country. */
  const focusRef = useRef<((iso: string) => void) | null>(null);

  /* ----------------------------------------------------------------- data --- */
  useEffect(() => {
    let cancelled = false;
    fetch('/data/world-110m.json')
      .then((response) => {
        if (!response.ok) throw new Error(`world-110m.json: ${response.status}`);
        return response.json() as Promise<{ q: number; countries: RawCountry[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const q = payload.q || 32;
        const parsed: Country[] = payload.countries.map((raw) => {
          const rings = raw.r.map((flat) => {
            const points = new Float32Array(flat.length);
            let x = 0;
            let y = 0;
            for (let index = 0; index < flat.length; index += 2) {
              x += flat[index];
              y += flat[index + 1];
              points[index] = x / q;
              points[index + 1] = y / q;
            }
            return points;
          });
          return {
            name: raw.n,
            english: raw.e,
            iso: raw.iso || raw.e,
            continent: raw.c,
            subregion: raw.s,
            population: raw.pop,
            gdp: raw.gdp,
            rings,
            centroid: toSphere(raw.lx, raw.ly, 1),
          };
        });
        setCountries(parsed);
      })
      .catch((error) => {
        console.error('Globe data failed to load', error);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  /* ---------------------------------------------------------------- scene --- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !countries) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'model-stage-canvas';
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xe2d4c6, 1.5));
    const key = new THREE.DirectionalLight(0xfff5ea, 1.9);
    key.position.set(-3, 3, 5);
    scene.add(key);

    const globe = new THREE.Group();
    scene.add(globe);
    const disposables: { dispose(): void }[] = [];

    /* ocean sphere */
    const oceanGeometry = new THREE.SphereGeometry(RADIUS, 64, 48);
    const oceanMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xdfe8ea,
      roughness: 0.52,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xffe6d6),
    });
    disposables.push(oceanGeometry, oceanMaterial);
    globe.add(new THREE.Mesh(oceanGeometry, oceanMaterial));

    /* graticule: every 30° so the sphere reads as a globe, not a ball */
    const graticulePoints: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 3) {
        const a = toSphere(lon, lat, RADIUS * 1.001);
        const b = toSphere(lon + 3, lat, RADIUS * 1.001);
        graticulePoints.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -87; lat < 87; lat += 3) {
        const a = toSphere(lon, lat, RADIUS * 1.001);
        const b = toSphere(lon, lat + 3, RADIUS * 1.001);
        graticulePoints.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const graticuleGeometry = new THREE.BufferGeometry();
    graticuleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(graticulePoints, 3));
    const graticuleMaterial = new THREE.LineBasicMaterial({ color: 0x8a7466, transparent: true, opacity: 0.16 });
    disposables.push(graticuleGeometry, graticuleMaterial);
    globe.add(new THREE.LineSegments(graticuleGeometry, graticuleMaterial));

    /* ------------------------------------------------------------ borders --- */
    // One LineSegments per country, so a country can be highlighted, recoloured
    // and picked as a unit. 177 draw calls of a few dozen segments each is well
    // inside budget and far simpler than one merged buffer with index ranges.
    type Entry = { country: Country; line: THREE.LineSegments; material: THREE.LineBasicMaterial };
    const entries: Entry[] = [];
    const scratch = new THREE.Vector3();
    let maxPopulation = 1;
    for (const country of countries) if (country.population) maxPopulation = Math.max(maxPopulation, country.population);

    for (const country of countries) {
      const positions: number[] = [];
      for (const ring of country.rings) {
        const count = ring.length / 2;
        for (let index = 0; index < count; index += 1) {
          const next = (index + 1) % count;
          toSphere(ring[index * 2], ring[index * 2 + 1], RADIUS * 1.004, scratch);
          positions.push(scratch.x, scratch.y, scratch.z);
          toSphere(ring[next * 2], ring[next * 2 + 1], RADIUS * 1.004, scratch);
          positions.push(scratch.x, scratch.y, scratch.z);
        }
      }
      if (!positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
      disposables.push(geometry, material);
      const line = new THREE.LineSegments(geometry, material);
      line.userData.iso = country.iso;
      globe.add(line);
      entries.push({ country, line, material });
    }

    const continentColor = new THREE.Color();
    const populationLow = new THREE.Color(0xe8d9c6);
    const populationHigh = new THREE.Color(0xc9433a);
    const applyColors = () => {
      const active = selectedRef.current;
      for (const entry of entries) {
        const chosen = entry.country.iso === active;
        if (layerRef.current === 'continent') {
          continentColor.set(CONTINENT_COLOR[entry.country.continent] ?? 0x9a938c);
        } else {
          // sqrt so the mid-sized countries are distinguishable instead of every
          // country except three being the palest tint.
          const share = entry.country.population ? Math.sqrt(entry.country.population / maxPopulation) : 0;
          continentColor.copy(populationLow).lerp(populationHigh, share);
        }
        entry.material.color.copy(chosen ? continentColor.clone().offsetHSL(0, 0.1, -0.12) : continentColor);
        entry.material.opacity = active ? (chosen ? 1 : 0.34) : 0.9;
        entry.line.renderOrder = chosen ? 2 : 1;
      }
    };
    applyColors();

    /* -------------------------------------------------------------- input --- */
    const raycaster = new THREE.Raycaster();
    // Lines are infinitely thin; without a threshold a click never hits one.
    raycaster.params.Line = { threshold: 0.035 };
    const pointer = new THREE.Vector2();
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let yaw = 1.9;
    let pitch = 0.28;
    let yawTarget = yaw;
    let pitchTarget = pitch;
    let interacted = false;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      host.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 5) interacted = true;
      yawTarget -= dx * 0.006;
      pitchTarget = THREE.MathUtils.clamp(pitchTarget + dy * 0.005, -1.25, 1.25);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      if (moved > 6) return;
      const rect = host.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(entries.map((entry) => entry.line), false);
      const iso = hits[0]?.object.userData.iso as string | undefined;
      setSelected((current) => (iso ? (iso === current ? null : iso) : current));
    };
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);

    /** Turns the globe so a country faces the camera. */
    focusRef.current = (iso: string) => {
      const entry = entries.find((item) => item.country.iso === iso);
      if (!entry) return;
      interacted = true;
      const point = entry.country.centroid;
      pitchTarget = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(point.y, -1, 1)), -1.1, 1.1);
      yawTarget = Math.atan2(point.x, point.z);
    };

    /*
     * Distance is solved from the panel, not fixed.
     *
     * A hard-coded 5.6 put the horizon outside the frame on any panel narrower
     * than it was tuned for: at 36° the half-frame is 1.82 units at that
     * distance and the globe's radius is 2, so Africa ran off the bottom edge
     * and the Atlantic off the left. A sphere of radius R is exactly tangent to
     * the frustum at R / sin(half-angle), and the binding angle is whichever of
     * the two is smaller — so this fits the globe to the *narrow* axis of
     * whatever panel it is given and keeps a twelfth of the frame as air.
     */
    let distance = 7.4;
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      const halfV = THREE.MathUtils.degToRad(camera.fov) * 0.5;
      const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
      distance = RADIUS / (Math.sin(Math.min(halfV, halfH)) * GLOBE_FILL);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const gate = createVisibilityGate(host, 160);
    const onScreen = () => gate.visible();
    let tabVisible = document.visibilityState !== 'hidden';
    const onVisibility = () => { tabVisible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);

    const timer = new THREE.Timer();
    let lastSelection = selectedRef.current;
    let lastLayer = layerRef.current;
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!onScreen() || !tabVisible) return;
      if (selectedRef.current !== lastSelection || layerRef.current !== lastLayer) {
        lastSelection = selectedRef.current;
        lastLayer = layerRef.current;
        applyColors();
      }
      if (!interacted && !reduceMotion) yawTarget += delta * 0.09;
      const ease = 1 - Math.pow(0.004, delta);
      yaw += (yawTarget - yaw) * ease;
      pitch += (pitchTarget - pitch) * ease;
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      camera.lookAt(0, 0, 0);
      /*
       * The key light rides with the camera.
       *
       * Fixed at (-3, 3, 5) it lit one hemisphere of a globe that turns
       * continuously, so for most of the idle rotation the visitor was looking
       * at the night side: the ocean's pale blue read as flat grey and the
       * country borders lost their relief. Offsetting from the eye keeps the
       * face being read lit, and keeps the terminator near the limb where it
       * looks like a globe rather than like a bug.
       */
      key.position.copy(camera.position).multiplyScalar(0.9)
        .addScaledVector(camera.up, distance * 0.45)
        .add(new THREE.Vector3(-distance * 0.3, 0, 0).applyQuaternion(camera.quaternion));
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      focusRef.current = null;
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      gate.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [countries]);

  const current = useMemo(
    () => countries?.find((country) => country.iso === selected) ?? null,
    [countries, selected],
  );

  const matches = useMemo(() => {
    if (!countries) return [];
    const text = query.trim().toLocaleLowerCase('vi');
    const pool = text
      ? countries.filter((country) =>
          country.name.toLocaleLowerCase('vi').includes(text)
          || country.english.toLowerCase().includes(text))
      : [...countries].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    return pool.slice(0, 14);
  }, [countries, query]);

  if (failed) {
    return <div className="globe"><p className="model-stage-status is-error">Không tải được dữ liệu bản đồ.</p></div>;
  }
  if (!countries) {
    return <div className="globe"><p className="model-stage-status">Đang tải dữ liệu bản đồ…</p></div>;
  }

  return (
    <div className="globe">
      <div className="globe-stage" ref={hostRef} role="img" aria-label="Quả địa cầu tương tác" />

      <div className="globe-side">
        <div className="globe-layers" role="group" aria-label="Lớp hiển thị">
          <button type="button" className={layer === 'continent' ? 'is-active' : ''}
            aria-pressed={layer === 'continent'} onClick={() => setLayer('continent')}>Châu lục</button>
          <button type="button" className={layer === 'population' ? 'is-active' : ''}
            aria-pressed={layer === 'population'} onClick={() => setLayer('population')}>Dân số</button>
        </div>

        <label className="globe-search">
          <input
            type="search"
            value={query}
            placeholder="Tìm quốc gia…"
            aria-label="Tìm quốc gia"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <ul className="globe-list">
          {matches.map((country) => (
            <li key={country.iso}>
              <button
                type="button"
                className={selected === country.iso ? 'is-active' : ''}
                onClick={() => { setSelected(country.iso); focusRef.current?.(country.iso); }}
              >
                <b>{country.name}</b>
                <small>{CONTINENT_LABEL[country.continent] ?? country.continent}</small>
              </button>
            </li>
          ))}
          {!matches.length && <li className="globe-list-empty">Không tìm thấy quốc gia.</li>}
        </ul>

        {current && (
          <dl className="globe-facts">
            <div><dt>Quốc gia</dt><dd>{current.name}</dd></div>
            <div><dt>Tên quốc tế</dt><dd>{current.english}</dd></div>
            <div><dt>Châu lục</dt><dd>{CONTINENT_LABEL[current.continent] ?? current.continent}</dd></div>
            <div><dt>Khu vực</dt><dd>{current.subregion}</dd></div>
            <div><dt>Dân số</dt><dd>{formatPopulation(current.population)}</dd></div>
            <div><dt>GDP</dt><dd>{current.gdp ? `${(current.gdp / 1000).toFixed(1)} tỷ USD` : '—'}</dd></div>
          </dl>
        )}
        {!current && <p className="globe-empty">Nhấp một quốc gia trên quả cầu, hoặc chọn từ danh sách.</p>}
      </div>
    </div>
  );
}
