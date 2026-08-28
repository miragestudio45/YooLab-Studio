import { CELLS, type CellContent, type CellId } from '../../biology/cells';
import { HUMAN_BODY_EXPERIENCES } from './human-body';
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
  bacteria: 'cell-bacteria',
};

/** Từ khoá tìm kiếm, không dấu, để truy vấn tiếng Việt khớp được. */
const CELL_KEYWORDS: Record<CellId, string> = {
  animal: 'te bao dong vat nhan thuc bao quan nhan ti the luoi noi chat golgi ribosome',
  plant: 'te bao thuc vat thanh xenlulozo khong bao luc lap quang hop cay',
  'white-blood': 'bach cau trung tinh mien dich thuc bao lysosome hat vi khuan mau',
  epithelial: 'te bao bieu mo tru don ruot non vi nhung mao lien ket chat da',
  muscle: 'te bao co soi co van to co van ngang nhieu nhan sarcolemma',
  neuron: 'te bao than kinh neuron soi truc axon myelin dendrite xinap',
  bacteria: 'te bao vi khuan nhan so prokaryote truc khuan bacteria plasmid roi nucleoid ribosome khang sinh',
};

/** Chủ đề trong môn, dùng cho chip trên thanh viewer. */
const CELL_TOPIC = 'Tế bào';

/**
 * Một mục Thư viện từ một loại tế bào.
 *
 * `summary` là "gặp ở đâu" và `description` là "khác gì loại quen hơn", vì đó là
 * hai câu hỏi đầu tiên một học sinh hỏi khi thấy một loại tế bào mới — và cả hai
 * đều đã có sẵn trong dữ liệu sinh học.
 *
 * Hai ghi chú, theo đúng thứ tự: `highlight` là cơ chế, `curio` là điều khiến
 * học sinh muốn biết cơ chế. Thư viện tô khối thứ nhất màu tím oải hương và khối
 * thứ hai màu hổ phách, và thứ tự do hàm này quyết định chứ không do từng mục —
 * nên không tế bào nào đặt được sự tò mò lên trên phần phải hiểu.
 */
function cellEntry(cell: CellContent): ExperienceManifest {
  return {
    id: `cell-${cell.id}`,
    title: cell.name,
    subtitle: cell.subtitle,
    poetic: cell.poetic,
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
    notes: [cell.highlight, cell.curio],
    context: cell.context,
    keywords: CELL_KEYWORDS[cell.id],
  };
}

