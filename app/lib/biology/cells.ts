/**
 * Sinh học tế bào — nội dung cho sáu loại tế bào của Thư viện.
 *
 * Tất cả chữ tiếng Việt của phần tế bào nằm trong file này, kể cả phần mà bản
 * kê học liệu (`lib/library/subjects/biology.ts`) hiển thị. Đó là chủ ý: nội
 * dung sinh học phải đọc soát được ở một chỗ, còn `CellStudio.tsx` chỉ dựng
 * hình và xử lý tương tác. Sáu manifest của Thư viện lấy `parts`, `goals`,
 * `facts`, `notes` từ đây nên tên bào quan trên mô hình và trong bảng kiến thức
 * không thể lệch nhau.
 *
 * Hình học là hình học thủ tục do YooLab dựng, không phải mesh tải về. Hai bản
 * quét của NIH có thể dùng cho tế bào động vật (3DPX-015797) và neuron
 * (3DPX-015796) đều mang giấy phép CC BY-NC-SA — phi thương mại — nên không
 * được phép xuất hiện trên một sản phẩm. Dựng lại bằng primitive còn cho một
 * thứ mà mesh liền khối không cho: từng bào quan là một vật thể riêng, tách ra
 * và gọi tên được.
 */

/** Sáu loại tế bào có hình học riêng trong CellStudio. */
export type CellId = 'animal' | 'plant' | 'white-blood' | 'epithelial' | 'muscle' | 'neuron';

export type OrganelleAttribute = { label: string; value: string };

export type Organelle = {
  id: string;
  name: string;
  /** Một dòng chức năng — câu mà học sinh phải nhớ được. */
  role: string;
  /** 2–3 số đo: kích thước, vị trí, có thấy dưới kính hiển vi quang học hay không. */
  attributes: OrganelleAttribute[];
  /** Đoạn giải thích thêm, dùng cho bảng kiến thức của Thư viện. */
  note: string;
  /** Màu vật liệu trong cảnh 3D, cũng là màu ô nhận dạng trong danh sách. */
  color: string;
  /** Hướng bào quan đi khi tách lớp, theo đơn vị của cảnh. */
  offset: readonly [number, number, number];
  /**
   * Lớp bao kín (màng, thành, màng sợi cơ).
   *
   * Một lớp bao không thể "dịch sang bên" như một bào quan rời: khi tách lớp nó
   * phình ra và mờ đi để nhìn được vào trong. Cờ này là thứ phân biệt hai hành
   * vi đó trong vòng lặp dựng hình.
   */
  shell?: boolean;
};

/** Khung hình do người dựng đặt, không đo lại từ cảnh khi chạy. */
export type CellFrame = {
  /** Phần khung mà mẫu chiếm theo chiều chật hơn, 0–1. */
  fill: number;
  /** Góc quay và góc nâng ban đầu, radian. */
  yaw: number;
  pitch: number;
  /** Kích thước bao và tâm của phần hình học chọn được, đơn vị cảnh. */
  size: readonly [number, number, number];
  center: readonly [number, number, number];
};

export type CellContent = {
  id: CellId;
  name: string;
  subtitle: string;
  /** Nhân thực hay nhân sơ — chip loại tế bào. */
  cellClass: string;
  /** Token màu của loại tế bào, dùng cho danh sách bào quan. */
  accent: string;
  /** Nơi gặp loại tế bào này trong cơ thể. */
  where: string;
  /** Một dòng so sánh với loại tế bào quen hơn. */
  comparison: string;
  /** Bào quan mở sẵn khi vào, để giao diện không mở ra trống. */
  defaultOrganelle: string;
  organelles: Organelle[];
  goals: string[];
  facts: { label: string; value: string }[];
  /** Câu giáo viên nhắc lại; Thư viện dựng thành khối ghi chú. */
  highlight: { label: string; body: string };
  /** Có lớp bao kín nên cắt được nửa trước để nhìn vào trong. */
  crossSection: boolean;
  frame: CellFrame;
};

/**
 * Bảng màu bào quan, dùng chung cho cả sáu tế bào.
 *
 * Một bào quan giữ nguyên màu ở mọi loại tế bào: nhân luôn tím, ti thể luôn
 * cam, lưới nội chất luôn lam. Nhờ vậy khi học sinh chuyển từ tế bào động vật
 * sang tế bào thực vật, cái đã học vẫn nhận ra được. Mọi giá trị lấy từ dải màu
 * của site (lavender, accent, cyan, sage, ok, blush, cream) hoặc là sắc độ đậm
 * / nhạt hơn của chính chúng.
 */
const INK = {
  membrane: '#f6d9c9',
  wall: '#769d74',
  nucleus: '#8d6bcc',
  mitochondria: '#e87868',
  reticulum: '#5fb6c4',
  golgi: '#e0b45c',
  ribosome: '#8fae8d',
  chloroplast: '#4f8a52',
  vacuole: '#9ad4dd',
  lysosome: '#c95f52',
  granule: '#e88fa8',
  vesicle: '#e0b45c',
  fibril: '#c95f52',
  soma: '#b9a3e0',
  synapse: '#e88fa8',
} as const;

