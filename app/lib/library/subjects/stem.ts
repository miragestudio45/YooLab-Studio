import type { ExperienceManifest } from '../types';

/**
 * KHCN & STEM.
 *
 * Ít mục hơn, mỗi mục lớn hơn, và mục nào cũng đưa vào tay học sinh một dụng cụ.
 * Xưởng Formula là trải nghiệm lớn nhất của cả trang; bàn dụng cụ bên cạnh tồn
 * tại vì một bộ kit lắp mô hình không là gì nếu thiếu tám thứ ta cầm trong tay
 * khi lắp nó.
 *
 * Không có mục "sắp có" nào trong môn này. Một thẻ mô tả phòng thực hành ảo chưa
 * tồn tại sẽ làm hai mục thật ở đây bị đọc thành mẫu của một danh sách dài — đó
 * là cái giá đắt nhất mà một thẻ trống có thể gây ra.
 */
export const STEM_EXPERIENCES: ExperienceManifest[] = [
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
    /*
     * Xe thật, đang chạy — không phải ảnh chụp.
     *
     * Đây là trải nghiệm lớn nhất của cả trang, nên mục của nó trong Thư viện
     * không thể là một tấm ảnh với cái nút đè lên. `formula-workshop` mở ra một
     * bản xem trước sống: đúng `formulaCar.glb`, đúng bộ vật liệu và đúng lớp
     * texture mà chế độ toàn màn hình dùng, quay chậm trong một cung giới hạn.
     * Nó cũng làm nóng sẵn chính những tệp mà bản đầy đủ sẽ cần.
     */
    view: { type: 'experience', key: 'formula-workshop' },
    rail: { kind: 'thumbnail', thumb: 'formula' },
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
    notes: [
      {
        label: 'Lắp trước, lái sau',
        body: 'Học sinh đã tháo từng chi tiết ra sẽ nhận ra cánh sau dùng để làm gì ngay khi vào chế độ DRIVE.',
      },
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
    summary: 'Thước, bút chì, gôm, kéo, dao rọc, thảm cắt, tua vít, hũ sơn.',
    description:
      'Tám mô hình riêng, mỗi cái mở được ở kích thước đầy đủ với đầy đủ điều khiển xoay và phóng. Danh sách chia theo ba bước của một quy trình thật — đo và vẽ, cắt và tách, lắp và hoàn thiện — nên bản thân cái danh sách đã dạy thứ tự thao tác. Mỗi dụng cụ đi kèm một lưu ý kỹ thuật hoặc an toàn, là loại kiến thức chỉ có khi đã làm.',
    view: { type: 'experience', key: 'toolkit-bench' },
    rail: { kind: 'thumbnail', thumb: 'toolkit' },
    parts: [
      { label: 'Đo và vẽ', body: 'Thước kẻ, bút chì, gôm — đánh dấu trước khi cắt.' },
      { label: 'Cắt và tách', body: 'Kéo, dao rọc, thảm cắt — tách chi tiết khỏi khung nhựa.' },
      { label: 'Lắp và hoàn thiện', body: 'Tua vít, hũ sơn — ghép lại rồi sơn phủ.' },
    ],
    goals: [
      'Gọi tên tám dụng cụ và nêu công dụng của từng cái',
      'Xếp đúng thứ tự thao tác khi lắp một bộ mô hình',
      'Nêu được lưu ý an toàn của các dụng cụ có lưỡi',
    ],
    facts: [
      { label: 'Mô hình', value: '8 dụng cụ riêng biệt' },
      { label: 'Nhóm thao tác', value: '3 — đo, cắt, lắp' },
    ],
    notes: [
      {
        label: 'Dụng cụ dùng lại được',
        body: 'Tám mô hình này đi kèm xưởng Formula nhưng không thuộc riêng nó. Mọi bài thực hành cần dụng cụ cầm tay đều dùng lại được cùng bộ này.',
      },
    ],
    keywords: 'dung cu thuoc keo dao tua vit but chi gom hu son tham cat toolkit lap rap',
  },
];
