import type { ExperienceManifest, Subject, SubjectId } from './types';

/**
 * The YooLab Library.
 *
 * Seven subjects, and only the experiences that actually run in this build.
 *
 * There is no padding here. A subject with nothing behind it says so — the
 * alternative, filling it with thirty plausible-looking cards, is the one thing
 * that would make the rest of this page untrustworthy. Six real things a teacher
 * can open beats thirty they cannot.
 */

export const SUBJECTS: Subject[] = [
  { id: 'sinh-hoc', label: 'Sinh học', note: 'Cơ thể · Tế bào · Vi sinh', tint: 'var(--color-sage)' },
  { id: 'hoa-hoc', label: 'Hóa học', note: 'Nguyên tố · Cấu tạo chất', tint: 'var(--color-accent-strong)' },
  { id: 'vat-ly', label: 'Vật lý', note: 'Chuyển động · Lực', tint: 'var(--color-lavender)' },
  { id: 'dia-ly', label: 'Địa lý & Trái Đất', note: 'Địa cầu · Châu lục', tint: 'var(--color-cyan)' },
  { id: 'vu-tru', label: 'Khoa học vũ trụ', note: 'Hệ Mặt Trời · Phi hành', tint: 'var(--color-lavender)' },
  { id: 'lich-su', label: 'Lịch sử & Văn hóa', note: 'Di sản · Cổ vật', tint: 'var(--color-blush)' },
  { id: 'stem', label: 'KHCN & STEM', note: 'Kỹ thuật · Thực hành', tint: 'var(--color-accent-deep)' },
];

/** Subjects with no `ready` entry yet, and the honest reason. */
export const SUBJECT_GAPS: Partial<Record<SubjectId, string>> = {
  'vu-tru':
    'Học liệu vũ trụ đang được bổ sung. YooLab chỉ đưa vào thư viện những mô hình đã xác minh được nguồn và giấy phép sử dụng — chưa có mô hình nào của môn này đạt điều kiện đó.',
  'lich-su':
    'Học liệu lịch sử & văn hóa đang được bổ sung. Cổ vật số cần thoả thuận với đơn vị lưu giữ hiện vật, nên phần này sẽ mở khi có nguồn hợp lệ.',
};

