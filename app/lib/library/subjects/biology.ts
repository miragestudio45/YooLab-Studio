import { CELLS, type CellContent, type CellId } from '../../biology/cells';
import type { ExperienceManifest, MarkId } from '../types';

/**
 * Sinh học — môn sâu nhất của Thư viện, và là môn phải gánh lời khẳng định rằng
 * YooLab có học liệu thật.
 *
 * Ba con vật có hệ quang học riêng (ong, cá, sứa) chạy qua *đúng* bộ dựng hình
 * mà hero dùng, một mesh khoa học thuộc phạm vi công cộng đã xác minh giấy phép,
 * và sáu loại tế bào dựng bằng hình học thủ tục. Tế bào dựng bằng hình học là
 * chủ ý, không phải vì thiếu mesh: hai bản quét của NIH có thể dùng cho tế bào
 * động vật và neuron đều mang giấy phép CC BY-NC-SA, mà NonCommercial thì không
 * được xuất hiện trên một sản phẩm. Hình học YooLab tự viết không có vấn đề đó,
 * và với một mô hình dạy học — nơi cái cần là từng bào quan tách rời và gọi tên
 * được — primitive rời còn hơn một bản quét liền khối.
 *
 * Sáu mục tế bào không được viết tay ở đây. Chúng sinh ra từ `lib/biology/cells.ts`,
 * cùng nguồn mà `CellStudio` dựng hình từ đó, nên tên bào quan trong bảng kiến
 * thức và nhãn trên mô hình không thể lệch nhau. Sửa nội dung sinh học là sửa
 * một file dữ liệu, không phải sửa hai chỗ và hy vọng chúng khớp.
 */

/** Hình vẽ trên hàng của rail, một hình riêng cho từng loại tế bào. */
const CELL_MARK: Record<CellId, MarkId> = {
  animal: 'cell',
  plant: 'cell-plant',
  'white-blood': 'cell-blood',
  epithelial: 'cell-epithelial',
  muscle: 'cell-muscle',
  neuron: 'neuron',
};

/** Từ khoá tìm kiếm, không dấu, để truy vấn tiếng Việt khớp được. */
const CELL_KEYWORDS: Record<CellId, string> = {
  animal: 'te bao dong vat nhan thuc bao quan nhan ti the luoi noi chat golgi ribosome',
  plant: 'te bao thuc vat thanh xenlulozo khong bao luc lap quang hop cay',
  'white-blood': 'bach cau trung tinh mien dich thuc bao lysosome hat vi khuan mau',
  epithelial: 'te bao bieu mo tru don ruot non vi nhung mao lien ket chat da',
  muscle: 'te bao co soi co van to co van ngang nhieu nhan sarcolemma',
  neuron: 'te bao than kinh neuron soi truc axon myelin dendrite xinap',
};

/** Chủ đề trong môn, dùng cho chip trên thanh viewer. */
const CELL_TOPIC = 'Tế bào';

/**
 * Một mục Thư viện từ một loại tế bào.
 *
 * `summary` là "gặp ở đâu" và `description` là "khác gì loại quen hơn", vì đó là
 * hai câu hỏi đầu tiên một học sinh hỏi khi thấy một loại tế bào mới — và cả hai
 * đều đã có sẵn trong dữ liệu sinh học.
 */
function cellEntry(cell: CellContent): ExperienceManifest {
  return {
    id: `cell-${cell.id}`,
    title: cell.name,
    subtitle: cell.subtitle,
    subject: 'sinh-hoc',
    topic: CELL_TOPIC,
    kind: 'model-3d',
    status: 'ready',
    summary: cell.where,
    description: `${cell.comparison} Mô hình có ${cell.organelles.length} bào quan chọn được — nhấp vào một bào quan để đọc số đo, bật “Tách bào quan” để đưa nó ra khỏi tế bào.`,
    view: { type: 'experience', key: 'cell-studio', params: { cell: cell.id } },
    rail: { kind: 'mark', mark: CELL_MARK[cell.id] },
    parts: cell.organelles.map((organelle) => ({ label: organelle.name, body: organelle.role })),
    goals: cell.goals,
    facts: cell.facts,
    notes: [cell.highlight],
    keywords: CELL_KEYWORDS[cell.id],
  };
}