/** Dòng số đo hay lặp lại nhất, viết một lần cho khỏi lệch câu. */
const LM_YES: OrganelleAttribute = { label: 'Kính quang học', value: 'Thấy rõ khi nhuộm' };
const LM_NO: OrganelleAttribute = { label: 'Kính quang học', value: 'Không — cần kính điện tử' };
const LM_FAINT: OrganelleAttribute = { label: 'Kính quang học', value: 'Thấy mờ' };

export const CELLS: CellContent[] = [
  /* ------------------------------------------------------ tế bào động vật --- */
  {
    id: 'animal',
    name: 'Tế bào động vật',
    subtitle: 'Tế bào nhân thực điển hình',
    cellClass: 'Tế bào nhân thực',
    accent: 'var(--color-lavender)',
    where: 'Mọi cơ quan trong cơ thể động vật và người.',
    comparison:
      'Khác tế bào thực vật ở ba điểm: không có thành tế bào, không có lục lạp, không có không bào trung tâm.',
    defaultOrganelle: 'nucleus',
    crossSection: true,
    frame: { fill: 0.96, yaw: 0.5, pitch: 0.18, size: [5.3, 5.3, 5.3], center: [0, 0, 0] },
    organelles: [
      {
        id: 'membrane',
        name: 'Màng sinh chất',
        role: 'Ranh giới chọn lọc, quyết định chất nào vào và ra khỏi tế bào.',
        attributes: [
          { label: 'Độ dày', value: '7–10 nm' },
          { label: 'Cấu tạo', value: 'Hai lớp phospholipid' },
          { label: 'Kính quang học', value: 'Chỉ thấy ranh giới' },
        ],
        note:
          'Màng sinh chất là lớp phospholipid kép có protein xuyên qua. Chính các protein đó làm nên tính chọn lọc: nước và khí đi qua dễ, còn ion và phân tử lớn phải có kênh riêng.',
        color: INK.membrane,
        offset: [0, 0, 0],
        shell: true,
      },
      {
        id: 'nucleus',
        name: 'Nhân',
        role: 'Chứa DNA, điều khiển mọi hoạt động của tế bào.',
        attributes: [
          { label: 'Đường kính', value: '5–10 µm' },
          { label: 'Vị trí', value: 'Gần giữa tế bào' },
          LM_YES,
        ],
        note:
          'Nhân có màng kép với các lỗ nhân cho RNA đi ra và protein đi vào. Khối đặc bên trong là nhân con, nơi lắp ribosome.',
        color: INK.nucleus,
        offset: [-0.3, 0.4, 2.5],
      },
      {
        id: 'mitochondria',
        name: 'Ti thể',
        role: 'Hô hấp tế bào — chuyển năng lượng trong chất hữu cơ thành ATP.',
        attributes: [
          { label: 'Chiều dài', value: '1–10 µm' },
          { label: 'Số lượng', value: 'Hàng trăm mỗi tế bào' },
          LM_FAINT,
        ],
        note:
          'Màng trong gấp nếp thành các mào để tăng diện tích cho chuỗi truyền electron. Ti thể có DNA riêng và tự nhân đôi được.',
        color: INK.mitochondria,
        offset: [2.6, 0.4, 0.6],
      },
      {
        id: 'er',
        name: 'Lưới nội chất',
        role: 'Hệ màng gấp nếp nối với nhân, tổng hợp và vận chuyển chất.',
        attributes: [
          { label: 'Dạng', value: 'Hạt và trơn' },
          { label: 'Vị trí', value: 'Bao quanh nhân' },
          LM_NO,
        ],
        note:
          'Lưới nội chất hạt có ribosome bám mặt ngoài nên tổng hợp protein; lưới nội chất trơn tổng hợp lipid và khử độc.',
        color: INK.reticulum,
        offset: [-2.6, 0.3, 0.7],
      },
      {
        id: 'golgi',
        name: 'Bộ máy Golgi',
        role: 'Hoàn thiện, đóng gói và phân phối sản phẩm của tế bào.',
        attributes: [
          { label: 'Cấu tạo', value: 'Chồng túi dẹp' },
          { label: 'Vị trí', value: 'Ngay cạnh nhân' },
          LM_FAINT,
        ],
        note:
          'Protein từ lưới nội chất đi vào một mặt của chồng túi, được gắn thêm nhóm đường rồi tách ra thành túi tiết ở mặt kia.',
        color: INK.golgi,
        offset: [0.7, -2.5, 0.8],
      },
      {
        id: 'ribosome',
        name: 'Ribosome',
        role: 'Hạt nhỏ dịch mã mRNA thành chuỗi protein.',
        attributes: [
          { label: 'Đường kính', value: '20–30 nm' },
          { label: 'Vị trí', value: 'Tự do hoặc trên lưới nội chất' },
          LM_NO,
        ],
        note:
          'Ribosome không có màng bao. Đây là bào quan duy nhất trong danh sách mà tế bào nhân sơ cũng có.',
        color: INK.ribosome,
        offset: [-0.8, 2.5, 0.8],
      },
    ],
    goals: [
      'Gọi tên sáu bào quan trên mô hình và nêu chức năng của từng bào quan',
      'Chỉ ra đường đi của protein từ ribosome qua lưới nội chất tới bộ máy Golgi',
      'Phân biệt tế bào động vật với tế bào thực vật bằng ba đặc điểm',
    ],
    facts: [
      { label: 'Đường kính tế bào', value: '10–30 µm' },
      { label: 'Bào quan tách được', value: '6' },
      { label: 'Hình học', value: 'Thủ tục — YooLab dựng' },
    ],
    highlight: {
      label: 'Vì sao mô hình này dựng bằng hình học',
      body:
        'Hai bản quét tế bào của NIH đều mang giấy phép phi thương mại nên không dùng được. Dựng lại bằng hình học còn cho phép tách rời từng bào quan — điều một mesh liền khối không làm được.',
    },
  },

  /* ------------------------------------------------------ tế bào thực vật --- */
  {
    id: 'plant',
    name: 'Tế bào thực vật',
    subtitle: 'Thành xenlulozơ và không bào trung tâm',
    cellClass: 'Tế bào nhân thực',
    accent: 'var(--color-sage)',
    where: 'Lá, thân, rễ — mọi mô của cây xanh.',
    comparison:
      'Khác tế bào động vật ở ba điểm: có thành tế bào, có lục lạp và có một không bào trung tâm rất lớn.',
    defaultOrganelle: 'chloroplast',
    crossSection: true,
    frame: { fill: 0.92, yaw: 0.62, pitch: 0.2, size: [5.8, 3.8, 2.8], center: [0, 0, 0] },
    organelles: [
      {
        id: 'wall',
        name: 'Thành tế bào',
        role: 'Khung cứng bằng xenlulozơ, giữ cho tế bào có hình khối cố định.',
        attributes: [
          { label: 'Vật liệu', value: 'Xenlulozơ' },
          { label: 'Độ dày', value: '0,1–10 µm' },
          { label: 'Kính quang học', value: 'Thấy rõ' },
        ],
        note:
          'Thành tế bào nằm ngoài màng sinh chất và không có tính chọn lọc. Nhờ thành cứng, cây đứng được mà không cần bộ xương.',
        color: INK.wall,
        offset: [0, 0, 0],
        shell: true,
      },
      {
        id: 'vacuole',
        name: 'Không bào trung tâm',
        role: 'Túi nước lớn tạo áp suất trương, giữ cho tế bào căng.',
        attributes: [
          { label: 'Thể tích', value: 'Tới 80% tế bào' },
          { label: 'Chứa', value: 'Nước, ion, sắc tố' },
          { label: 'Kính quang học', value: 'Thấy rõ' },
        ],
        note:
          'Khi mất nước, không bào xẹp lại, tế bào mất áp suất trương và lá rũ xuống. Đó là cơ chế của hiện tượng héo.',
        color: INK.vacuole,
        offset: [0, 0, 3.0],
      },
      {
        id: 'chloroplast',
        name: 'Lục lạp',
        role: 'Quang hợp — dùng năng lượng ánh sáng để tổng hợp chất hữu cơ.',
        attributes: [
          { label: 'Kích thước', value: '5–10 µm' },
          { label: 'Sắc tố', value: 'Chất diệp lục' },
          { label: 'Kính quang học', value: 'Thấy rõ, màu lục' },
        ],
        note:
          'Trong lục lạp là những chồng túi dẹp chứa diệp lục. Một tế bào thịt lá có thể chứa vài chục lục lạp.',
        color: INK.chloroplast,
        offset: [0, 2.6, 0.8],
      },
      {
        id: 'nucleus',
        name: 'Nhân',
        role: 'Chứa DNA, điều khiển hoạt động của tế bào.',
        attributes: [
          { label: 'Đường kính', value: '5–10 µm' },
          { label: 'Vị trí', value: 'Bị không bào ép ra sát thành' },
          LM_YES,
        ],
        note:
          'Ở tế bào thực vật trưởng thành, không bào chiếm gần hết thể tích nên nhân và các bào quan khác bị đẩy thành một lớp mỏng sát thành tế bào.',
        color: INK.nucleus,
        offset: [-3.2, -0.8, 0.6],
      },
      {
        id: 'mitochondria',
        name: 'Ti thể',
        role: 'Hô hấp tế bào — tạo ATP kể cả khi không có ánh sáng.',
        attributes: [
          { label: 'Chiều dài', value: '1–10 µm' },
          { label: 'Vị trí', value: 'Trong lớp bào tương sát thành' },
          LM_FAINT,
        ],
        note:
          'Cây hô hấp suốt ngày đêm. Quang hợp chỉ diễn ra khi có ánh sáng, còn ti thể làm việc liên tục.',
        color: INK.mitochondria,
        offset: [3.2, 0.9, 0.6],
      },
      {
        id: 'er',
        name: 'Lưới nội chất',
        role: 'Tổng hợp và vận chuyển chất trong lớp bào tương mỏng.',
        attributes: [
          { label: 'Dạng', value: 'Hạt và trơn' },
          { label: 'Vị trí', value: 'Quanh nhân' },
          LM_NO,
        ],
        note:
          'Ở thực vật, lưới nội chất còn nối xuyên thành tế bào bằng các cầu sinh chất, thông bào tương của hai tế bào cạnh nhau.',
        color: INK.reticulum,
        offset: [0, -2.6, 0.8],
      },
    ],
    goals: [
      'Chỉ ra ba bào quan chỉ có ở tế bào thực vật',
      'Giải thích vì sao mất nước làm lá rũ xuống',
      'Liên hệ vị trí lục lạp với việc lá phải hướng về phía sáng',
    ],
    facts: [
      { label: 'Kích thước tế bào', value: '10–100 µm' },
      { label: 'Không bào', value: 'Tới 80% thể tích' },
      { label: 'Bào quan tách được', value: '6' },
    ],
    highlight: {
      label: 'Không bào quyết định bố cục bên trong',
      body:
        'Không bào lớn ép mọi bào quan còn lại thành một lớp mỏng sát thành. Đó là lý do trên tiêu bản thịt lá, lục lạp trông như xếp thành một vòng quanh mép tế bào.',
    },
  },

  /* -------------------------------------------------------------- bạch cầu --- */
  {
    id: 'white-blood',
    name: 'Bạch cầu',
    subtitle: 'Bạch cầu trung tính',
    cellClass: 'Tế bào nhân thực',
    accent: 'var(--color-lavender)',
    where: 'Máu, dịch lympho và các mô đang bị viêm.',
    comparison:
      'Khác tế bào biểu mô ở chỗ không có hình dạng cố định: màng gấp nếp liên tục để bò và để nuốt vi khuẩn.',
    defaultOrganelle: 'nucleus',
    crossSection: true,
    frame: { fill: 0.96, yaw: 0.42, pitch: 0.2, size: [5.6, 5.6, 5.6], center: [0, 0, 0] },
    organelles: [
      {
        id: 'membrane',
        name: 'Màng gấp nếp',
        role: 'Màng biến dạng liên tục, tạo chân giả để bò và bao lấy vi khuẩn.',
        attributes: [
          { label: 'Hình dạng', value: 'Không cố định' },
          { label: 'Chuyển động', value: 'Bò kiểu amip' },
          { label: 'Kính quang học', value: 'Thấy rõ ranh giới' },
        ],
        note:
          'Bạch cầu chui được qua thành mạch máu để vào mô. Không có thành tế bào nên nó tự đổi hình để lách qua khe hẹp giữa các tế bào.',
        color: INK.membrane,
        offset: [0, 0, 0],
        shell: true,
      },
      {
        id: 'nucleus',
        name: 'Nhân nhiều múi',
        role: 'Nhân thắt thành nhiều múi nối nhau, giúp tế bào lách qua khe hẹp.',
        attributes: [
          { label: 'Số múi', value: '2–5' },
          { label: 'Vị trí', value: 'Giữa tế bào' },
          LM_YES,
        ],
        note:
          'Hình dạng nhân là dấu hiệu phân loại bạch cầu trên tiêu bản máu: bạch cầu trung tính có nhân nhiều múi, bạch cầu lympho có nhân tròn.',
        color: INK.nucleus,
        offset: [0, 2.7, 0.5],
      },
      {
        id: 'granules',
        name: 'Hạt bào tương',
        role: 'Hạt chứa enzyme và chất diệt khuẩn, đổ ra khi gặp mầm bệnh.',
        attributes: [
          { label: 'Đường kính', value: '0,1–0,5 µm' },
          { label: 'Chứa', value: 'Enzyme, protein diệt khuẩn' },
          LM_YES,
        ],
        note:
          'Tên ba loại bạch cầu hạt — trung tính, ưa acid, ưa kiềm — đặt theo cách hạt của chúng bắt màu thuốc nhuộm.',
        color: INK.granule,
        offset: [2.7, -0.5, 0.6],
      },
      {
        id: 'lysosome',
        name: 'Lysosome',
        role: 'Túi enzyme tiêu hoá, phân giải vi khuẩn đã bị nuốt vào.',
        attributes: [
          { label: 'Đường kính', value: 'Khoảng 1 µm' },
          { label: 'Chứa', value: 'Enzyme thuỷ phân' },
          LM_NO,
        ],
        note:
          'Lysosome chỉ hoạt động trong môi trường acid. Nó nhập vào túi thực bào rồi mới đổ enzyme, nên enzyme không phá chính tế bào.',
        color: INK.lysosome,
        offset: [-2.7, -0.4, 0.6],
      },
      {
        id: 'phagosome',
        name: 'Túi thực bào',
        role: 'Túi màng bao lấy vi khuẩn vừa bị nuốt vào trong tế bào.',
        attributes: [
          { label: 'Nguồn gốc', value: 'Từ màng sinh chất' },
          { label: 'Số phận', value: 'Nhập với lysosome' },
          { label: 'Kính quang học', value: 'Thấy khi vật lớn' },
        ],
        note:
          'Thực bào có ba bước: màng lõm xuống bọc lấy vi khuẩn, túi tách vào trong tế bào, rồi lysosome đổ enzyme vào túi.',
        color: INK.vesicle,
        offset: [0, -2.7, 0.9],
      },
    ],
    goals: [
      'Mô tả ba bước của quá trình thực bào trên mô hình',
      'Giải thích vì sao nhân bạch cầu thắt thành nhiều múi',
      'Phân biệt hạt bào tương với lysosome',
    ],
    facts: [
      { label: 'Đường kính', value: '12–15 µm' },
      { label: 'Số múi nhân', value: '2–5' },
      { label: 'Bào quan tách được', value: '5' },
    ],
    highlight: {
      label: 'Hình dạng ở đây chính là chức năng',
      body:
        'Bạch cầu không có hình cố định vì việc của nó là di chuyển và nuốt. Màng gấp nếp, nhân nhiều múi, hạt dày đặc — cả ba chi tiết đều phục vụ hai việc đó.',
    },
  },

  /* ------------------------------------------------------- tế bào biểu mô --- */
  {
    id: 'epithelial',
    name: 'Tế bào biểu mô',
    subtitle: 'Biểu mô trụ đơn ở ruột non',
    cellClass: 'Tế bào nhân thực',
    accent: 'var(--color-blush)',
    where: 'Da, ruột non, đường hô hấp — mọi bề mặt tiếp xúc của cơ thể.',
    comparison:
      'Khác tế bào động vật điển hình ở chỗ có hai đầu khác nhau: đầu ngọn mang vi nhung mao, đầu đáy tựa lên màng đáy.',
    defaultOrganelle: 'microvilli',
    crossSection: true,
    frame: { fill: 0.78, yaw: 0.55, pitch: 0.12, size: [3.0, 6.0, 2.6], center: [0, 0.15, 0] },
    organelles: [
      {
        id: 'membrane',
        name: 'Màng sinh chất',
        role: 'Ranh giới của tế bào, khác nhau hẳn ở đầu ngọn và đầu đáy.',
        attributes: [
          { label: 'Hình khối', value: 'Trụ cao' },
          { label: 'Hai cực', value: 'Ngọn và đáy khác nhau' },
          { label: 'Kính quang học', value: 'Thấy ranh giới' },
        ],
        note:
          'Tế bào biểu mô có tính phân cực: protein vận chuyển ở đầu ngọn khác hẳn ở đầu đáy, nên chất chỉ đi được theo một chiều.',
        color: INK.membrane,
        offset: [0, 0, 0],
        shell: true,
      },
      {
        id: 'microvilli',
        name: 'Vi nhung mao',
        role: 'Hàng nghìn sợi nhỏ ở đầu ngọn, làm tăng diện tích hấp thụ.',
        attributes: [
          { label: 'Chiều dài', value: '0,5–1 µm' },
          { label: 'Vị trí', value: 'Đầu ngọn' },
          { label: 'Kính quang học', value: 'Thấy như viền bàn chải' },
        ],
        note:
          'Vi nhung mao làm diện tích hấp thụ của ruột non tăng khoảng 20 lần. Trên tiêu bản quang học chúng chỉ hiện ra như một viền mờ.',
        color: INK.granule,
        offset: [0, 2.9, 0],
      },
      {
        id: 'junction',
        name: 'Liên kết chặt',
        role: 'Đường hàn kín giữa hai tế bào, không cho chất lọt qua khe.',
        attributes: [
          { label: 'Vị trí', value: 'Sát đầu ngọn' },
          { label: 'Vai trò', value: 'Hàng rào' },
          LM_NO,
        ],
        note:
          'Nhờ liên kết chặt, chất trong lòng ruột buộc phải đi xuyên qua tế bào chứ không lách qua khe giữa hai tế bào. Đó là điều làm biểu mô thành một hàng rào thật.',
        color: INK.golgi,
        offset: [0, 1.6, 2.7],
      },
      {
        id: 'nucleus',
        name: 'Nhân',
        role: 'Chứa DNA; ở biểu mô trụ, nhân nằm lệch về phía đáy.',
        attributes: [
          { label: 'Hình dạng', value: 'Bầu dục' },
          { label: 'Vị trí', value: 'Lệch về đầu đáy' },
          LM_YES,
        ],
        note:
          'Vị trí nhân là dấu hiệu để đọc tiêu bản: nhân xếp thành một hàng gần màng đáy cho biết đây là biểu mô trụ đơn.',
        color: INK.nucleus,
        offset: [-2.9, -1.4, 0.6],
      },
      {
        id: 'mitochondria',
        name: 'Ti thể',
        role: 'Cấp ATP cho các bơm vận chuyển chất qua tế bào.',
        attributes: [
          { label: 'Số lượng', value: 'Nhiều, dồn về đầu ngọn' },
          { label: 'Vai trò', value: 'Cấp ATP cho bơm' },
          LM_FAINT,
        ],
        note:
          'Hấp thụ chủ động tốn ATP. Tế bào biểu mô ruột dồn ti thể về phía đầu ngọn, ngay cạnh nơi tiêu thụ năng lượng.',
        color: INK.mitochondria,
        offset: [2.9, 0.8, 0.6],
      },
      {
        id: 'er',
        name: 'Lưới nội chất',
        role: 'Tổng hợp protein và lipid cho màng và cho chất tiết.',
        attributes: [
          { label: 'Dạng', value: 'Hạt và trơn' },
          { label: 'Vị trí', value: 'Quanh nhân' },
          LM_NO,
        ],
        note:
          'Lớp màng ở đầu ngọn bị mài mòn liên tục nên phải thay thường xuyên; vì vậy lưới nội chất của tế bào biểu mô luôn hoạt động mạnh.',
        color: INK.reticulum,
        offset: [0, -2.7, 0.9],
      },
    ],
    goals: [
      'Chỉ ra hai cực của tế bào biểu mô trên mô hình',
      'Giải thích vì sao vi nhung mao làm tăng khả năng hấp thụ',
      'Nêu vai trò của liên kết chặt trong việc tạo hàng rào',
    ],
    facts: [
      { label: 'Chiều cao tế bào', value: '20–30 µm' },
      { label: 'Vi nhung mao', value: 'Tăng diện tích ~20 lần' },
      { label: 'Bào quan tách được', value: '6' },
    ],
    highlight: {
      label: 'Một tế bào có hai đầu khác nhau',
      body:
        'Đầu ngọn hấp thụ, đầu đáy chuyển chất vào máu, liên kết chặt ngăn không cho chất đi tắt qua khe. Ba chi tiết đó cùng làm nên một lớp hấp thụ một chiều.',
    },
  },

  /* ----------------------------------------------------------- tế bào cơ --- */
  {
    id: 'muscle',
    name: 'Tế bào cơ',
    subtitle: 'Sợi cơ vân',
    cellClass: 'Tế bào nhân thực',
    accent: 'var(--color-accent-deep)',
    where: 'Cơ bám xương — lớp cơ vận động toàn bộ cơ thể.',
    comparison:
      'Khác mọi tế bào còn lại ở chỗ có rất nhiều nhân trong một tế bào, do nhiều tế bào con hợp nhất lúc hình thành.',
    defaultOrganelle: 'myofibril',
    crossSection: true,
    frame: { fill: 0.94, yaw: 0.7, pitch: 0.22, size: [9.4, 2.4, 2.4], center: [0, 0, 0] },
    organelles: [
      {
        id: 'sarcolemma',
        name: 'Màng sợi cơ',
        role: 'Màng sinh chất của sợi cơ, dẫn tín hiệu điện từ dây thần kinh tới.',
        attributes: [
          { label: 'Vai trò', value: 'Dẫn xung điện' },
          { label: 'Chi tiết', value: 'Lõm vào thành ống T' },
          { label: 'Kính quang học', value: 'Thấy ranh giới' },
        ],
        note:
          'Màng sợi cơ lõm sâu vào trong thành các ống T, nhờ đó tín hiệu điện tới được cả những tơ cơ nằm giữa sợi.',
        color: INK.membrane,
        offset: [0, 0, 0],
        shell: true,
      },
      {
        id: 'myofibril',
        name: 'Tơ cơ',
        role: 'Bó sợi protein co ngắn lại để sinh lực; xếp thẳng hàng thành vân ngang.',
        attributes: [
          { label: 'Đường kính', value: 'Khoảng 1 µm' },
          { label: 'Số lượng', value: 'Hàng nghìn mỗi sợi' },
          { label: 'Kính quang học', value: 'Thấy rõ vân ngang' },
        ],
        note:
          'Mỗi tơ cơ là một chuỗi đơn vị co cơ nối tiếp nhau. Các đơn vị này xếp thẳng hàng giữa những tơ cơ cạnh nhau, nên cả sợi cơ hiện lên vân ngang.',
        color: INK.fibril,
        offset: [0, 2.8, 0],
      },
      {
        id: 'nucleus',
        name: 'Nhân',
        role: 'Nhiều nhân nằm sát màng, cùng điều khiển một sợi cơ rất dài.',
        attributes: [
          { label: 'Số lượng', value: 'Hàng trăm mỗi sợi' },
          { label: 'Vị trí', value: 'Sát màng sợi cơ' },
          LM_YES,
        ],
        note:
          'Sợi cơ hình thành do nhiều tế bào con hợp nhất nên giữ lại toàn bộ nhân của chúng. Nhân bị đẩy ra sát màng để nhường chỗ giữa cho tơ cơ.',
        color: INK.nucleus,
        offset: [0, -2.8, 0.8],
      },
      {
        id: 'mitochondria',
        name: 'Ti thể',
        role: 'Cấp ATP liên tục cho tơ cơ co; nằm dày đặc giữa các tơ cơ.',
        attributes: [
          { label: 'Mật độ', value: 'Rất cao' },
          { label: 'Vị trí', value: 'Xen giữa các tơ cơ' },
          LM_FAINT,
        ],
        note:
          'Cơ dùng cho vận động bền có mật độ ti thể cao hơn cơ dùng cho động tác nhanh. Luyện tập sức bền làm mật độ này tăng lên.',
        color: INK.mitochondria,
        offset: [0, 0, 3.0],
      },
      {
        id: 'reticulum',
        name: 'Lưới nội cơ tương',
        role: 'Hệ ống bọc quanh tơ cơ, giữ và giải phóng ion calci.',
        attributes: [
          { label: 'Chứa', value: 'Ion Ca²⁺' },
          { label: 'Vị trí', value: 'Bọc quanh tơ cơ' },
          LM_NO,
        ],
        note:
          'Tín hiệu điện làm lưới nội cơ tương đổ calci ra, calci mở khoá cho tơ cơ co lại. Bơm calci trở vào là lúc cơ giãn.',
        color: INK.reticulum,
        offset: [0, 1.4, -3.0],
      },
    ],
    goals: [
      'Giải thích vì sao sợi cơ có vân ngang',
      'Nêu vì sao một sợi cơ lại có nhiều nhân',
      'Liên hệ mật độ ti thể với sức bền của cơ',
    ],
    facts: [
      { label: 'Chiều dài sợi cơ', value: 'Tới 30 cm' },
      { label: 'Đường kính', value: '10–100 µm' },
      { label: 'Bào quan tách được', value: '5' },
    ],
    highlight: {
      label: 'Vân ngang là kết quả của việc xếp thẳng hàng',
      body:
        'Vân ngang không phải một cấu trúc riêng. Nó hiện ra vì hàng nghìn tơ cơ trong cùng một sợi có các đơn vị co cơ nằm thẳng hàng nhau.',
    },
  },

  /* -------------------------------------------------- tế bào thần kinh --- */
  {
    id: 'neuron',
    name: 'Tế bào thần kinh',
    subtitle: 'Neuron vận động',
    cellClass: 'Tế bào nhân thực',
    accent: 'var(--color-lavender)',
    where: 'Não, tuỷ sống và các dây thần kinh.',
    comparison:
      'Khác tế bào cơ ở chỗ không co được: nó kéo dài ra để truyền tín hiệu, chứ không để sinh lực.',
    defaultOrganelle: 'axon',
    crossSection: false,
    /*
     * Đo theo hình học thật, không lấy dư cho chắc.
     *
     * Khung này từng khai 6,2 đơn vị theo chiều cao trong khi hình học chỉ cao
     * chừng 3,6 — chùm nhánh nhận toả ra tối đa 1,7 quanh thân tế bào. Khung
     * hình khớp bao ngoài đã khai, nên hai đơn vị dư đó đẩy camera ra xa và
     * neuron nổi lềnh bềnh trong một khung gần như trống. Bao ngoài khai dư là
     * cách âm thầm nhất để làm một mẫu vật nhỏ đi.
     */
    frame: { fill: 0.92, yaw: 0.16, pitch: 0.22, size: [13.2, 3.7, 2.3], center: [0.25, 0, 0] },
    organelles: [
      {
        id: 'soma',
        name: 'Thân tế bào',
        role: 'Phần phình chứa nhân, nơi cộng dồn tín hiệu và tổng hợp vật liệu.',
        attributes: [
          { label: 'Đường kính', value: '10–30 µm' },
          { label: 'Vai trò', value: 'Cộng dồn tín hiệu vào' },
          LM_YES,
        ],
        note:
          'Thân neuron cộng tất cả tín hiệu từ các sợi nhánh. Chỉ khi tổng vượt ngưỡng thì xung mới phát ra ở gốc sợi trục.',
        color: INK.soma,
        offset: [-1.6, 2.6, 0.6],
      },
      {
        id: 'nucleus',
        name: 'Nhân',
        role: 'Chứa DNA, điều khiển việc tổng hợp protein cho cả tế bào rất dài này.',
        attributes: [
          { label: 'Vị trí', value: 'Giữa thân tế bào' },
          { label: 'Số lượng', value: 'Một' },
          LM_YES,
        ],
        note:
          'Neuron trưởng thành gần như không phân chia nữa, nên nhân của nó làm việc suốt đời tế bào.',
        color: INK.nucleus,
        offset: [-2.4, -2.6, 1.0],
      },
      {
        id: 'dendrite',
        name: 'Sợi nhánh',
        role: 'Các nhánh ngắn chia nhiều lần, nhận tín hiệu từ neuron khác.',
        attributes: [
          { label: 'Số lượng', value: 'Nhiều, phân nhánh' },
          { label: 'Chiều dài', value: 'Vài trăm µm' },
          { label: 'Kính quang học', value: 'Thấy khi nhuộm bạc' },
        ],
        note:
          'Phân nhánh nhiều làm tăng diện tích tiếp nhận: một neuron có thể nhận tín hiệu từ hàng nghìn neuron khác.',
        color: INK.reticulum,
        offset: [-3.0, 1.6, 0.6],
      },
      {
        id: 'axon',
        name: 'Sợi trục',
        role: 'Một sợi dài duy nhất, dẫn xung điện đi xa khỏi thân tế bào.',
        attributes: [
          { label: 'Chiều dài', value: 'Vài µm tới hơn 1 m' },
          { label: 'Số lượng', value: 'Một mỗi neuron' },
          LM_YES,
        ],
        note:
          'Sợi trục dài nhất ở người chạy từ tuỷ sống xuống ngón chân. Đó là lý do neuron được xem là tế bào dài nhất của cơ thể.',
        color: INK.fibril,
        offset: [0, -2.4, -1.4],
      },
      {
        id: 'myelin',
        name: 'Bao myelin',
        role: 'Các đoạn vỏ cách điện; xung nhảy từ eo Ranvier này sang eo kia.',
        attributes: [
          { label: 'Cấu tạo', value: 'Nhiều lớp màng cuộn' },
          { label: 'Khoảng hở', value: 'Eo Ranvier' },
          LM_YES,
        ],
        note:
          'Trên sợi có myelin, xung không chạy liên tục mà nhảy giữa các eo Ranvier. Nhờ vậy tốc độ dẫn truyền tăng lên nhiều lần.',
        color: INK.golgi,
        offset: [0, 2.5, -1.6],
      },
      {
        id: 'terminal',
        name: 'Cúc xináp',
        role: 'Đầu cuối phình to, giải phóng chất trung gian sang tế bào tiếp theo.',
        attributes: [
          { label: 'Chứa', value: 'Túi chất trung gian' },
          { label: 'Khe xináp', value: '20–40 nm' },
          LM_NO,
        ],
        note:
          'Tín hiệu điện dừng ở cúc xináp và chuyển thành tín hiệu hoá học: chất trung gian khuếch tán qua khe rồi gắn vào tế bào tiếp theo.',
        color: INK.synapse,
        offset: [2.4, -1.8, 1.0],
      },
    ],
    goals: [
      'Chỉ ra ba phần của một neuron và chiều đi của tín hiệu',
      'Giải thích vai trò của bao myelin và của eo Ranvier',
      'Nêu điều xảy ra tại cúc xináp',
    ],
    facts: [
      { label: 'Chiều dài sợi trục', value: 'Vài µm tới hơn 1 m' },
      { label: 'Tốc độ dẫn truyền', value: 'Tới 120 m/s' },
      { label: 'Bào quan tách được', value: '6' },
    ],
    highlight: {
      label: 'Tín hiệu chỉ đi một chiều',
      body:
        'Sợi nhánh nhận, thân cộng dồn, sợi trục dẫn đi, cúc xináp chuyển sang tế bào sau. Trên mô hình, chiều đó chạy từ trái sang phải.',
    },
  },
];

/** Tra theo `params.cell`; giá trị lạ thì mở tế bào động vật. */
export function cellById(id: string | undefined): CellContent {
  return CELLS.find((cell) => cell.id === id) ?? CELLS[0];
}

/**
 * Tra bào quan theo id, luôn trả về một bào quan.
 *
 * `CellStudio` gọi hàm này khi dựng hình: mỗi hàm dựng biết trước danh sách id
 * của tế bào nó dựng, nên id lạ chỉ có thể là lỗi gõ trong file này. Trả về bào
 * quan đầu tiên thay vì `undefined` giữ cho phần dựng hình không phải rải guard
 * ở ba mươi chỗ, và lỗi gõ hiện ra ngay dưới dạng một bào quan sai màu.
 */
export function organelleLookup(cell: CellContent): (id: string) => Organelle {
  const index = new Map<string, Organelle>();
  for (const organelle of cell.organelles) index.set(organelle.id, organelle);
  return (id: string) => index.get(id) ?? cell.organelles[0];
}