export const EXPERIENCES: ExperienceManifest[] = [
  /* ------------------------------------------------------------ sinh học --- */
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
      type: 'model',
      url: '/asset/bee/bee_fixed.glb',
      preset: 'ruby',
      framing: { yaw: 0.85, pitch: 0.2, zoom: 1.24, animate: true },
    },
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
      type: 'model',
      url: '/asset/fish/Fish.glb',
      preset: 'natural',
      framing: { yaw: 1.5, pitch: 0.12, zoom: 1.18, animate: true },
    },
    parts: [
      { label: 'Thân', body: 'Dẹp hai bên để len qua khe hẹp.' },
      { label: 'Vây lưng', body: 'Giữ thân không lật khi bơi.' },
      { label: 'Vây ngực', body: 'Đổi hướng và phanh lại.' },
      { label: 'Vây đuôi', body: 'Tạo lực đẩy chính.' },
    ],
    goals: ['Gọi tên từng vây và nêu chức năng', 'Liên hệ hình dạng thân với môi trường sống'],
    facts: [{ label: 'Chuyển động', value: '1 vòng bơi liên tục' }],
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
      type: 'model',
      url: '/asset/fish/jellyfish.glb',
      preset: 'opal',
      framing: { yaw: 0.5, pitch: 0.08, zoom: 0.72, targetY: 0.72, animate: true },
    },
    parts: [
      { label: 'Màng ngoài', body: 'Lớp keo trong suốt bảo vệ cơ thể.' },
      { label: 'Tầng giữa', body: 'Cơ co bóp đẩy nước để di chuyển.' },
      { label: 'Khoang giữa', body: 'Nơi tiêu hoá thức ăn bắt được.' },
      { label: 'Xúc tu', body: 'Bắt và đưa thức ăn vào khoang.' },
    ],
    goals: ['Nhận ra ba lớp cơ thể trên mô hình', 'Mô tả cách sứa di chuyển bằng co bóp'],
    facts: [{ label: 'Lớp vật liệu', value: '3 lớp trong suốt lồng nhau' }],
    keywords: 'sua jellyfish bien trong suot lop co the',
  },
  {
    id: 'cell-studio',
    title: 'Tế bào động vật',
    subtitle: 'Nhân · Bào quan · Màng',
    subject: 'sinh-hoc',
    topic: 'Tế bào',
    kind: 'interactive',
    status: 'ready',
    summary: 'Mô hình tế bào 3D: chọn bào quan để tách và đọc chức năng.',
    description:
      'Không gian tế bào dựng bằng hình học Three.js của YooLab: nhân, lưới nội chất, ti thể, bộ Golgi, ribosome và màng sinh chất là các đối tượng riêng — chọn một bào quan để tách nó ra khỏi khối và đọc chức năng ngay tại chỗ.',
    view: { type: 'experience', key: 'cell-studio' },
    parts: [
      { label: 'Nhân', body: 'Chứa vật chất di truyền, điều khiển hoạt động tế bào.' },
      { label: 'Ti thể', body: 'Hô hấp tế bào — nơi tạo ra năng lượng ATP.' },
      { label: 'Lưới nội chất', body: 'Hệ màng gấp — tổng hợp và vận chuyển chất.' },
      { label: 'Bộ Golgi', body: 'Đóng gói và phân phối sản phẩm của tế bào.' },
      { label: 'Ribosome', body: 'Hạt nhỏ tổng hợp protein.' },
      { label: 'Màng sinh chất', body: 'Ranh giới chọn lọc chất vào và ra.' },
    ],
    goals: [
      'Gọi tên và định vị sáu bào quan chính',
      'Nối mỗi bào quan với một chức năng sống của tế bào',
    ],
    facts: [
      { label: 'Bào quan', value: '6 đối tượng chọn được' },
      { label: 'Dựng bằng', value: 'Hình học thủ tục Three.js của YooLab' },
    ],
    keywords: 'te bao cell nhan bao quan ti the golgi ribosome mang sinh chat',
  },
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
      framing: { yaw: 0.75, pitch: 0.26, zoom: 1.12 },
    },
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

  /* -------------------------------------------------------------- hóa học --- */
  {
    id: 'periodic-table',
    title: 'Bảng tuần hoàn',
    subtitle: '118 nguyên tố',
    subject: 'hoa-hoc',
    topic: 'Nguyên tố',
    kind: 'interactive',
    status: 'ready',
    summary: 'Bảng tuần hoàn tương tác, mở mô hình nguyên tử cho từng nguyên tố.',
    description:
      'Toàn bộ 118 nguyên tố, tô màu theo nhóm. Chọn một nguyên tố để xem mô hình nguyên tử với các lớp electron quay theo đúng cấu hình của nó, cùng bảng tính chất đầy đủ: khối lượng, độ âm điện, bán kính, nhiệt độ nóng chảy và sôi.',
    view: { type: 'experience', key: 'periodic-table' },
    goals: [
      'Định vị một nguyên tố theo chu kỳ và nhóm',
      'Đọc cấu hình electron và liên hệ với vị trí trong bảng',
      'So sánh tính chất giữa các nhóm nguyên tố',
    ],
    facts: [
      { label: 'Nguyên tố', value: '118' },
      { label: 'Nhóm màu', value: '11 loại' },
      { label: 'Tính chất', value: 'Hơn 20 chỉ số mỗi nguyên tố' },
    ],
    credits: [
      {
        author: 'Periodic-Table-JSON · PubChem (NIH)',
        license: 'CC BY-SA 4.0 (dữ liệu) · Public Domain (PubChem)',
        source: 'https://github.com/Bowserinator/Periodic-Table-JSON',
        notice:
          'Dữ liệu nguyên tố giữ nguyên giấy phép gốc. Giao diện và phần dựng 3D do YooLab viết.',
      },
      {
        author: 'CloudyLo001 · Mint Playground',
        license: 'MIT',
        source: 'https://github.com/mintdotgg/mint-playground',
        notice: 'Tham khảo kiến trúc trải nghiệm; phần hiển thị của YooLab là bản viết lại.',
      },
    ],
    keywords: 'bang tuan hoan nguyen to hoa hoc periodic table electron',
  },
  {
    id: 'molecule-viewer',
    title: 'Mô hình phân tử',
    subject: 'hoa-hoc',
    topic: 'Cấu tạo chất',
    kind: 'interactive',
    status: 'planned',
    summary: 'Xem liên kết, góc và hình học của phân tử.',
    description:
      'Bước tiếp theo của môn Hóa: mô hình phân tử với kiểu hiển thị que–cầu, đo góc và độ dài liên kết. Kiến trúc thư viện đã sẵn cho mục này; nội dung chưa mở.',
    view: { type: 'placeholder' },
    keywords: 'phan tu molecule lien ket hinh hoc',
  },

  /* --------------------------------------------------------------- vật lý --- */
  {
    id: 'projectile-lab',
    title: 'Chuyển động ném',
    subtitle: 'Động học hai chiều',
    subject: 'vat-ly',
    topic: 'Chuyển động',
    kind: 'simulation',
    status: 'ready',
    summary: 'Mô phỏng vật ném: đổi góc, tốc độ, trọng lực và lực cản.',
    description:
      'Mô phỏng chạy thật theo phương trình động học: đặt góc ném, tốc độ đầu, độ cao, trọng lực và lực cản không khí rồi bắn. Quỹ đạo, điểm cao nhất, tầm xa và thời gian bay được tính và vẽ trực tiếp.',
    view: { type: 'experience', key: 'projectile-lab' },
    goals: [
      'Dự đoán ảnh hưởng của góc ném lên tầm xa',
      'Tách chuyển động thành hai thành phần vuông góc',
      'Nhận ra góc 45° cho tầm xa lớn nhất khi không có lực cản',
    ],
    facts: [
      { label: 'Tham số', value: '5 — góc, tốc độ, độ cao, g, lực cản' },
      { label: 'Trọng lực đặt sẵn', value: 'Trái Đất · Mặt Trăng · Sao Hỏa' },
    ],
    credits: [
      {
        author: 'IlliniOpenEdu · PhysicsSims',
        license: 'MIT',
        source: 'https://github.com/IlliniOpenEdu/PhysicsSims',
        notice: 'Tham khảo kiến trúc module mô phỏng. Mã mô phỏng của YooLab được viết mới.',
      },
    ],
    keywords: 'chuyen dong nem projectile dong hoc luc can trong luc vat ly',
  },

  /* --------------------------------------------------------------- địa lý --- */
  {
    id: 'globe-explorer',
    title: 'Địa cầu tương tác',
    subtitle: '177 quốc gia · 7 châu lục',
    subject: 'dia-ly',
    topic: 'Địa cầu',
    kind: 'interactive',
    status: 'ready',
    summary: 'Quả địa cầu 3D xoay được, chọn quốc gia để đọc số liệu.',
    description:
      'Quả địa cầu dựng bằng Three.js từ dữ liệu bản đồ Natural Earth thuộc phạm vi công cộng. Kéo để xoay, chọn một quốc gia để xem tên tiếng Việt, châu lục, khu vực, dân số và GDP; đổi lớp hiển thị để tô màu theo châu lục hoặc theo dân số.',
    view: { type: 'experience', key: 'globe-explorer' },
    goals: [
      'Định vị một quốc gia trên quả địa cầu',
      'Đọc và so sánh dân số giữa các châu lục',
      'Nhận ra hình dạng châu lục trên mặt cầu thay vì trên bản đồ phẳng',
    ],
    facts: [
      { label: 'Quốc gia & vùng', value: '177' },
      { label: 'Dữ liệu', value: 'Natural Earth 1:110m · Public Domain' },
    ],
    credits: [
      {
        author: 'Tom Patterson & Nathaniel Vaughn Kelso — Natural Earth',
        license: 'Public Domain',
        source: 'https://www.naturalearthdata.com',
        notice:
          'Made with Natural Earth. Tên quốc gia tiếng Việt lấy từ trường NAME_VI của cùng bộ dữ liệu.',
      },
    ],
    keywords: 'dia cau globe quoc gia chau luc dan so ban do dia ly trai dat',
  },

  /* ----------------------------------------------------------------- STEM --- */
  {
    id: 'formula',
    title: 'Xưởng mô hình xe đua',
    subtitle: 'Formula · KIT · STUDIO · DRIVE',
    subject: 'stem',
    topic: 'Kỹ thuật cơ khí',
    kind: 'workshop',
    status: 'ready',
    summary: 'Lắp ráp, quan sát và tự lái — trải nghiệm toàn màn hình.',
    description:
      'Trải nghiệm kỹ thuật lớn nhất của YooLab. KIT là bàn lắp ráp với khung nhựa và dụng cụ để hiểu cấu tạo; STUDIO là phòng quan sát để xem trọn hình khối; DRIVE cho học sinh tự cầm lái và cảm nhận vì sao xe được thiết kế như vậy.',
    view: {
      type: 'poster',
      src: '/asset/Library/Car/formula-preview.jpg',
      alt: 'Xưởng mô hình xe đua YooLab',
    },
    parts: [
      { label: 'KIT', body: 'Hiểu cấu tạo — tháo từng chi tiết khỏi khung nhựa.' },
      { label: 'STUDIO', body: 'Quan sát hệ thống — xoay quanh xe đã hoàn thiện.' },
      { label: 'DRIVE', body: 'Vận hành — tự lái bằng WASD hoặc phím mũi tên.' },
    ],
    goals: [
      'Nhận ra chức năng của từng nhóm chi tiết trên xe',
      'Liên hệ hình khối khí động học với chuyển động thật',
    ],
    facts: [
      { label: 'Chế độ', value: '3 — KIT, STUDIO, DRIVE' },
      { label: 'Dụng cụ', value: '8 dụng cụ cầm tay trên bàn lắp ráp' },
    ],
    opensWorkshop: true,
    keywords: 'xe dua formula lap rap co khi ky thuat stem lai xe kit studio drive',
  },
  {
    id: 'toolkit',
    title: 'Bộ dụng cụ mô hình',
    subtitle: '8 dụng cụ cầm tay',
    subject: 'stem',
    topic: 'Dụng cụ thực hành',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Thước, kéo, dao rọc, tua vít, bút chì, gôm, hũ sơn, thảm cắt.',
    description:
      'Bộ dụng cụ đi kèm xưởng mô hình, dùng lại được cho các bài thực hành khác cần dụng cụ cầm tay. Mỗi dụng cụ là một mô hình riêng.',
    view: {
      type: 'model',
      url: '/asset/Library/Car/screwdriver.glb',
      preset: 'plastic',
      framing: { yaw: 0.9, pitch: 0.3, zoom: 1.08 },
    },
    parts: [
      { label: 'Đo và vẽ', body: 'Thước kẻ, bút chì, gôm.' },
      { label: 'Cắt và tách', body: 'Kéo, dao rọc, thảm cắt.' },
      { label: 'Lắp và hoàn thiện', body: 'Tua vít, hũ sơn.' },
    ],
    facts: [{ label: 'Mô hình', value: '8 dụng cụ riêng biệt' }],
    keywords: 'dung cu thuoc keo dao tua vit but chi gom hu son tham cat toolkit',
  },
  {
    id: 'practice-lab',
    title: 'Phòng thực hành 3D',
    subject: 'stem',
    topic: 'Phòng thí nghiệm',
    kind: 'lab',
    status: 'planned',
    summary: 'Bàn thí nghiệm ảo cho các thao tác khó làm trong lớp.',
    description:
      'Phòng thực hành ảo cho hoá học và vật lý: dụng cụ thật, thao tác thật, làm lại bao nhiêu lần cũng được. Đây là hạng mục lớn tiếp theo của YooLab; khung kiến trúc đã sẵn, nội dung chưa mở.',
    view: { type: 'placeholder' },
    keywords: 'phong thuc hanh lab thi nghiem hoa hoc vat ly vr',
  },
];

export const READY_EXPERIENCES = EXPERIENCES.filter((item) => item.status === 'ready');

export function experiencesForSubject(subject: SubjectId) {
  return EXPERIENCES.filter((item) => item.subject === subject);
}

export function readyCountForSubject(subject: SubjectId) {
  return EXPERIENCES.filter((item) => item.subject === subject && item.status === 'ready').length;
}

export function experienceById(id: string) {
  return EXPERIENCES.find((item) => item.id === id) ?? null;
}

/** Biology leads: it has the most verified assets, so it is what opens. */
export const DEFAULT_SUBJECT: SubjectId = 'sinh-hoc';
