'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pixelRatioCap } from '../../../lib/three/deviceTier';

/**
 * Mặt cắt Trái Đất — năm lớp, bán kính thật.
 *
 * Quả địa cầu bên cạnh trả lời câu hỏi "ở đâu"; phần này trả lời câu hỏi "bên
 * dưới là gì". Mọi con số ở đây là số đo địa vật lý thật (mô hình PREM), không
 * phải số làm tròn cho đẹp hình: nhân trong dừng ở bán kính 1 221 km, ranh giới
 * nhân–manti ở 2 891 km sâu, và lớp vỏ dày 35 km.
 *
 * Chính vì dùng số thật mà nút "Đúng tỉ lệ" trở thành bài học chứ không phải một
 * lựa chọn hiển thị. Lớp vỏ chiếm 0,55% bán kính Trái Đất; vẽ đúng tỉ lệ thì nó
 * là một sợi tóc, mảnh hơn cả đường viền của hình. Mọi hình vẽ trong sách giáo
 * khoa đều phóng lớp vỏ lên hàng chục lần, và hầu như không hình nào nói ra điều
 * đó — nên học sinh rời lớp với ấn tượng lớp vỏ dày bằng một phần mười bán kính.
 * Hai chế độ cạnh nhau, đổi được bằng một lần bấm, là cách sửa ấn tượng đó.
 *
 * Con trỏ trên mặt cắt đọc ra độ sâu tại điểm đang trỏ, nên hình không chỉ được
 * xem mà còn đo được.
 */

type Layer = {
  id: string;
  name: string;
  /** Tên quốc tế, để học sinh tra được tài liệu tiếng Anh. */
  latin: string;
  /** Độ sâu tính từ mặt đất, km. */
  depthFrom: number;
  depthTo: number;
  state: string;
  temperature: string;
  composition: string;
  /** Điều đáng nói nhất về lớp này. */
  note: string;
  /** Hai màu của dải tô, ngoài → trong. */
  ink: [string, string];
};

const EARTH_RADIUS = 6371;

/**
 * Năm lớp.
 *
 * Manti được tách thành trên và dưới ở mốc 660 km vì đó là một ranh giới thật —
 * chỗ olivine đổi sang cấu trúc tinh thể đặc hơn — và vì ranh giới đó là nơi
 * phần lớn động đất sâu dừng lại.
 */
const LAYERS: Layer[] = [
  {
    id: 'crust',
    name: 'Lớp vỏ',
    latin: 'Crust',
    depthFrom: 0,
    depthTo: 35,
    state: 'Rắn, giòn',
    temperature: '0 – 800 °C',
    composition: 'Đá silicat: granit ở lục địa, bazan ở đáy đại dương',
    note:
      'Toàn bộ đời sống, đại dương và mọi thứ con người từng đào tới đều nằm trong lớp này. Hố khoan sâu nhất — Kola, 12,3 km — vẫn chưa xuyên qua một phần ba lớp vỏ lục địa.',
    ink: ['#c98d5f', '#a97046'],
  },
  {
    id: 'upper-mantle',
    name: 'Manti trên',
    latin: 'Upper mantle',
    depthFrom: 35,
    depthTo: 660,
    state: 'Rắn nhưng chảy dẻo rất chậm',
    temperature: '800 – 1 900 °C',
    composition: 'Peridotit — chủ yếu olivin và pyroxen',
    note:
      'Lớp này rắn: sóng địa chấn ngang truyền qua được. Nhưng ở thang thời gian triệu năm nó chảy như nhựa đường, và chính dòng chảy đó đẩy các mảng kiến tạo trên mặt.',
    ink: ['#d9a05f', '#c07f3e'],
  },
  {
    id: 'lower-mantle',
    name: 'Manti dưới',
    latin: 'Lower mantle',
    depthFrom: 660,
    depthTo: 2891,
    state: 'Rắn, rất đặc',
    temperature: '1 900 – 3 700 °C',
    composition: 'Bridgmanit — silicat magie–sắt dưới áp suất cực lớn',
    note:
      'Chiếm hơn một nửa thể tích Trái Đất. Ở đây áp suất lớn đến mức khoáng vật bị nén sang cấu trúc tinh thể khác hẳn, dù thành phần hoá học không đổi nhiều so với manti trên.',
    ink: ['#e2803f', '#c65f2b'],
  },
  {
    id: 'outer-core',
    name: 'Nhân ngoài',
    latin: 'Outer core',
    depthFrom: 2891,
    depthTo: 5150,
    state: 'Lỏng',
    temperature: '4 000 – 5 000 °C',
    composition: 'Sắt và niken nóng chảy, lẫn nguyên tố nhẹ',
    note:
      'Sắt lỏng dẫn điện, và dòng đối lưu trong lớp này tạo ra từ trường Trái Đất — thứ chắn phần lớn hạt tích điện từ Mặt Trời. Không có nhân ngoài lỏng thì không có kim la bàn và có lẽ không có khí quyển như hiện nay.',
    ink: ['#f2a83f', '#e07d20'],
  },
  {
    id: 'inner-core',
    name: 'Nhân trong',
    latin: 'Inner core',
    depthFrom: 5150,
    depthTo: EARTH_RADIUS,
    state: 'Rắn',
    temperature: '≈ 5 400 °C',
    composition: 'Hợp kim sắt – niken kết tinh',
    note:
      'Nóng ngang bề mặt Mặt Trời mà vẫn rắn, vì áp suất ở đây gấp hơn ba triệu lần áp suất khí quyển. Nhiệt độ quyết định vật chất muốn chảy; áp suất quyết định nó có được phép chảy hay không.',
    ink: ['#ffd166', '#f5a623'],
  },
];

