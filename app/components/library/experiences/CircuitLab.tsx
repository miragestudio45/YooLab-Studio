'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Mạch điện một chiều — giải mạch thật, không phải một hình vẽ có hiệu ứng.
 *
 * Mỗi khung hình, component này giải lại mạch theo định luật Ohm và định luật
 * Kirchhoff cho ba cách nối: một đèn, hai đèn nối tiếp, hai đèn song song. Dòng
 * điện tính ra quyết định ba thứ trên màn hình cùng lúc — số trên bảng đọc, tốc
 * độ các hạt điện chạy trên dây, và độ sáng của từng bóng đèn. Không có con số
 * nào được đặt tay để trông cho hợp lý.
 *
 * Bài học nằm ở chỗ so sánh hai cách nối, nên giao diện cố ý để đổi cách nối chỉ
 * bằng một lần bấm mà vẫn giữ nguyên nguồn và hai điện trở:
 *
 *   - Nối tiếp: hai đèn cùng dòng điện. P = I²R, nên đèn có điện trở LỚN hơn
 *     sáng hơn.
 *   - Song song: hai đèn cùng hiệu điện thế. P = U²/R, nên đèn có điện trở NHỎ
 *     hơn sáng hơn.
 *
 * Đúng cùng một cặp điện trở, đảo ngược kết luận. Đó là điều một hình vẽ tĩnh
 * không dạy được, và cũng là lý do phần này phải là mô phỏng.
 *
 * Nhánh song song còn được vẽ đúng theo dòng: đoạn dây trước điểm rẽ mang dòng
 * tổng, hai nhánh mang dòng riêng, nên mật độ hạt trên dây tự nói ra rằng dòng
 * điện chia ra ở nút và cộng lại sau nút.
 */

type Topology = 'single' | 'series' | 'parallel';

type Point = { x: number; y: number };

/** Một đoạn dây, đã định hướng theo chiều dòng điện quy ước. */
type Wire = { points: Point[]; current: number };

type LampState = {
  id: 'A' | 'B';
  at: Point;
  resistance: number;
  current: number;
  voltage: number;
  power: number;
  /** 0–1, dùng cho quầng sáng và cho thanh so sánh trong bảng đọc. */
  glow: number;
};

type Solution = {
  wires: Wire[];
  lamps: LampState[];
  totalResistance: number;
  totalCurrent: number;
  totalPower: number;
};

const TOPOLOGIES: { id: Topology; label: string; hint: string }[] = [
  { id: 'single', label: 'Một đèn', hint: 'Mạch kín đơn giản nhất: một nguồn, một điện trở' },
  { id: 'series', label: 'Nối tiếp', hint: 'Hai đèn trên cùng một đường dây — cùng dòng điện' },
  { id: 'parallel', label: 'Song song', hint: 'Hai nhánh riêng giữa hai đầu nguồn — cùng hiệu điện thế' },
];

/** Khung mạch trong toạ độ 0–1, được ánh xạ sang canvas khi vẽ. */
const FRAME = { left: 0.11, right: 0.9, top: 0.2, bottom: 0.84 };
/** Nửa chiều cao ký hiệu nguồn trên cạnh trái. */
const CELL_HALF = 0.075;
/** Vị trí công tắc trên dây trên, theo x. */
const SWITCH_X = 0.34;
const SWITCH_HALF = 0.045;

/**
 * Độ sáng từ công suất.
 *
 * Bão hoà mềm chứ không phải tỉ lệ thuận: một bóng 40 W không thể vẽ sáng gấp
 * bốn mươi lần bóng 1 W trên cùng một khung hình, và mắt người cũng không nhìn
 * độ sáng theo tỉ lệ thuận. Hàm này giữ đúng thứ tự sáng–tối giữa hai bóng, đó
 * là điều duy nhất bài học cần đọc được từ hình.
 */
function glowFor(power: number) {
  return 1 - Math.exp(-power / 5.5);
}

/**
 * Giải mạch.
 *
 * Công tắc mở là dòng bằng 0 ở mọi nơi — không phải là "tắt hiệu ứng": mạch vẫn
 * được giải, chỉ là với dòng 0, nên bảng đọc vẫn hiện đúng điện trở tương đương
 * và học sinh thấy rõ hở mạch khác hẳn với nguồn yếu.
 */