export const BIOLOGY_EXPERIENCES: ExperienceManifest[] = [
  /* --------------------------------------------------------- cổ sinh vật --- */
  /*
   * Con T-rex mở màn thư viện, và đó là chủ ý.
   *
   * Đây là mẫu vật duy nhất trong thư viện có năm đoạn hoạt ảnh chọn được trên
   * cùng một bộ xương — đứng yên, chạy, ngoạm, gầm, vung đuôi — nên nó trả lời
   * câu hỏi mà mọi mục khác chỉ trả lời được một nửa: mô hình này *làm* được gì,
   * không phải trông như thế nào. Clip mặc định là `bite`: một con thú săn đang
   * há miệng là hình đầu tiên nói rõ nhất rằng đây không phải ảnh minh hoạ.
   *
   * Sáu điểm chú thích neo vào khớp thật của rig (`bn_Head`, `bn_Jaw`,
   * `bn_Tail04`…), nên nhãn đi theo chuyển động: nhãn "Hàm" vẫn nằm trên hàm khi
   * con vật ngoạm. Đó là điều một ảnh chụp có chú thích không làm được.
   */
  {
    id: 'trex',
    title: 'Khủng long bạo chúa',
    subtitle: 'Tyrannosaurus rex',
    poetic: 'Cỗ máy săn lớn nhất từng đi trên hai chân.',
    subject: 'sinh-hoc',
    topic: 'Cổ sinh vật học',
    kind: 'model-3d',
    status: 'ready',
    summary: 'Năm trạng thái chuyển động trên một bộ xương đầy đủ.',
    description:
      'Bộ xương có 72 khớp, nên cùng một mô hình chuyển được giữa đứng yên, chạy, ngoạm, gầm và vung đuôi. Dùng để chỉ ra cách một loài thú săn hai chân giữ thăng bằng: khối đầu nặng phía trước được đuôi phía sau kéo lại, và trục cơ thể gần như nằm ngang chứ không dựng đứng như hình vẽ cũ.',
    view: {
      type: 'model',
      url: '/asset/T-rex/T-rex.glb',
      preset: 'natural',
      /* `spinSafe` vì con vật dài 12 m và khung này tự xoay: khớp với một góc thôi
         thì đến góc ngang là đầu ra khỏi khung. Xem `spinSafeBox`. */
      framing: { yaw: 1.02, pitch: 0.14, fill: 0.94, poseTime: 0.5, spinSafe: true },
      /* Cả năm đoạn đều có track dịch chuyển trên `bn_Spine`, nên nếu không khoá
         lại thì con vật đi ra khỏi khung trong hai giây. Xem `lockRootMotion`. */
      lockRoot: 'bn_Spine',
      /* Thứ tự đọc: tĩnh trước, di chuyển, rồi mới đến hành vi săn. Clip mặc
         định không theo thứ tự này — xem `defaultClip`. */
      clips: [
        /* `rest` rather than a dedicated glyph: the bee's rail already draws
           "đứng yên" as an arrow settling onto a baseline, and two different
           marks for the same idea in the same rail is one mark too many. */
        { name: 'idle', label: 'Đứng', title: 'Đứng yên — quan sát tư thế nghỉ', icon: 'rest' },
        { name: 'run', label: 'Chạy', title: 'Chạy — trục cơ thể nằm ngang', icon: 'stride' },
        { name: 'bite', label: 'Ngoạm', title: 'Ngoạm — hàm mở và đóng', icon: 'bite' },
        { name: 'roar', label: 'Gầm', title: 'Gầm — lồng ngực và cổ nâng lên', icon: 'roar' },
        { name: 'attack_tail', label: 'Đuôi', title: 'Vung đuôi — đối trọng khi đổi hướng', icon: 'tail' },
      ],
      defaultClip: 'bite',
      /* Neo vào gốc tên khớp, không vào tên đầy đủ: bản xuất glTF thêm hậu tố số
         (`bn_Head.10_10`), và điểm chú thích phải sống qua lần xuất lại sau. */
      anchors: [
        { bone: 'bn_Head', label: 'Hộp sọ', detail: 'Nặng, có hốc rỗng để giảm khối lượng.', side: 'right' },
        { bone: 'bn_Jaw', label: 'Hàm dưới', detail: 'Mở rộng, răng cắm sâu trong xương ổ.', side: 'left' },
        { bone: 'bn_Neck1', label: 'Cổ chữ S', detail: 'Ngắn và dày để giữ nổi khối đầu.', side: 'right' },
        { bone: 'bn_LeftForeArm', label: 'Chi trước', detail: 'Chỉ hai ngón — không dùng để đi.', side: 'left' },
        { bone: 'bn_LeftLeg', label: 'Chi sau', detail: 'Toàn bộ khối lượng dồn lên hai chân.', side: 'left' },
        { bone: 'bn_Tail04', label: 'Đuôi', detail: 'Đối trọng, giữ trục cơ thể nằm ngang.', side: 'right' },
      ],
    },
    rail: { kind: 'thumbnail', thumb: 'trex' },
    parts: [
      { label: 'Hộp sọ', body: 'Dài tới 1,5 m, nhiều hốc rỗng nên nhẹ hơn vẻ ngoài.' },
      { label: 'Hàm và răng', body: 'Răng hình chuông, cắm sâu — để nghiền xương chứ không để cắt.' },
      { label: 'Chi trước', body: 'Rất ngắn, chỉ hai ngón. Không tham gia di chuyển.' },
      { label: 'Chi sau', body: 'Cột trụ chịu toàn bộ khối lượng cơ thể.' },
      { label: 'Đuôi', body: 'Dài và nặng, làm đối trọng cho phần đầu.' },
    ],
    goals: [
      'Chỉ ra vai trò đối trọng của đuôi trên mô hình đang chạy',
      'Giải thích vì sao trục cơ thể nằm ngang thay vì dựng đứng',
      'So sánh tỉ lệ chi trước và chi sau, và nêu hệ quả về cách di chuyển',
    ],
    facts: [
      { label: 'Chiều dài', value: '12–13 m', icon: 'ruler' },
      { label: 'Khối lượng', value: '6–9 tấn', icon: 'weight' },
      { label: 'Thời kỳ', value: 'Cuối kỷ Creta · ~68–66 triệu năm', icon: 'era' },
      { label: 'Nơi tìm thấy', value: 'Tây Bắc Mỹ', icon: 'pin' },
      /* Số ngắn, câu giải thích để trong khối ghi chú. Một giá trị dài hai dòng
         làm cả bảng số đo mất thẳng hàng, và đó là điều duy nhất bảng này phải
         giữ được. */
      { label: 'Lực ngoạm', value: '~35.000 N', icon: 'bite-force' },
      { label: 'Trạng thái', value: '5 đoạn chuyển động', icon: 'clip' },
    ],
    notes: [
      {
        label: 'Vì sao thân nằm ngang',
        body: 'Khối đầu và khối đuôi cân nhau quanh khớp háng, nên cột sống giữ gần như song song với mặt đất. Tư thế dựng đứng như hình vẽ thế kỷ trước sẽ làm con vật mất thăng bằng ngay khi bước.',
      },
      {
        label: 'Bạn có biết',
        body: 'Lực ngoạm khoảng 35.000 N là mạnh nhất trong các loài từng sống trên cạn — đủ để nghiền vỡ xương, và đó là lý do răng của nó có tiết diện hình chuông chứ không mỏng như dao.',
      },
    ],
    context: [
      'Sinh học 7 — Sự đa dạng của động vật có xương sống',
      'Địa lý & Trái Đất — hoá thạch và các kỷ địa chất',
      'Bài tập so sánh: chi trước của T-rex, gà và người',
    ],
    credits: [
      {
        author: 'LasquetiSpice (Sketchfab)',
        license: 'CC BY 4.0',
        source: 'https://sketchfab.com/3d-models/animated-tyrannosaurus-rex-dinosaur-running-loop-38007d947ae74dea83988cb0b08ee053',
        notice: 'Animated Tyrannosaurus Rex Dinosaur Running Loop — ghi công theo giấy phép CC BY 4.0.',
      },
    ],
    keywords: 'khung long bao chua t-rex trex tyrannosaurus rex co sinh vat hoa thach dinosaur ngoam gam duoi',
  },
  {
    id: 'bee',
    title: 'Ong mật',
    subtitle: 'Apis mellifera',
    poetic: 'Toàn bộ động cơ bay nằm trong một khoang duy nhất.',
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
      { label: 'Chiều dài cơ thể', value: '12–15 mm', icon: 'ruler' },
      { label: 'Nhịp cánh', value: '~230 lần mỗi giây', icon: 'pulse' },
      { label: 'Tốc độ bay', value: '20–25 km/h', icon: 'speed' },
      { label: 'Số phần cơ thể', value: '3 — đầu, ngực, bụng', icon: 'layers' },
      { label: 'Trạng thái', value: '3 — đứng yên, bay tại chỗ, bay đi', icon: 'clip' },
      { label: 'Xương', value: 'Có — mô hình biến dạng theo khớp', icon: 'bone' },
    ],
    notes: [
      {
        label: 'Vì sao cánh gắn ở ngực',
        body: 'Cơ bay chiếm gần như toàn bộ thể tích ngực. Đó là lý do ngực ong to và cứng hơn hẳn phần bụng nhiều đốt.',
      },
      {
        label: 'Bạn có biết',
        body: 'Cánh ong đập nhanh hơn tốc độ mà thần kinh có thể phát từng nhịp lệnh. Cơ ngực co theo cộng hưởng đàn hồi của chính lồng ngực, chứ không theo từng xung thần kinh riêng lẻ.',
      },
    ],
    context: [
      'Sinh học 7 — Ngành Chân khớp, lớp Sâu bọ',
      'Thực tế: vai trò thụ phấn trong nông nghiệp',
      'Vật lý — cộng hưởng và dao động cưỡng bức',
    ],
    keywords: 'ong bee mat con trung canh bay giai phau apis',
  },
  {
    id: 'clownfish',
    title: 'Cá cảnh biển',
    subtitle: 'Hệ vây và chuyển động',
    poetic: 'Hình dáng của một con cá là bản đồ nơi nó sống.',
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
    facts: [
      { label: 'Số nhóm vây', value: '5 — lưng, ngực, bụng, hậu môn, đuôi', icon: 'layers' },
      { label: 'Mặt cắt thân', value: 'Dẹp hai bên, cao hơn rộng', icon: 'ruler' },
      { label: 'Môi trường', value: 'Rạn san hô nước ấm', icon: 'pin' },
      { label: 'Chuyển động', value: '1 vòng bơi liên tục', icon: 'clip' },
    ],
    notes: [
      {
        label: 'Hình dạng nói lên môi trường sống',
        body: 'Thân dẹp và vây ngực rộng là bộ đặc điểm của cá sống trong rạn — nơi cần rẽ gấp hơn là bơi nhanh.',
      },
      {
        label: 'Bạn có biết',
        body: 'Cá bơi nhanh ngoài khơi có thân hình thoi và vây đuôi hình liềm; đổi một trong hai đặc điểm đó là đổi luôn nơi con cá sống được.',
      },
    ],
    context: [
      'Sinh học 7 — lớp Cá, cấu tạo ngoài thích nghi với môi trường nước',
      'Vật lý — lực cản của chất lưu và hình dạng khí động',
      'Bài tập so sánh: cá rạn và cá đại dương',
    ],
    keywords: 'ca fish canh bien vay chuyen dong hinh thai',
  },
  {
    id: 'jellyfish',
    title: 'Sứa biển',
    subtitle: 'Ba lớp cơ thể trong suốt',
    poetic: 'Một cơ thể mỏng đến mức không cần phổi, cũng không cần tim.',
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
    facts: [
      { label: 'Lớp vật liệu', value: '3 lớp trong suốt lồng nhau', icon: 'layers' },
      { label: 'Tỉ lệ nước', value: '~95% khối lượng cơ thể', icon: 'drop' },
      { label: 'Cách di chuyển', value: 'Co bóp màng, đẩy nước ra sau', icon: 'pulse' },
      { label: 'Cơ quan hô hấp', value: 'Không có — khuếch tán qua thành', icon: 'thermo' },
    ],
    notes: [
      {
        label: 'Không có phổi, không có tim',
        body: 'Cơ thể mỏng đến mức oxy khuếch tán trực tiếp qua thành. Đó là lý do sứa không cần cơ quan hô hấp hay tuần hoàn.',
      },
      {
        label: 'Bạn có biết',
        body: 'Khuếch tán chỉ đủ nuôi một lớp mô dày vài milimét. Mọi con vật lớn hơn thế đều buộc phải có một hệ tuần hoàn — giới hạn vật lý này là lý do tim tồn tại.',
      },
    ],
    context: [
      'Sinh học 7 — ngành Ruột khoang',
      'Hoá học — khuếch tán và nồng độ chất tan',
      'Thực tế: sứa trong lưới đánh bắt và ở vùng biển ven bờ',
    ],
    keywords: 'sua jellyfish bien trong suot lop co the',
  },

  /* -------------------------------------------------------- cơ thể người --- */
  /*
   * Mười hai nội quan Human Reference Atlas, trong `subjects/human-body.ts`.
   *
   * Đặt sau bốn con vật và trước tế bào, theo đúng thứ tự mà nhãn của môn này đã
   * in ra từ lâu — "Cơ thể · Tế bào · Vi sinh" — một lời hứa mà trước đợt này kệ
   * Sinh học chỉ giữ được hai phần cuối.
   *
   * Chúng nằm ở file riêng vì đó chính là lý do manifest được tách ra: một kệ
   * dài ra thì không được làm mọi mục khác dịch chỗ trong diff. Toàn bộ lý do
   * chọn đúng bộ mesh này — và vì sao chín file trong `reference-sources/anatomy`
   * bị loại — viết trong đầu file đó.
   */
  ...HUMAN_BODY_EXPERIENCES,

  /* ------------------------------------------------------------- tế bào --- */
  ...CELLS.map(cellEntry),

  /* -------------------------------------------------------------- vi sinh --- */
  {
    id: 'gram-positive-wall',
    title: 'Vách tế bào Gram dương',
    subtitle: 'Peptidoglycan',
    poetic: 'Một lớp vỏ dày quyết định màu của cả một phép thử.',
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
    facts: [
      { label: 'Độ dày vách', value: '20–80 nm — dày gấp ~10 lần Gram âm', icon: 'scale-micro' },
      { label: 'Thành phần chính', value: 'Peptidoglycan (murein)', icon: 'dna' },
      { label: 'Kính hiển vi', value: 'Chỉ thấy được bằng kính điện tử', icon: 'scale-micro' },
      { label: 'Nguồn', value: 'NIH 3D · 3DPX-010752 · Public Domain', icon: 'pin' },
    ],
    notes: [
      {
        label: 'Vì sao phép nhuộm Gram hoạt động',
        body: 'Lớp peptidoglycan dày giữ lại phức tím tinh thể khi tẩy bằng cồn; vách Gram âm mỏng hơn nên mất màu.',
      },
      {
        label: 'Bạn có biết',
        body: 'Penicillin không phá màng mà chặn enzyme khâu peptidoglycan lại với nhau. Vì thế nó có hiệu lực rõ nhất trên đúng lớp vách đang nhìn thấy ở đây.',
      },
    ],
    context: [
      'Sinh học 10 — vi sinh vật và cấu tạo tế bào nhân sơ',
      'Thực tế: cơ sở của phép nhuộm Gram trong xét nghiệm',
      'Liên hệ: cơ chế tác dụng của nhóm kháng sinh β-lactam',
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