export const BIOLOGY_EXPERIENCES: ExperienceManifest[] = [
  {
    id: 'bee',
    title: 'Ong mật',
    subtitle: 'Apis mellifera',
    subject: 'sinh-hoc',
    topic: 'Giải phẫu côn trùng',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Ba phần cơ thể và ba trạng thái chuyển động.',
    description:
      'Mô hình có xương đầy đủ nên chuyển được giữa đứng yên, bay tại chỗ và bay đi. Dùng để giải thích vì sao toàn bộ cơ bay của côn trùng tập trung ở ngực.',
    view: {
      type: 'creature',
      creature: 'bee',
      framing: { yaw: 0.62, pitch: 0.16, fill: 0.94, animate: true },
    },
    rail: { kind: 'thumbnail', thumb: 'bee' },
    parts: [
      { label: 'Đầu', body: 'Râu và mắt kép — cơ quan nhận biết.' },
      { label: 'Ngực', body: 'Nơi gắn cánh và cả sáu chân.' },
      { label: 'Cánh', body: 'Hai đôi mỏng, đập rất nhanh.' },
      { label: 'Bụng', body: 'Nhiều đốt, chứa nội quan.' },
    ],
    goals: [
      'Chỉ ra ba phần cơ thể của côn trùng trên mô hình',
      'Giải thích vì sao cánh và chân đều gắn vào ngực',
    ],
    facts: [
      { label: 'Trạng thái', value: '3 — đứng yên, bay tại chỗ, bay đi' },
      { label: 'Xương', value: 'Có — mô hình biến dạng theo khớp' },
    ],
    notes: [
      {
        label: 'Vì sao cánh gắn ở ngực',
        body: 'Cơ bay chiếm gần như toàn bộ thể tích ngực. Đó là lý do ngực ong to và cứng hơn hẳn phần bụng nhiều đốt.',
      },
    ],
    keywords: 'ong bee mat con trung canh bay giai phau apis',
  },
  {
    id: 'clownfish',
    title: 'Cá cảnh biển',
    subtitle: 'Hệ vây và chuyển động',
    subject: 'sinh-hoc',
    topic: 'Hình thái động vật',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Thân dẹp hai bên, hệ vây tách vùng rõ ràng.',
    description:
      'Thân cá dẹp hai bên để len qua khe hẹp, mỗi vây đảm nhiệm một việc. Vòng bơi cho thấy vây nào giữ thăng bằng và vây nào tạo lực đẩy.',
    view: {
      type: 'creature',
      creature: 'fish',
      framing: { yaw: 1.42, pitch: 0.1, fill: 0.92, animate: true },
    },
    rail: { kind: 'thumbnail', thumb: 'fish' },
    parts: [
      { label: 'Thân', body: 'Dẹp hai bên để len qua khe hẹp.' },
      { label: 'Vây lưng', body: 'Giữ thân không lật khi bơi.' },
      { label: 'Vây ngực', body: 'Đổi hướng và phanh lại.' },
      { label: 'Vây đuôi', body: 'Tạo lực đẩy chính.' },
    ],
    goals: ['Gọi tên từng vây và nêu chức năng', 'Liên hệ hình dạng thân với môi trường sống'],
    facts: [{ label: 'Chuyển động', value: '1 vòng bơi liên tục' }],
    notes: [
      {
        label: 'Hình dạng nói lên môi trường sống',
        body: 'Thân dẹp và vây ngực rộng là bộ đặc điểm của cá sống trong rạn — nơi cần rẽ gấp hơn là bơi nhanh.',
      },
    ],
    keywords: 'ca fish canh bien vay chuyen dong hinh thai',
  },
  {
    id: 'jellyfish',
    title: 'Sứa biển',
    subtitle: 'Ba lớp cơ thể trong suốt',
    subject: 'sinh-hoc',
    topic: 'Cấu tạo cơ thể',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Ba lớp cơ thể quan sát được cùng một lúc.',
    description:
      'Cơ thể sứa gần như trong suốt, nên trên cùng một mô hình học sinh thấy được cả màng keo ngoài, tầng mô co bóp và khoang tiêu hoá giữa thân.',
    view: {
      type: 'creature',
      creature: 'jellyfish',
      framing: { yaw: 0.44, pitch: 0.06, fill: 0.96, roll: -0.05, animate: true },
    },
    rail: { kind: 'thumbnail', thumb: 'jellyfish' },
    parts: [
      { label: 'Màng ngoài', body: 'Lớp keo trong suốt bảo vệ cơ thể.' },
      { label: 'Tầng giữa', body: 'Cơ co bóp đẩy nước để di chuyển.' },
      { label: 'Khoang giữa', body: 'Nơi tiêu hoá thức ăn bắt được.' },
      { label: 'Xúc tu', body: 'Bắt và đưa thức ăn vào khoang.' },
    ],
    goals: ['Nhận ra ba lớp cơ thể trên mô hình', 'Mô tả cách sứa di chuyển bằng co bóp'],
    facts: [{ label: 'Lớp vật liệu', value: '3 lớp trong suốt lồng nhau' }],
    notes: [
      {
        label: 'Không có phổi, không có tim',
        body: 'Cơ thể mỏng đến mức oxy khuếch tán trực tiếp qua thành. Đó là lý do sứa không cần cơ quan hô hấp hay tuần hoàn.',
      },
    ],
    keywords: 'sua jellyfish bien trong suot lop co the',
  },

  /* ------------------------------------------------------------- tế bào --- */
  ...CELLS.map(cellEntry),

  /* -------------------------------------------------------------- vi sinh --- */
  {
    id: 'gram-positive-wall',
    title: 'Vách tế bào Gram dương',
    subtitle: 'Peptidoglycan',
    subject: 'sinh-hoc',
    topic: 'Vi sinh',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Mặt cắt vách vi khuẩn Gram dương — mô hình khoa học thật.',
    description:
      'Mô hình mặt cắt vách tế bào vi khuẩn Gram dương: lớp peptidoglycan dày nằm ngoài màng sinh chất, là lý do vi khuẩn Gram dương giữ được màu tím trong phép nhuộm Gram.',
    view: {
      type: 'model',
      url: '/asset/Library/Biology/gram-positive-wall.glb',
      preset: 'tissue',
      framing: { yaw: 0.75, pitch: 0.24, fill: 0.92 },
    },
    rail: { kind: 'thumbnail', thumb: 'gram-wall' },
    parts: [
      { label: 'Peptidoglycan', body: 'Lớp dày đặc trưng của vi khuẩn Gram dương.' },
      { label: 'Màng sinh chất', body: 'Lớp lipid kép nằm bên dưới vách.' },
      { label: 'Acid teichoic', body: 'Chuỗi xuyên vách, giúp giữ cấu trúc.' },
    ],
    goals: [
      'Phân biệt vách Gram dương với Gram âm qua độ dày peptidoglycan',
      'Giải thích cơ sở của phép nhuộm Gram',
    ],
    facts: [{ label: 'Nguồn', value: 'NIH 3D · 3DPX-010752 · Public Domain' }],
    notes: [
      {
        label: 'Vì sao phép nhuộm Gram hoạt động',
        body: 'Lớp peptidoglycan dày giữ lại phức tím tinh thể khi tẩy bằng cồn; vách Gram âm mỏng hơn nên mất màu.',
      },
    ],
    credits: [
      {
        author: 'A.C. Vinal, Wake Technical Community College',
        license: 'Public Domain',
        source: 'https://3d.nih.gov/entries/3DPX-010752',
        notice: 'Mô hình thuộc phạm vi công cộng; ghi công theo yêu cầu của tác giả.',
      },
    ],
    keywords: 'vi khuan gram duong vach peptidoglycan bacteria te bao',
  },
];