function solve(
  topology: Topology,
  voltage: number,
  resistanceA: number,
  resistanceB: number,
  closed: boolean,
): Solution {
  const midY = (FRAME.top + FRAME.bottom) / 2;
  const plus: Point = { x: FRAME.left, y: midY - CELL_HALF };
  const minus: Point = { x: FRAME.left, y: midY + CELL_HALF };
  const topLeft: Point = { x: FRAME.left, y: FRAME.top };
  const topRight: Point = { x: FRAME.right, y: FRAME.top };
  const bottomRight: Point = { x: FRAME.right, y: FRAME.bottom };
  const bottomLeft: Point = { x: FRAME.left, y: FRAME.bottom };

  if (topology === 'parallel') {
    const branchA = 0.585;
    const branchB = FRAME.right;
    const conductance = 1 / resistanceA + 1 / resistanceB;
    const totalResistance = 1 / conductance;
    const currentA = closed ? voltage / resistanceA : 0;
    const currentB = closed ? voltage / resistanceB : 0;
    const total = currentA + currentB;
    const lamps: LampState[] = [
      {
        id: 'A',
        at: { x: branchA, y: midY },
        resistance: resistanceA,
        current: currentA,
        voltage: closed ? voltage : 0,
        power: currentA * currentA * resistanceA,
        glow: glowFor(currentA * currentA * resistanceA),
      },
      {
        id: 'B',
        at: { x: branchB, y: midY },
        resistance: resistanceB,
        current: currentB,
        voltage: closed ? voltage : 0,
        power: currentB * currentB * resistanceB,
        glow: glowFor(currentB * currentB * resistanceB),
      },
    ];
    return {
      totalResistance,
      totalCurrent: total,
      totalPower: total * (closed ? voltage : 0),
      lamps,
      wires: [
        // Trước điểm rẽ: dòng tổng.
        { points: [plus, topLeft, { x: branchA, y: FRAME.top }], current: total },
        // Sau điểm rẽ, phần còn lại chỉ mang dòng của nhánh B.
        { points: [{ x: branchA, y: FRAME.top }, { x: branchB, y: FRAME.top }], current: currentB },
        { points: [{ x: branchA, y: FRAME.top }, { x: branchA, y: FRAME.bottom }], current: currentA },
        { points: [{ x: branchB, y: FRAME.top }, { x: branchB, y: FRAME.bottom }], current: currentB },
        { points: [{ x: branchB, y: FRAME.bottom }, { x: branchA, y: FRAME.bottom }], current: currentB },
        { points: [{ x: branchA, y: FRAME.bottom }, bottomLeft, minus], current: total },
      ],
    };
  }

  if (topology === 'series') {
    const totalResistance = resistanceA + resistanceB;
    const current = closed ? voltage / totalResistance : 0;
    const lampAY = FRAME.top + (FRAME.bottom - FRAME.top) * 0.28;
    const lampBY = FRAME.top + (FRAME.bottom - FRAME.top) * 0.72;
    const lamps: LampState[] = [
      {
        id: 'A',
        at: { x: FRAME.right, y: lampAY },
        resistance: resistanceA,
        current,
        voltage: current * resistanceA,
        power: current * current * resistanceA,
        glow: glowFor(current * current * resistanceA),
      },
      {
        id: 'B',
        at: { x: FRAME.right, y: lampBY },
        resistance: resistanceB,
        current,
        voltage: current * resistanceB,
        power: current * current * resistanceB,
        glow: glowFor(current * current * resistanceB),
      },
    ];
    return {
      totalResistance,
      totalCurrent: current,
      totalPower: current * (closed ? voltage : 0),
      lamps,
      wires: [
        { points: [plus, topLeft, topRight, bottomRight, bottomLeft, minus], current },
      ],
    };
  }

  const current = closed ? voltage / resistanceA : 0;
  return {
    totalResistance: resistanceA,
    totalCurrent: current,
    totalPower: current * (closed ? voltage : 0),
    lamps: [
      {
        id: 'A',
        at: { x: FRAME.right, y: midY },
        resistance: resistanceA,
        current,
        voltage: closed ? voltage : 0,
        power: current * current * resistanceA,
        glow: glowFor(current * current * resistanceA),
      },
    ],
    wires: [{ points: [plus, topLeft, topRight, bottomRight, bottomLeft, minus], current }],
  };
}

/** Chiều dài từng đoạn và tổng chiều dài, để rải hạt đều theo dây. */
function wireLengths(points: Point[], width: number, height: number) {
  const spans: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = (points[index].x - points[index - 1].x) * width;
    const dy = (points[index].y - points[index - 1].y) * height;
    const span = Math.hypot(dx, dy);
    spans.push(span);
    total += span;
  }
  return { spans, total };
}