type ScaleMode = 'true' | 'eased';

/**
 * Bán kính màn hình của một bán kính thật, theo chế độ tỉ lệ.
 *
 * `true` là phép chia thẳng. `eased` chia khung hình theo tỉ lệ đã đặt tay cho
 * từng lớp, để lớp vỏ 35 km vẫn còn nhìn thấy được — vẫn tăng đơn điệu theo độ
 * sâu, nên thứ tự các lớp và vị trí con trỏ không bao giờ sai, chỉ độ dày là
 * phóng lên.
 */
const EASED_SHARE = [0.055, 0.185, 0.36, 0.26, 0.14];

function makeRadiusMap(mode: ScaleMode) {
  if (mode === 'true') {
    return (radiusKm: number) => radiusKm / EARTH_RADIUS;
  }
  // Từ tâm ra ngoài: nhân trong → vỏ. Cộng dồn phần khung của từng lớp.
  const stops: { radius: number; unit: number }[] = [{ radius: 0, unit: 0 }];
  let unit = 0;
  for (let index = LAYERS.length - 1; index >= 0; index -= 1) {
    unit += EASED_SHARE[index];
    stops.push({ radius: EARTH_RADIUS - LAYERS[index].depthFrom, unit });
  }
  return (radiusKm: number) => {
    for (let index = 1; index < stops.length; index += 1) {
      if (radiusKm <= stops[index].radius) {
        const previous = stops[index - 1];
        const span = stops[index].radius - previous.radius;
        const ratio = span > 0 ? (radiusKm - previous.radius) / span : 0;
        return previous.unit + (stops[index].unit - previous.unit) * ratio;
      }
    }
    return 1;
  };
}

/** Nghịch đảo của phép trên, để con trỏ đọc ra độ sâu. */
function makeDepthFromUnit(mode: ScaleMode) {
  const map = makeRadiusMap(mode);
  return (unit: number) => {
    if (unit >= 1) return 0;
    if (unit <= 0) return EARTH_RADIUS;
    // Tìm nhị phân trên hàm đơn điệu; 24 vòng cho sai số dưới một km.
    let low = 0;
    let high = EARTH_RADIUS;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (map(mid) < unit) low = mid;
      else high = mid;
    }
    return EARTH_RADIUS - (low + high) / 2;
  };
}

function layerAtDepth(depth: number) {
  return LAYERS.find((layer) => depth >= layer.depthFrom && depth <= layer.depthTo) ?? LAYERS[0];
}

function formatKm(value: number) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}

