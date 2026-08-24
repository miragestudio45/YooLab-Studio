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
        framing: { yaw: 0.85, pitch: 0.52, fill: 0.92, roll: 0.62 },
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
        framing: { yaw: 1.1, pitch: 0.42, fill: 0.9, roll: 0.58 },
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
        framing: { yaw: 0.7, pitch: 0.34, fill: 0.82 },
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
        framing: { yaw: 0.95, pitch: 0.46, fill: 0.92 },
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
        framing: { yaw: 1.15, pitch: 0.4, fill: 0.92, roll: 0.3 },
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
        framing: { yaw: 0.6, pitch: 0.62, fill: 0.94 },
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
        framing: { yaw: 1.15, pitch: 0.42, fill: 0.92, roll: 0.45 },
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
        framing: { yaw: 0.8, pitch: 0.3, fill: 0.86 },
        use: 'Sơn phủ chi tiết sau khi đã lắp và làm sạch bavia.',
        note:
          'Sơn hai lớp mỏng cho màu đều hơn một lớp dày. Lớp dày chảy xuống các cạnh và làm mất chi tiết nổi trên bề mặt.',
        care: 'Đóng nắp ngay sau khi dùng; sơn khô trong hũ không pha lại được.',
      },
    ],
  },
];

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
