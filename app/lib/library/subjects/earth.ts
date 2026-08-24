import type { ExperienceManifest } from '../types';

/**
 * Địa lý & Trái Đất.
 *
 * Một quả địa cầu xoay mà không đọc được gì từ nó thì chỉ là đồ trang trí. Hai
 * mục ở đây tồn tại để bắt hình cầu trả lời câu hỏi: địa cầu trả lời "ở đâu",
 * mặt cắt trả lời "bên dưới là gì".
 *
 * Cả hai đều là số đo thật — biên giới từ Natural Earth thuộc phạm vi công cộng,
 * bán kính các lớp theo mô hình PREM — và chính vì là số thật mà nút "Đúng tỉ lệ"
 * của mặt cắt trở thành một bài học chứ không phải một tuỳ chọn hiển thị.
 */
export const EARTH_EXPERIENCES: ExperienceManifest[] = [
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
    rail: { kind: 'mark', mark: 'globe' },
    goals: [
      'Định vị một quốc gia trên quả địa cầu',
      'Đọc và so sánh dân số giữa các châu lục',
      'Nhận ra hình dạng châu lục trên mặt cầu thay vì trên bản đồ phẳng',
    ],
    facts: [
      { label: 'Quốc gia & vùng', value: '177' },
      { label: 'Dữ liệu', value: 'Natural Earth 1:110m · Public Domain' },
    ],
    notes: [
      {
        label: 'Bản đồ phẳng luôn nói dối',
        body: 'Mọi phép chiếu đều phải bóp méo diện tích hoặc hình dạng. Trên mặt cầu, Greenland trở lại đúng kích thước thật của nó.',
      },
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
  {
    id: 'earth-layers',
    title: 'Cấu tạo Trái Đất',
    subtitle: 'Mặt cắt năm lớp · bán kính thật',
    subject: 'dia-ly',
    topic: 'Cấu tạo hành tinh',
    kind: 'interactive',
    status: 'ready',
    summary: 'Mặt cắt tương tác, đo được độ sâu tại điểm đang trỏ.',
    description:
      'Năm lớp từ vỏ đến nhân trong, vẽ theo bán kính thật của mô hình PREM. Đưa con trỏ vào mặt cắt để đọc độ sâu tại điểm đó, chọn một lớp để xem độ dày, nhiệt độ, trạng thái và thành phần. Nút “Đúng tỉ lệ” đổi giữa hình vẽ kiểu sách giáo khoa và tỉ lệ thật — và chênh lệch giữa hai chế độ chính là nội dung.',
    view: { type: 'experience', key: 'earth-layers' },
    rail: { kind: 'mark', mark: 'earth-layers' },
    parts: [
      { label: 'Lớp vỏ', body: 'Dày 35 km — mọi thứ con người từng đào tới đều ở trong đây.' },
      { label: 'Manti trên', body: 'Rắn nhưng chảy dẻo; dòng chảy này đẩy các mảng kiến tạo.' },
      { label: 'Manti dưới', body: 'Chiếm hơn một nửa thể tích Trái Đất.' },
      { label: 'Nhân ngoài', body: 'Sắt lỏng đối lưu — nguồn của từ trường Trái Đất.' },
      { label: 'Nhân trong', body: 'Nóng ngang bề mặt Mặt Trời mà vẫn rắn, vì áp suất.' },
    ],
    goals: [
      'Gọi tên năm lớp theo thứ tự từ ngoài vào trong',
      'Đọc độ sâu của một ranh giới trên mặt cắt',
      'Giải thích vì sao nhân trong rắn dù nóng hơn nhân ngoài',
      'Nhận ra rằng hình vẽ trong sách đã phóng lớp vỏ lên rất nhiều lần',
    ],
    facts: [
      { label: 'Bán kính Trái Đất', value: '6 371 km' },
      { label: 'Lớp vỏ', value: '35 km — 0,55% bán kính' },
      { label: 'Ranh giới nhân – manti', value: 'Sâu 2 891 km' },
      { label: 'Nguồn số liệu', value: 'Mô hình PREM' },
    ],
    notes: [
      {
        label: 'Lớp vỏ mỏng hơn mọi hình vẽ từng cho thấy',
        body: 'Vỏ chiếm 0,55% bán kính — vẽ đúng tỉ lệ thì nó mảnh hơn cả đường viền của hình. Hầu như mọi hình trong sách đều phóng nó lên hàng chục lần mà không nói ra, nên học sinh rời lớp với ấn tượng sai.',
      },
      {
        label: 'Nhiệt độ muốn chảy, áp suất không cho phép',
        body: 'Nhân trong nóng hơn nhân ngoài nhưng vẫn rắn, vì áp suất ở tâm gấp hơn ba triệu lần áp suất khí quyển. Trạng thái vật chất là kết quả của cả hai đại lượng, không chỉ nhiệt độ.',
      },
    ],
    credits: [
      {
        author: 'Dziewonski & Anderson — Preliminary Reference Earth Model (PREM)',
        license: 'Số liệu khoa học đã công bố',
        source: 'https://doi.org/10.1016/0031-9201(81)90046-7',
        notice:
          'Bán kính và ranh giới các lớp theo PREM (1981). Nhiệt độ là khoảng ước lượng thông dụng trong địa vật lý. Phần dựng hình do YooLab viết.',
      },
    ],
    keywords: 'cau tao trai dat lop vo manti nhan ngoai nhan trong do sau tu truong prem',
  },
];