export function EarthLayers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ScaleMode>('eased');
  const [selectedId, setSelectedId] = useState(LAYERS[0].id);
  /** Độ sâu dưới con trỏ, km — null khi con trỏ ra ngoài mặt cắt. */
  const [probe, setProbe] = useState<number | null>(null);

  const selected = useMemo(
    () => LAYERS.find((layer) => layer.id === selectedId) ?? LAYERS[0],
    [selectedId],
  );
  const radiusMap = useMemo(() => makeRadiusMap(mode), [mode]);
  const depthFromUnit = useMemo(() => makeDepthFromUnit(mode), [mode]);

  // Vòng vẽ đọc lựa chọn và con trỏ qua ref, để một lần bấm nhãn không phải
  // dựng lại toàn bộ callback vẽ.
  const selectedRef = useRef(selectedId);
  const probeRef = useRef<number | null>(null);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { probeRef.current = probe; }, [probe]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = pixelRatioCap('panel');
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
    const muted = style.getPropertyValue('--sim-muted').trim() || '#706a73';
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

    /* Bố cục: đĩa mặt cắt bên trái, cột nhãn bên phải. Nhãn cần khoảng 132 px,
       nên bán kính đĩa lấy theo phần còn lại — không bao giờ để nhãn tràn ra
       ngoài canvas dù panel hẹp đến đâu. */
    const labelWidth = width > 420 ? 132 : 0;
    const padding = 18;
    const discSpace = width - labelWidth - padding * 2;
    const radius = Math.max(48, Math.min(discSpace / 2, (height - padding * 2) / 2));
    const cx = padding + radius;
    const cy = height / 2;

    /* Bóng đổ mềm dưới đĩa: đủ để mặt cắt nằm trên nền ivory chứ không dán lên
       nó, và đúng một lần vẽ. */
    const shadow = context.createRadialGradient(cx, cy + radius * 0.92, radius * 0.1, cx, cy + radius * 0.92, radius * 0.95);
    shadow.addColorStop(0, 'rgba(120, 84, 56, 0.16)');
    shadow.addColorStop(1, 'rgba(120, 84, 56, 0)');
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(cx, cy + radius * 0.94, radius * 0.9, radius * 0.16, 0, 0, Math.PI * 2);
    context.fill();

    const selectedLayer = selectedRef.current;

    /* Từ ngoài vào trong: mỗi lớp là một đĩa đầy phủ lên lớp ngoài, nên không
       cần vẽ hình vành khuyên và không có đường ghép giữa hai lớp. */
    for (const layer of LAYERS) {
      const outer = radiusMap(EARTH_RADIUS - layer.depthFrom) * radius;
      const isSelected = layer.id === selectedLayer;
      const gradient = context.createLinearGradient(cx - outer, cy - outer, cx + outer * 0.6, cy + outer);
      gradient.addColorStop(0, layer.ink[0]);
      gradient.addColorStop(1, layer.ink[1]);
      context.fillStyle = gradient;
      context.globalAlpha = isSelected ? 1 : 0.82;
      context.beginPath();
      context.arc(cx, cy, Math.max(outer, 0.6), 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;

      // Ranh giới. Lớp đang chọn được viền đậm — ở chế độ đúng tỉ lệ, viền này
      // là gần như toàn bộ những gì thấy được của lớp vỏ, và đó là điều đúng.
      context.strokeStyle = isSelected ? ink : 'rgba(60, 36, 20, 0.28)';
      context.lineWidth = isSelected ? 2.2 : 0.9;
      context.beginPath();
      context.arc(cx, cy, Math.max(outer, 0.6), 0, Math.PI * 2);
      context.stroke();
    }

    /* Ánh sáng chếch trên trái, để đĩa đọc ra là một khối cầu bị cắt. */
    const sheen = context.createRadialGradient(
      cx - radius * 0.42, cy - radius * 0.46, radius * 0.05,
      cx - radius * 0.42, cy - radius * 0.46, radius * 1.5,
    );
    sheen.addColorStop(0, 'rgba(255, 252, 245, 0.34)');
    sheen.addColorStop(0.45, 'rgba(255, 250, 240, 0.06)');
    sheen.addColorStop(1, 'rgba(60, 30, 10, 0.14)');
    context.save();
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = sheen;
    context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    context.restore();

    /* Thanh độ sâu: một bán kính nằm ngang sang phải, có vạch tại mỗi ranh
       giới. Đây là chỗ hai chế độ tỉ lệ hiện rõ nhất — cùng dãy số, khoảng cách
       giữa các vạch khác hẳn nhau. */
    if (labelWidth > 0) {
      context.font = `500 10px ${face}`;
      context.textBaseline = 'middle';
      const railX = cx + radius + 16;
      context.strokeStyle = 'rgba(117, 91, 70, 0.32)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(railX, cy - radius);
      context.lineTo(railX, cy + radius);
      context.stroke();

      // Nhãn xếp từ trên xuống, không bao giờ gần nhau dưới 13 px: ở chế độ đúng
      // tỉ lệ, "0" và "35" cách nhau đúng một phần nghìn bán kính.
      let lastY = -Infinity;
      const marks = [0, ...LAYERS.map((layer) => layer.depthTo)];
      for (const depth of marks) {
        const unit = radiusMap(EARTH_RADIUS - depth);
        const y = cy - unit * radius;
        if (y - lastY < 13 && depth !== EARTH_RADIUS) continue;
        lastY = y;
        context.strokeStyle = 'rgba(117, 91, 70, 0.4)';
        context.beginPath();
        context.moveTo(railX - 4, y);
        context.lineTo(railX + 4, y);
        context.stroke();
        context.fillStyle = muted;
        context.fillText(`${formatKm(depth)} km`, railX + 9, y);
      }
      context.textBaseline = 'alphabetic';
    }

    /* Con trỏ: một vòng tròn tại độ sâu đang trỏ, để hình đo được. */
    const probeDepth = probeRef.current;
    if (probeDepth !== null) {
      const unit = radiusMap(EARTH_RADIUS - probeDepth);
      const probeRadius = unit * radius;
      context.strokeStyle = 'rgba(25, 23, 32, 0.62)';
      context.setLineDash([3, 3]);
      context.lineWidth = 1.1;
      context.beginPath();
      context.arc(cx, cy, Math.max(probeRadius, 0.6), 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
  }, [radiusMap]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    const observer = new ResizeObserver(() => draw());
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  // Vẽ lại khi lựa chọn hoặc con trỏ đổi. Không có vòng lặp animation: hình này
  // tĩnh, và một requestAnimationFrame chạy suốt để vẽ lại cùng một đĩa là phí.
  useEffect(() => { draw(); }, [draw, selectedId, probe]);

  /** Đổi toạ độ con trỏ thành độ sâu, dùng cùng phép ánh xạ mà hàm vẽ dùng. */
  const geometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const labelWidth = width > 420 ? 132 : 0;
    const padding = 18;
    const radius = Math.max(48, Math.min((width - labelWidth - padding * 2) / 2, (height - padding * 2) / 2));
    return { cx: padding + radius, cy: height / 2, radius };
  }, []);

  const onPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const box = geometry();
    if (!canvas || !box) return;
    const rect = canvas.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - rect.left - box.cx, event.clientY - rect.top - box.cy);
    if (distance > box.radius + 4) {
      setProbe(null);
      return;
    }
    setProbe(Math.round(depthFromUnit(Math.min(distance / box.radius, 1))));
  };

  const probeLayer = probe === null ? null : layerAtDepth(probe);

  return (
    <div className="earth">
      <div className="earth-stage">
        <canvas
          ref={canvasRef}
          className="earth-canvas"
          role="img"
          aria-label="Mặt cắt Trái Đất với năm lớp, từ vỏ đến nhân trong"
          onPointerMove={onPointer}
          onPointerLeave={() => setProbe(null)}
          onPointerDown={(event) => {
            onPointer(event);
            const box = geometry();
            const canvas = canvasRef.current;
            if (!box || !canvas) return;
            const rect = canvas.getBoundingClientRect();
            const distance = Math.hypot(event.clientX - rect.left - box.cx, event.clientY - rect.top - box.cy);
            if (distance > box.radius + 4) return;
            setSelectedId(layerAtDepth(depthFromUnit(Math.min(distance / box.radius, 1))).id);
          }}
        />
        <div className="earth-probe" role="status">
          {probe === null
            ? 'Đưa con trỏ vào mặt cắt để đọc độ sâu'
            : <><b>{formatKm(probe)} km</b><span>{probeLayer?.name}</span></>}
        </div>
        <div className="earth-scale" role="group" aria-label="Tỉ lệ hiển thị">
          {([
            { id: 'eased', label: 'Phóng lớp ngoài' },
            { id: 'true', label: 'Đúng tỉ lệ' },
          ] as const).map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={mode === entry.id ? 'is-active' : ''}
              aria-pressed={mode === entry.id}
              onClick={() => setMode(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <aside className="earth-side">
        <ul className="earth-list">
          {LAYERS.map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                className={`earth-row${layer.id === selected.id ? ' is-active' : ''}`}
                aria-current={layer.id === selected.id || undefined}
                onClick={() => setSelectedId(layer.id)}
              >
                <i style={{ background: `linear-gradient(140deg, ${layer.ink[0]}, ${layer.ink[1]})` }} aria-hidden="true" />
                <b>{layer.name}</b>
                <small>{formatKm(layer.depthTo - layer.depthFrom)} km</small>
              </button>
            </li>
          ))}
        </ul>

        <div className="earth-detail">
          <p className="earth-detail-kind">{selected.latin}</p>
          <h4>{selected.name}</h4>
          <dl className="earth-facts">
            <div>
              <dt>Độ sâu</dt>
              <dd>{formatKm(selected.depthFrom)} – {formatKm(selected.depthTo)} km</dd>
            </div>
            <div><dt>Trạng thái</dt><dd>{selected.state}</dd></div>
            <div><dt>Nhiệt độ</dt><dd>{selected.temperature}</dd></div>
            <div><dt>Thành phần</dt><dd>{selected.composition}</dd></div>
          </dl>
          <p className="earth-note">{selected.note}</p>
        </div>

        <p className="earth-foot">
          {mode === 'true'
            ? 'Đang vẽ đúng tỉ lệ: lớp vỏ chỉ chiếm 0,55% bán kính nên gần như không thấy được.'
            : 'Lớp vỏ và manti trên đang được phóng lên để nhìn thấy. Bấm “Đúng tỉ lệ” để xem độ dày thật.'}
        </p>
      </aside>
    </div>
  );
}
