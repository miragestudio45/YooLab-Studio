'use client';

import { useMemo, useState } from 'react';
import { ModelStage } from '../ModelStage';
import type { ModelFraming, ModelPreset } from '../../../lib/library/types';

/**
 * Bàn dụng cụ — tám mô hình thật, không phải một ảnh chụp bàn làm việc.
 *
 * Trước đây môn STEM chỉ có một mục dụng cụ, mở ra đúng một cái tua vít, trong
 * khi tám tệp GLB đã nằm sẵn trong `public/asset/Library/Car`. Đó là kiểu thiếu
 * sót tệ nhất: nội dung có thật nhưng bảy phần tám bị chôn.
 *
 * Component này chỉ làm hai việc — chọn dụng cụ và mô tả nó — còn phần dựng hình
 * dùng lại `ModelStage`, cùng phòng dựng ivory, cùng bộ đèn, cùng cách khung
 * hình như mọi mẫu vật khác của Thư viện. Đổi dụng cụ là đổi `key`, nên mỗi lần
 * chọn là một cảnh mới sạch sẽ chứ không phải một cảnh cũ được vá lại.
 *
 * Ba nhóm chứ không phải một danh sách tám dòng: đo–vẽ, cắt–tách, lắp–hoàn
 * thiện. Thứ tự đó là thứ tự thao tác thật khi lắp một bộ mô hình, nên bản thân
 * cái danh sách đã dạy được quy trình.
 */

type Tool = {
  id: string;
  name: string;
  /** Tên gọi khác hoặc tên tiếng Anh trên hộp dụng cụ. */
  alias: string;
  url: string;
  /*
   * What the tool is made of. Every one of the eight GLBs carries the same
   * untextured 0.8 grey, so without this the bench renders eight identical
   * white objects and the only thing distinguishing a pair of scissors from an
   * eraser is its outline.
   */
  preset: ModelPreset;
  framing: ModelFraming;
  /** Một dòng: dụng cụ này dùng để làm gì. */
  use: string;
  /** Đoạn ngắn cho bảng bên phải. */
  note: string;
  /** Lưu ý an toàn hoặc kỹ thuật, nếu có. */
  care?: string;
};

type Group = { id: string; label: string; hint: string; tools: Tool[] };