function pointAt(points: Point[], spans: number[], distance: number, width: number, height: number): Point {
  let remaining = distance;
  for (let index = 0; index < spans.length; index += 1) {
    if (remaining <= spans[index] || index === spans.length - 1) {
      const ratio = spans[index] > 0 ? Math.min(remaining / spans[index], 1) : 0;
      const from = points[index];
      const to = points[index + 1];
      return {
        x: (from.x + (to.x - from.x) * ratio) * width,
        y: (from.y + (to.y - from.y) * ratio) * height,
      };
    }
    remaining -= spans[index];
  }
  return { x: points[0].x * width, y: points[0].y * height };
}

export function CircuitLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [topology, setTopology] = useState<Topology>('series');
  const [voltage, setVoltage] = useState(6);
  const [resistanceA, setResistanceA] = useState(6);
  const [resistanceB, setResistanceB] = useState(18);
  const [closed, setClosed] = useState(true);

  const solution = useMemo(
    () => solve(topology, voltage, resistanceA, resistanceB, closed),
    [topology, voltage, resistanceA, resistanceB, closed],
  );

  /* --------------------------------------------------------------- vẽ mạch --- */
  const draw = useCallback((elapsed: number) => {
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

    const style = getComputedStyle(canvas);
    const ink = style.getPropertyValue('--sim-ink').trim() || '#191720';
    const accent = style.getPropertyValue('--sim-accent').trim() || '#e87868';
    const muted = style.getPropertyValue('--sim-muted').trim() || '#706a73';
    const line = style.getPropertyValue('--sim-line').trim() || 'rgba(117,91,70,0.2)';
    /*
     * The page's own family, read from the token rather than named here.
     *
     * These labels used to be hardcoded as `Inter, system-ui, sans-serif` and
     * `"JetBrains Mono", ui-monospace, monospace`. Neither face is loaded any
     * more — the site is one family now — so both fell back to a system font, and
     * a 10 px readout drawn into a canvas in a different typeface from the label
     * beside it is exactly the kind of seam that is invisible in review and
     * obvious once you see it.
     *
     * No `tabular-nums` here even though the readouts had a monospaced face:
     * `ctx.font` is the CSS `font` shorthand, which does not accept
     * `font-variant-numeric`, and an invalid font string is silently ignored
     * rather than erroring. These labels are placed individually with
     * `textAlign` rather than stacked into a column, so they never needed a fixed
     * advance width — the DOM readouts that do get it from the body rule.
     */
    const face = style.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';

    const midY = ((FRAME.top + FRAME.bottom) / 2) * height;

    /* ------------------------------------------------------------- dây --- */
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const wire of solution.wires) {
      context.strokeStyle = ink;
      context.globalAlpha = 0.72;
      context.lineWidth = 2.1;
      context.beginPath();
      wire.points.forEach((point, index) => {
        const x = point.x * width;
        const y = point.y * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.globalAlpha = 1;

    /* ----------------------------------------------- hạt điện trên dây --- */
    /* Mật độ hạt là hằng số, tốc độ tỉ lệ với dòng. Đó là mô hình đúng: dòng
       điện lớn không phải là "nhiều điện tích hơn" mà là cùng lượng điện tích
       chạy nhanh hơn qua một tiết diện. */
    const SPACING = 26;
    for (const wire of solution.wires) {
      if (wire.current <= 1e-4) continue;
      const { spans, total } = wireLengths(wire.points, width, height);
      if (total <= 0) continue;
      const speed = Math.min(wire.current, 6) * 34 + 14;
      const phase = (elapsed * speed) % SPACING;
      const count = Math.floor(total / SPACING);
      context.fillStyle = accent;
      for (let index = 0; index <= count; index += 1) {
        const distance = phase + index * SPACING;
        if (distance > total) continue;
        const at = pointAt(wire.points, spans, distance, width, height);
        context.beginPath();
        context.arc(at.x, at.y, 2.6, 0, Math.PI * 2);
        context.fill();
      }
    }

    /* ----------------------------------------------------------- nguồn --- */
    const cellX = FRAME.left * width;
    const plusY = midY - CELL_HALF * height;
    const minusY = midY + CELL_HALF * height;
    context.strokeStyle = ink;
    context.lineWidth = 2.6;
    context.beginPath();
    context.moveTo(cellX - 15, plusY);
    context.lineTo(cellX + 15, plusY);
    context.stroke();
    context.lineWidth = 2.6;
    context.beginPath();
    context.moveTo(cellX - 8, minusY);
    context.lineTo(cellX + 8, minusY);
    context.stroke();
    context.fillStyle = muted;
    context.font = `600 11px ${face}`;
    context.textAlign = 'right';
    context.fillText('+', cellX - 21, plusY + 4);
    context.fillText('−', cellX - 21, minusY + 4);
    context.textAlign = 'left';
    context.fillStyle = ink;
    context.font = `620 12px ${face}`;
    context.fillText(`${voltage.toFixed(1)} V`, cellX + 20, midY + 4);

    /* --------------------------------------------------------- công tắc --- */
    const switchX = SWITCH_X * width;
    const switchY = FRAME.top * height;
    const half = SWITCH_HALF * width;
    context.strokeStyle = ink;
    context.lineWidth = 2.1;
    context.globalAlpha = 1;
    // Cắt dây dưới ký hiệu công tắc để hai tiếp điểm nhìn ra là hai tiếp điểm.
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(switchX - half, switchY);
    context.lineTo(switchX + half, switchY);
    context.stroke();
    context.restore();
    context.fillStyle = ink;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(switchX + side * half, switchY, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = closed ? ink : accent;
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(switchX - half, switchY);
    if (closed) context.lineTo(switchX + half, switchY);
    else context.lineTo(switchX + half * 0.72, switchY - half * 1.15);
    context.stroke();
    context.fillStyle = closed ? muted : accent;
    context.font = `600 10px ${face}`;
    context.textAlign = 'center';
    context.fillText(closed ? 'Đóng' : 'Hở mạch', switchX, switchY - 14);
    context.textAlign = 'left';

    /* ------------------------------------------------------------- đèn --- */
    for (const lamp of solution.lamps) {
      const x = lamp.at.x * width;
      const y = lamp.at.y * height;
      const radius = 17;

      // Cắt dây bên dưới bóng đèn, nếu không dây sẽ vắt qua giữa ký hiệu.
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.arc(x, y, radius + 1.5, 0, Math.PI * 2);
      context.fill();
      context.restore();

      if (lamp.glow > 0.01) {
        const halo = context.createRadialGradient(x, y, radius * 0.4, x, y, radius * 3.4);
        halo.addColorStop(0, `rgba(255, 196, 120, ${0.5 * lamp.glow})`);
        halo.addColorStop(0.5, `rgba(255, 178, 96, ${0.16 * lamp.glow})`);
        halo.addColorStop(1, 'rgba(255, 178, 96, 0)');
        context.fillStyle = halo;
        context.beginPath();
        context.arc(x, y, radius * 3.4, 0, Math.PI * 2);
        context.fill();
      }

      context.fillStyle = lamp.glow > 0.01
        ? `rgba(255, 214, 150, ${0.25 + 0.7 * lamp.glow})`
        : 'rgba(0, 0, 0, 0)';
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = ink;
      context.globalAlpha = 0.78;
      context.lineWidth = 1.9;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.stroke();
      // Dây tóc: ký hiệu bóng đèn của SGK là vòng tròn với hai nét chéo.
      const cross = radius * 0.62;
      context.beginPath();
      context.moveTo(x - cross, y - cross);
      context.lineTo(x + cross, y + cross);
      context.moveTo(x + cross, y - cross);
      context.lineTo(x - cross, y + cross);
      context.stroke();
      context.globalAlpha = 1;

      context.fillStyle = ink;
      context.font = `620 12px ${face}`;
      const labelX = x - radius - 12;
      context.textAlign = 'right';
      context.fillText(`Đ${lamp.id}`, labelX, y - 1);
      context.fillStyle = muted;
      context.font = `500 10.5px ${face}`;
      context.fillText(`${lamp.resistance} Ω`, labelX, y + 13);
      context.textAlign = 'left';
    }

    /* ------------------------------------------------- nhãn điểm rẽ nút --- */
    if (topology === 'parallel') {
      const nodeX = 0.585 * width;
      context.fillStyle = ink;
      for (const nodeY of [FRAME.top * height, FRAME.bottom * height]) {
        context.beginPath();
        context.arc(nodeX, nodeY, 3.4, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = muted;
      context.font = `600 10px ${face}`;
      context.textAlign = 'center';
      context.fillText('nút', nodeX, FRAME.top * height - 12);
      context.textAlign = 'left';
    }

    /* --------------------------------------------------------- chú thích --- */
    context.strokeStyle = line;
    context.globalAlpha = 1;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(12, height - 20);
    context.lineTo(width - 12, height - 20);
    context.stroke();
    context.fillStyle = muted;
    context.font = `500 10px ${face}`;
    context.fillText(
      closed
        ? `Mật độ hạt không đổi · tốc độ hạt tỉ lệ với cường độ dòng điện`
        : `Công tắc hở — không có dòng điện trong mạch`,
      12,
      height - 7,
    );
  }, [solution, voltage, closed, topology]);

  useEffect(() => {
    let frame = 0;
    let paused = false;
    const start = performance.now();
    const step = (now: number) => {
      if (!paused) draw((now - start) / 1000);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const onVisibility = () => { paused = document.visibilityState === 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);
    const canvas = canvasRef.current;
    const observer = new ResizeObserver(() => draw(0));
    if (canvas) observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [draw]);

  const pair = solution.lamps.length === 2 ? solution.lamps : null;
  const brighter = pair
    ? pair[0].power > pair[1].power * 1.02
      ? pair[0]
      : pair[1].power > pair[0].power * 1.02
        ? pair[1]
        : null
    : null;

  return (
    <div className="sim circuit">
      <div className="sim-stage">
        <canvas ref={canvasRef} className="sim-canvas" role="img" aria-label="Sơ đồ mạch điện một chiều" />
      </div>

      <div className="sim-readout circuit-readout">
        <div><dt>Điện trở tương đương</dt><dd>{solution.totalResistance.toFixed(1)} Ω</dd></div>
        <div><dt>Dòng điện trong mạch</dt><dd>{solution.totalCurrent.toFixed(2)} A</dd></div>
        <div><dt>Công suất toàn mạch</dt><dd>{solution.totalPower.toFixed(1)} W</dd></div>
        <div><dt>Hiệu điện thế nguồn</dt><dd>{voltage.toFixed(1)} V</dd></div>
      </div>

      <div className="circuit-lamps">
        {solution.lamps.map((lamp) => (
          <div className="circuit-lamp" key={lamp.id}>
            <p className="circuit-lamp-head">
              <b>Đèn {lamp.id}</b>
              <span>{lamp.resistance} Ω</span>
            </p>
            <div className="circuit-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(lamp.glow * 100)}%` }} />
            </div>
            <dl className="circuit-lamp-facts">
              <div><dt>U</dt><dd>{lamp.voltage.toFixed(2)} V</dd></div>
              <div><dt>I</dt><dd>{lamp.current.toFixed(2)} A</dd></div>
              <div><dt>P</dt><dd>{lamp.power.toFixed(1)} W</dd></div>
            </dl>
          </div>
        ))}
        <p className="circuit-verdict" role="status">
          {!closed
            ? 'Công tắc hở: mạch không kín nên không có dòng điện. Điện trở tương đương vẫn tính được, nhưng không đèn nào sáng.'
            : !pair
              ? `Một điện trở duy nhất: I = U / R = ${voltage.toFixed(1)} / ${resistanceA} = ${solution.totalCurrent.toFixed(2)} A.`
              : !brighter
                ? 'Hai đèn có cùng công suất vì cùng điện trở. Đổi một trong hai điện trở để thấy khác biệt.'
                : topology === 'series'
                  ? `Nối tiếp — cùng dòng điện, nên P = I²R: đèn ${brighter.id} có điện trở lớn hơn nên sáng hơn.`
                  : `Song song — cùng hiệu điện thế, nên P = U²/R: đèn ${brighter.id} có điện trở nhỏ hơn nên sáng hơn.`}
        </p>
      </div>

      <div className="sim-controls">
        <div className="sim-presets" role="group" aria-label="Cách nối mạch">
          <span>Cách nối</span>
          {TOPOLOGIES.map((entry) => (
            <button
              type="button"
              key={entry.id}
              title={entry.hint}
              className={topology === entry.id ? 'is-active' : ''}
              aria-pressed={topology === entry.id}
              onClick={() => setTopology(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <label className="sim-slider">
          <span>Hiệu điện thế nguồn</span><b>{voltage.toFixed(1)} V</b>
          <input type="range" min={1.5} max={12} step={0.5} value={voltage}
            onChange={(event) => setVoltage(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Điện trở đèn A</span><b>{resistanceA} Ω</b>
          <input type="range" min={2} max={40} step={1} value={resistanceA}
            onChange={(event) => setResistanceA(Number(event.target.value))} />
        </label>
        <label className="sim-slider">
          <span>Điện trở đèn B</span><b>{topology === 'single' ? '—' : `${resistanceB} Ω`}</b>
          <input type="range" min={2} max={40} step={1} value={resistanceB}
            disabled={topology === 'single'}
            onChange={(event) => setResistanceB(Number(event.target.value))} />
        </label>

        <button
          type="button"
          className={`sim-fire circuit-switch${closed ? '' : ' is-open'}`}
          aria-pressed={closed}
          onClick={() => setClosed((value) => !value)}
        >
          {closed ? 'Mở công tắc' : 'Đóng công tắc'}
        </button>
      </div>
    </div>
  );
}