const GROUPS: Group[] = [
  {
    id: 'do-ve',
    label: 'Đo và vẽ',
    hint: 'Bước đầu: xác định kích thước và đánh dấu',
    tools: [
      {
        id: 'ruler',
        name: 'Thước kẻ',
        alias: 'Ruler',
        url: '/asset/Library/Car/ruler.glb',
        preset: 'plastic',
        // A metre of straight edge is the least interesting silhouette in the
        // set seen end-on, so it is turned onto a diagonal across the frame.
        framing: { yaw: 0.85, pitch: 0.44, fill: 0.84, orient: [0, 0, Math.PI / 2] as [number, number, number] },
        use: 'Đo chiều dài và kẻ đường thẳng khi đánh dấu chi tiết.',
        note:
          'Đặt vạch 0 trùng mép cần đo, không đặt mép thước — mép thước thường dày hơn vạch 0 nên đo từ mép luôn dài hơn thực tế.',
      },
      {
        id: 'pencil',
        name: 'Bút chì',
        alias: 'Pencil',
        url: '/asset/Library/Car/pencil.glb',
        preset: 'natural',
        framing: { yaw: 0.42, pitch: 0.34, fill: 0.8, orient: [0, 0, Math.PI / 2] as [number, number, number] },
        use: 'Đánh dấu vị trí cắt, khoan và dán trước khi thao tác.',
        note:
          'Dấu bút chì xoá được nên mọi phép đo đều đánh bằng bút chì trước. Nét càng mảnh thì sai số khi cắt theo dấu càng nhỏ.',
      },
      {
        id: 'eraser',
        name: 'Gôm',
        alias: 'Eraser',
        url: '/asset/Library/Car/eraser.glb',
        preset: 'rubber',
        framing: { yaw: 0.62, pitch: 0.32, fill: 0.76 },
        use: 'Xoá dấu bút chì sau khi đã cắt hoặc lắp xong.',
        note:
          'Dụng cụ hoàn thiện, không phải dụng cụ sửa sai: dấu bút chì còn lại trên chi tiết sẽ hiện rõ dưới lớp sơn.',
      },
    ],
  },
  {
    id: 'cat-tach',
    label: 'Cắt và tách',
    hint: 'Tách chi tiết khỏi khung nhựa',
    tools: [
      {
        id: 'scissor',
        name: 'Kéo',
        alias: 'Scissors',
        url: '/asset/Library/Car/scissor.glb',
        preset: 'steel',
        framing: { yaw: 0.95, pitch: 0.38, fill: 0.84, orient: [0, 0, Math.PI / 2] as [number, number, number] },
        use: 'Cắt giấy, decal và các chi tiết mỏng.',
        note:
          'Cắt bằng phần gần trục kéo cho lực lớn nhất; phần mũi chỉ dùng để tỉa những đoạn ngắn cần chính xác.',
        care: 'Luôn cắt hướng ra xa bàn tay giữ.',
      },
      {
        id: 'boxCutter',
        name: 'Dao rọc giấy',
        alias: 'Box cutter',
        url: '/asset/Library/Car/boxCutter.glb',
        preset: 'steel',
        framing: { yaw: 0.45, pitch: 0.38, fill: 0.8 },
        use: 'Rọc mép chi tiết nhựa và gọt phần bavia còn sót.',
        note:
          'Rọc nhiều lượt nhẹ thay vì một lượt mạnh. Một lượt mạnh làm nhựa nứt theo thớ, và vết nứt đó không sửa được.',
        care: 'Rút lưỡi vào thân dao ngay khi rời tay.',
      },
      {
        id: 'cuttingMatt',
        name: 'Thảm cắt',
        alias: 'Cutting mat',
        url: '/asset/Library/Car/cuttingMatt.glb',
        preset: 'rubber',
        framing: { yaw: 0.6, pitch: 0.44, fill: 0.82 },
        use: 'Mặt nền tự liền vết, bảo vệ bàn và giữ lưỡi dao bền.',
        note:
          'Lớp giữa của thảm mềm hơn hai mặt ngoài nên vết dao khép lại sau mỗi lần cắt. Cắt trực tiếp trên mặt bàn cứng sẽ làm lưỡi dao cùn rất nhanh.',
      },
    ],
  },
  {
    id: 'lap-hoan-thien',
    label: 'Lắp và hoàn thiện',
    hint: 'Ghép chi tiết và sơn phủ',
    tools: [
      {
        id: 'screwdriver',
        name: 'Tua vít',
        alias: 'Screwdriver',
        url: '/asset/Library/Car/screwdriver.glb',
        preset: 'steel',
        framing: { yaw: 0.48, pitch: 0.34, fill: 0.8, orient: [0, 0, Math.PI / 2] as [number, number, number] },
        use: 'Siết và tháo vít khi ghép các khối của mô hình.',
        note:
          'Đầu vít phải khớp đúng rãnh. Đầu nhỏ hơn rãnh sẽ trượt và làm tròn rãnh vít — sau đó không còn dụng cụ nào tháo được con vít đó.',
      },
      {
        id: 'paintJar',
        name: 'Hũ sơn',
        alias: 'Paint jar',
        url: '/asset/Library/Car/paintJar.glb',
        preset: 'plastic',
        framing: { yaw: 0.8, pitch: 0.22, fill: 0.76 },
        use: 'Sơn phủ chi tiết sau khi đã lắp và làm sạch bavia.',
        note:
          'Sơn hai lớp mỏng cho màu đều hơn một lớp dày. Lớp dày chảy xuống các cạnh và làm mất chi tiết nổi trên bề mặt.',
        care: 'Đóng nắp ngay sau khi dùng; sơn khô trong hũ không pha lại được.',
      },
    ],
  },
];

/*
 * Why this bench is framed like the rest of the Library, and no longer like a
 * product shoot.
 *
 * These eight were authored on their own camera rules and were the only place in
 * the Library that used them. Two numbers say it:
 *
 *   - **`roll`.** Every other specimen in the manifest either omits it or, in the
 *     jellyfish's one case, nudges it by `-0.05` — under three degrees. Four
 *     tools here were carrying 0.3 to 0.62, which is seventeen to **thirty-five**
 *     degrees of frame tilt. That is not a nudge, it is a different house style,
 *     and switching to this bench after a heart or a T-rex read as the viewer
 *     itself going crooked.
 *   - **`pitch`.** The rest of the Library lives between 0.10 and 0.30 and
 *     clusters at 0.14–0.20. This bench ran 0.30 to 0.62 — looking steeply down
 *     at the tools rather than across at them, which on a long tool compounds
 *     the tilt instead of cancelling it.
 *
 * `roll` is gone entirely. `pitch` is a different matter and deliberately does
 * *not* all come down to the Library's usual band, because once the tools are
 * laid flat they are being read the way you read something on a bench — from
 * above. A specimen with volume can be met side-on at 0.16; a ruler lying on the
 * grid at that angle is a two-pixel sliver, and the cutting mat had already been
 * carrying 0.62 for exactly this reason. So the flat-lying tools sit around
 * 0.34–0.44 and the standing ones (the paint jar, the eraser) stay near 0.22.
 * That is elevation, which the room shares; it is not frame tilt, which the room
 * does not.
 *
 * The rotation is about **Z**, not X, and that is not arbitrary. The ruler
 * measures 0.004 x 0.300 x 0.030: its long axis is Y but its *thin* axis is X,
 * so tipping it about X only stands it on its edge — a 30 cm blade seen end-on,
 * which is barely better than the column it started as. Turning about Z sends
 * the thin axis to vertical and lays the tool flat on the grid, which is where a
 * ruler and a pair of scissors actually sit. The same turn suits the pencil and
 * the screwdriver, whose cross-sections are square.
 *
 *
 * `yaw` moved as well, for every tool whose long axis ends up along X. A yaw
 * near 1.15 puts the camera almost *down that axis*: the pencil came back as a
 * stubby cylinder with its point hidden behind itself, the screwdriver as a
 * handle aimed at the viewer, and the box cutter as an anonymous lump with its
 * blade edge-on. Those three sit near 0.45 now, the three-quarter view that
 * shows a long tool end to end. The ruler and the scissors keep a wider yaw
 * because both are broad enough to survive it.
 *
 * Note the box cutter needs no `orient` — it was authored lying along X already,
 * at 0.150 x 0.008 x 0.041. It was only ever the camera that was wrong, which is
 * why it looked broken in the same way as the tools that *were* standing up.
 * `fill` also came down, from the 0.86–0.94 these were authored at. That is the
 * right instinct for a compact subject and the wrong one here, because `fill`
 * fits the *projected bounding box*: six of the eight tools are long and thin,
 * so a box filling 92% of the frame put the tool itself corner to corner,
 * longer than the panel is tall. A ruler that spans the whole viewer stops
 * reading as a ruler — there is no room left around it to give it a size.
 */
const ALL_TOOLS = GROUPS.flatMap((group) => group.tools);

export function ToolkitBench({ params }: { params?: Record<string, string> }) {
  const [activeId, setActiveId] = useState(params?.tool ?? ALL_TOOLS[0].id);
  const active = useMemo(
    () => ALL_TOOLS.find((tool) => tool.id === activeId) ?? ALL_TOOLS[0],
    [activeId],
  );
  const group = GROUPS.find((entry) => entry.tools.some((tool) => tool.id === active.id));

  return (
    <div className="toolkit">
      <div className="toolkit-stage">
        {/*
          `key` on the id, not on the url: switching tool must build a new stage
          rather than swap a url inside a live one. The stage owns a WebGL
          context and a loader, and re-keying is the only way to guarantee both
          are torn down in order.
        */}
        <ModelStage
          key={active.id}
          url={active.url}
          preset={active.preset}
          framing={active.framing}
          label={`Mô hình 3D ${active.name}`}
        />
      </div>

      <aside className="toolkit-side">
        <div className="toolkit-list">
          {GROUPS.map((entry) => (
            <div className="toolkit-group" key={entry.id}>
              <p className="toolkit-group-head">
                <b>{entry.label}</b>
                <span>{entry.hint}</span>
              </p>
              <div className="toolkit-chips" role="group" aria-label={entry.label}>
                {entry.tools.map((tool) => (
                  <button
                    type="button"
                    key={tool.id}
                    className={`toolkit-chip${tool.id === active.id ? ' is-active' : ''}`}
                    aria-pressed={tool.id === active.id}
                    onClick={() => setActiveId(tool.id)}
                  >
                    {tool.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="toolkit-info">
          <p className="toolkit-info-kind">{group?.label}</p>
          <h4>
            {active.name} <em>{active.alias}</em>
          </h4>
          <p className="toolkit-info-use">{active.use}</p>
          <p className="toolkit-info-note">{active.note}</p>
          {active.care && (
            <p className="toolkit-info-care">
              <span aria-hidden="true">!</span>
              {active.care}
            </p>
          )}
        </div>

        <p className="toolkit-foot">
          <b>{ALL_TOOLS.length}</b> mô hình riêng biệt · dùng lại được cho mọi bài thực hành cần dụng cụ cầm tay.
        </p>
      </aside>
    </div>
  );
}
