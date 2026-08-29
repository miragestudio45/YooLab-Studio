import type { Credit, ExperienceManifest, MarkId } from '../types';

/**
 * Sinh học · Cơ thể người — mười hai nội quan từ Human Reference Atlas.
 *
 * Đây là kệ trả lại lời hứa mà thanh chọn môn đã in ra từ đầu: nhãn của Sinh học
 * là “Cơ thể · Tế bào · Vi sinh”, mà trước đợt này thư viện chỉ có hai phần sau.
 *
 * ### Vì sao là bộ mesh này chứ không phải bộ đã có trong máy
 *
 * `reference-sources/anatomy/public/models/` cũng có chín nội quan, sẵn trên đĩa,
 * và chúng **không** được dùng. Không một file nào trong chín file đó mang
 * `asset.extras`, repo chứa chúng không khai báo giấy phép, README của nó là bản
 * `vinext-starter` chưa sửa — nên tác giả không rõ, nguồn không rõ, quyền dùng
 * cho mục đích thương mại không rõ. PRODUCT.md không cho phép phát hành trong
 * điều kiện đó, và `types.ts` viết thẳng ra thành luật: *một tài sản chưa xác
 * minh được giấy phép thì không có mục trong manifest.*
 *
 * Mười hai mesh dưới đây thì xác minh được đến từng byte. Chúng là Human
 * Reference Atlas v1.2 của HuBMAP, **CC BY 4.0**, và ba trong số đó có checksum
 * SHA-256 công bố ở nguồn trung gian — đã đối chiếu với file thật trong
 * `public/`, khớp cả ba. Toàn bộ dấu vết ghi trong THIRD_PARTY_ASSETS.md.
 *
 * ### Ba điều bộ này cần mà một mesh tĩnh thường không cần
 *
 *   - **`preset: 'organ'`.** Mỗi mesh mang màu giải phẫu riêng của nó — gan gần
 *     như đen, túi mật xanh thẫm, thận có ba vật liệu cho vỏ, cột và tháp. Preset
 *     `tissue` sẽ thay tất cả bằng một màu hồng và xoá đúng cái thông tin đó, còn
 *     `natural` để bề mặt khô như đất sét. Xem `applyPreset`.
 *   - **Hình vẽ, không phải ảnh dựng, cho hàng của rail.** Mười hai mesh là 6,4 MB;
 *     nướng ảnh thumbnail nghĩa là tải cả 6,4 MB chỉ để vẽ mười hai ô 46 px của
 *     một kệ chưa ai bấm vào. Xem `LibraryMark`.
 *   - **Tên gọi đúng phạm vi mesh.** Ba file được nguồn trung gian nói rõ là
 *     *một phần* của cơ quan: `small_intestine.glb` là hồi tràng, `thymus.glb` là
 *     thùy trái của tuyến ức. Tiêu đề ở đây gọi đúng như vậy chứ không gọi thành
 *     “ruột non” và “tuyến ức”, vì một mô hình dạy học nói sai phạm vi thì tệ hơn
 *     là không có mô hình.
 *
 * Tên file giữ nguyên như nguồn trung gian đặt, không đổi theo tiêu đề tiếng
 * Việt: checksum đã công bố gắn với đúng những tên đó, và một lần đổi tên nữa là
 * một lớp nữa giữa file trên đĩa và bằng chứng về nó.
 */

const HRA_ROOT = '/asset/Library/Biology/anatomy';

/**
 * Một khối ghi công cho cả mười hai mục.
 *
 * CC BY 4.0 buộc phải nêu tác giả, giấy phép và nguồn. Viết một lần rồi tham
 * chiếu là cách duy nhất để mười hai mục không thể lệch nhau ở chi tiết nào —
 * một mục ghi thiếu giấy phép giữa mười một mục ghi đủ là một vi phạm, không
 * phải một lỗi chính tả.
 */
const HRA_CREDIT: Credit[] = [
  {
    author: 'Human Reference Atlas (HuBMAP) — Schlehlein, Herr II, Quardokus, Bueckle, Börner',
    license: 'CC BY 4.0',
    source: 'https://humanatlas.io/3d-reference-library',
    notice:
      'Mô hình nội quan 3D © Human Reference Atlas (CC BY 4.0), HuBMAP — bộ đối tượng tham chiếu Visible Human Male, bản phát hành v1.2. Nén Meshopt, hình học không sửa.',
  },
];

const TOPIC = 'Cơ thể người';

/** Chung cho cả kệ: cùng một phòng dựng, cùng một cách khung hình. */
type OrganDraft = Omit<ExperienceManifest, 'subject' | 'topic' | 'kind' | 'status' | 'credits' | 'rail' | 'view'> & {
  file: string;
  mark: MarkId;
  yaw: number;
  pitch: number;
  fill: number;
  targetY?: number;
  /** Material stems to fade, for the one organ whose parts are nested. See `shell`. */
  shell?: string[];
};

/**
 * Từ bản nháp thành mục manifest.
 *
 * Mười hai mục này khác nhau đúng ở nội dung sinh học và ở góc đặt camera; mọi
 * thứ còn lại — môn, chủ đề, loại, trạng thái, preset vật liệu, khối ghi công —
 * là hằng số của cả kệ. Viết chúng ra mười hai lần là mười hai cơ hội để một mục
 * lệch khỏi mười một mục kia, và cách lệch tệ nhất là lệch ở `credits`.
 */
function organEntry({ file, mark, yaw, pitch, fill, targetY, shell, ...content }: OrganDraft): ExperienceManifest {
  return {
    ...content,
    subject: 'sinh-hoc',
    topic: TOPIC,
    kind: 'model-3d',
    status: 'ready',
    view: {
      type: 'model',
      url: `${HRA_ROOT}/${file}`,
      preset: 'organ',
      framing: { yaw, pitch, fill, targetY },
      shell,
    },
    rail: { kind: 'mark', mark },
    credits: HRA_CREDIT,
  };
}

/**
 * Thứ tự đọc là một vòng cơ thể, không phải thứ tự bảng chữ cái.
 *
 * Tim → phổi vì hai vòng tuần hoàn nối vào nhau; rồi não và mắt (điều khiển và
 * cảm nhận); rồi trọn đường tiêu hoá theo đúng chiều thức ăn đi, gan–túi
 * mật–tụy đứng trước hồi tràng vì cả ba đổ dịch vào đoạn ruột ngay sau chúng;
 * rồi thận; rồi hai cơ quan lympho. Một học sinh cuộn hết kệ này là đã đi một
 * lượt qua sáu hệ cơ quan theo trình tự mà sách giáo khoa dạy chúng.
 */
export const HUMAN_BODY_EXPERIENCES: ExperienceManifest[] = [
  organEntry({
    id: 'organ-heart',
    file: 'heart.glb',
    mark: 'organ-heart',
    title: 'Tim',
    subtitle: 'Cor',
    poetic: 'Một cái bơm không được phép nghỉ một phút nào.',
    summary: 'Bốn buồng, hai vòng tuần hoàn, hai bộ van trên cùng khối cơ.',
    description:
      'Mô hình tham chiếu của tim người, có cả van hai lá và van động mạch chủ dựng riêng. Dùng để chỉ ra điều mà hình vẽ phẳng luôn làm mờ: hai nửa tim không đối xứng. Nửa phải chỉ đẩy máu qua phổi ở ngay bên cạnh, nửa trái phải đẩy máu đi khắp cơ thể — nên thành tâm thất trái dày gấp khoảng ba lần thành tâm thất phải, và độ dày đó đọc được trên mô hình.',
    yaw: 0.68,
    pitch: 0.16,
    fill: 0.88,
    parts: [
      { label: 'Tâm thất trái', body: 'Buồng thành dày nhất — đẩy máu vào vòng tuần hoàn lớn.' },
      { label: 'Tâm thất phải', body: 'Thành mỏng hơn, chỉ cần đẩy máu qua phổi.' },
      { label: 'Tâm nhĩ', body: 'Hai buồng trên, nhận máu về trước khi dồn xuống thất.' },
      { label: 'Van hai lá', body: 'Chặn máu chảy ngược từ thất trái lên nhĩ trái.' },
      { label: 'Van động mạch chủ', body: 'Mở một chiều, vào động mạch lớn nhất cơ thể.' },
    ],
    goals: [
      'Chỉ ra tâm thất trái trên mô hình và giải thích vì sao thành nó dày nhất',
      'Lần theo đường máu qua bốn buồng và hai bộ van',
      'Phân biệt vòng tuần hoàn phổi với vòng tuần hoàn cơ thể',
    ],
    facts: [
      { label: 'Khối lượng', value: '250–350 g ở người trưởng thành', icon: 'weight' },
      { label: 'Kích thước', value: 'Xấp xỉ một bàn tay nắm lại', icon: 'ruler' },
      { label: 'Vị trí', value: 'Trung thất, sau xương ức', icon: 'pin' },
      { label: 'Lưu lượng lúc nghỉ', value: '~5 L máu mỗi phút', icon: 'drop' },
      { label: 'Nhịp lúc nghỉ', value: '60–100 lần mỗi phút', icon: 'pulse' },
      { label: 'Số van', value: '4 — hai nhĩ-thất, hai động mạch', icon: 'layers' },
    ],
    notes: [
      {
        label: 'Vì sao hai nửa tim không đối xứng',
        body: 'Cùng một lượng máu đi qua cả hai nửa mỗi phút, nhưng nửa phải chỉ phải thắng trở lực của phổi ngay cạnh nó, còn nửa trái phải thắng trở lực của toàn bộ cơ thể. Áp suất khác nhau khoảng năm lần, và thành cơ dày lên đúng theo tỉ lệ đó.',
      },
      {
        label: 'Bạn có biết',
        body: 'Tim đập khoảng 2,5 tỉ lần trong một đời người và không có ngày nghỉ nào. Nó làm được vì cơ tim tự nghỉ giữa hai nhịp: ở nhịp nghỉ, khoảng hai phần ba mỗi chu kỳ là lúc cơ tim đang giãn.',
      },
    ],
    context: [
      'Sinh học 8 — Tuần hoàn máu và lưu thông bạch huyết',
      'Vật lý — áp suất trong chất lỏng và công của bơm',
      'Thực tế: hai con số của một lần đo huyết áp là gì',
    ],
    keywords: 'tim heart co the nguoi noi quan tuan hoan tam that tam nhi van hai la dong mach chu cor',
  }),
  organEntry({
    id: 'organ-lungs',
    file: 'lungs.glb',
    mark: 'organ-lungs',
    title: 'Phổi',
    subtitle: 'Pulmones',
    poetic: 'Diện tích của một sân tennis, gấp gọn trong một lồng ngực.',
    summary: 'Hai lá phổi cùng khí quản, sụn phế quản và chỗ chia đôi.',
    description:
      'Mô hình gồm cả đường dẫn khí: khí quản, vòng sụn giữ nó không xẹp, và carina — chỗ khí quản chia thành hai phế quản chính. Đó là lý do nên xem mô hình này trước khi học phế nang: hình dạng của hai lá phổi là hình dạng của cái cây dẫn khí bên trong chúng, và lá phổi trái nhỏ hơn không phải vì yếu hơn mà vì tim chiếm chỗ.',
    yaw: 0.34,
    pitch: 0.12,
    fill: 0.9,
    parts: [
      { label: 'Khí quản', body: 'Ống dẫn khí chính, có vòng sụn giữ luôn mở.' },
      { label: 'Carina', body: 'Chỗ khí quản chia thành hai phế quản chính.' },
      { label: 'Phổi phải', body: 'Ba thùy — lớn hơn phổi trái.' },
      { label: 'Phổi trái', body: 'Hai thùy, có khuyết tim ở mặt trong.' },
      { label: 'Rốn phổi', body: 'Nơi phế quản, mạch máu và thần kinh đi vào.' },
    ],
    goals: [
      'Chỉ ra khí quản, carina và hai phế quản chính trên mô hình',
      'Giải thích vì sao phổi trái chỉ có hai thùy',
      'Liên hệ hình cây phân nhánh của đường dẫn khí với diện tích trao đổi khí',
    ],
    facts: [
      { label: 'Diện tích trao đổi', value: '70–100 m² — cỡ một sân tennis', icon: 'surface' },
      { label: 'Số phế nang', value: '~300–500 triệu', icon: 'scale-micro' },
      { label: 'Khí mỗi nhịp thở', value: '~0,5 L lúc nghỉ', icon: 'drop' },
      { label: 'Nhịp thở lúc nghỉ', value: '12–18 lần mỗi phút', icon: 'pulse' },
      { label: 'Số thùy', value: '3 bên phải, 2 bên trái', icon: 'layers' },
      { label: 'Đường dẫn khí', value: 'Khí quản → phế quản → phế nang', icon: 'pin' },
    ],
    notes: [
      {
        label: 'Vì sao phải phân nhánh nhiều lần đến thế',
        body: 'Khuếch tán chỉ đủ nhanh trên khoảng cách rất ngắn, nên diện tích tiếp xúc phải cực lớn còn thành phải cực mỏng. Cách duy nhất nhét 100 m² vào lồng ngực là chia ống dẫn khí khoảng 23 lần, mỗi lần thành hai — kết thúc ở những túi chỉ dày một lớp tế bào.',
      },
      {
        label: 'Bạn có biết',
        body: 'Phổi không có cơ nào tự làm nó nở ra. Cơ hoành và cơ liên sườn làm lồng ngực rộng ra, áp suất trong khoang màng phổi giảm, và không khí bị đẩy vào từ bên ngoài. Hít vào là một việc của áp suất khí quyển.',
      },
    ],
    context: [
      'Sinh học 8 — Hô hấp và các cơ quan hô hấp',
      'Hoá học — khuếch tán và áp suất riêng phần của chất khí',
      'Thực tế: vì sao khói thuốc phá đúng lớp thành mỏng này',
    ],
    keywords: 'phoi lungs khi quan phe quan carina hop hap phe nang co the nguoi pulmones',
  }),
  organEntry({
    id: 'organ-brain',
    file: 'brain.glb',
    mark: 'organ-brain',
    title: 'Não',
    subtitle: 'Encephalon',
    poetic: 'Hai phần trăm khối lượng cơ thể, một phần năm lượng oxy.',
    summary: 'Đại não, tiểu não và thân não trên một khối tham chiếu.',
    description:
      'Mô hình tham chiếu của não người, có cả hành khứu và giao thoa thị giác — hai mốc cho thấy các dây thần kinh sọ đi ra từ đâu. Dùng để chỉ ra vì sao vỏ não gấp khúc: phần làm việc là lớp vỏ ngoài dày chừng 2,5 mm, nên cách duy nhất để tăng diện tích lớp đó mà không tăng thể tích hộp sọ là gấp nó lại.',
    yaw: 0.9,
    pitch: 0.2,
    fill: 0.88,
    parts: [
      { label: 'Đại não', body: 'Hai bán cầu, phần gấp khúc chiếm phần lớn khối não.' },
      { label: 'Vỏ não', body: 'Lớp ngoài dày ~2,5 mm — nơi thân neuron tập trung.' },
      { label: 'Tiểu não', body: 'Khối riêng phía sau dưới, giữ thăng bằng và phối hợp.' },
      { label: 'Thân não', body: 'Nối não với tuỷ sống, điều khiển thở và nhịp tim.' },
      { label: 'Giao thoa thị giác', body: 'Chỗ hai dây thần kinh thị giác bắt chéo nhau.' },
    ],
    goals: [
      'Chỉ ra đại não, tiểu não và thân não trên mô hình',
      'Giải thích vì sao vỏ não phải gấp khúc',
      'Nêu một chức năng sống còn do thân não giữ',
    ],
    facts: [
      { label: 'Khối lượng', value: '1,3–1,4 kg ở người trưởng thành', icon: 'weight' },
      { label: 'Độ dày vỏ não', value: '~2,5 mm', icon: 'ruler' },
      { label: 'Số neuron', value: '~86 tỉ', icon: 'scale-micro' },
      { label: 'Phần năng lượng', value: '~20% lượng oxy toàn cơ thể', icon: 'sun' },
      { label: 'Ba phần chính', value: 'Đại não, tiểu não, thân não', icon: 'layers' },
      { label: 'Lưu lượng máu', value: '~0,75 L mỗi phút', icon: 'drop' },
    ],
    notes: [
      {
        label: 'Vì sao bề mặt phải gấp khúc',
        body: 'Chỉ lớp vỏ ngoài chứa thân neuron, nên năng lực xử lý tỉ lệ với diện tích chứ không với thể tích. Muốn tăng diện tích trong một hộp sọ có sẵn thì phải gấp — và đó là lý do những loài có vỏ não trơn nhẵn cũng là những loài có vỏ não nhỏ.',
      },
      {
        label: 'Bạn có biết',
        body: 'Não không có nguồn dự trữ năng lượng nào của riêng nó. Ngưng cấp máu chừng mười giây là mất ý thức, và đó là lý do cơ thể ưu tiên giữ huyết áp lên não trước mọi việc khác.',
      },
    ],
    context: [
      'Sinh học 8 — Thần kinh và giác quan',
      'Vật lý — tỉ lệ diện tích trên thể tích khi hình dạng thay đổi',
      'Thực tế: vì sao chóng mặt khi đứng lên quá nhanh',
    ],
    keywords: 'nao brain dai nao tieu nao than nao vo nao neuron than kinh co the nguoi encephalon',
  }),
  organEntry({
    id: 'organ-eye',
    file: 'eye.glb',
    mark: 'organ-eye',
    title: 'Mắt',
    subtitle: 'Bulbus oculi',
    poetic: 'Một máy ảnh tự lấy nét bằng cách đổi hình dạng thấu kính.',
    summary: 'Củng mạc, thể mi, ora serrata và khoang thuỷ dịch, dựng rời.',
    description:
      'Mô hình cầu mắt trái với các lớp dựng riêng: củng mạc, kết mạc, thể mi, khoang thuỷ dịch và ora serrata — mép trước của võng mạc. Củng mạc ở đây được dựng trong suốt, vì nó là lớp ngoài cùng bọc kín bốn lớp kia; nhìn xuyên qua nó mới thấy được vòng thể mi và mép ora serrata nằm ở đâu. Đó là chỗ mô hình này trả lời được câu hỏi mà hình vẽ phẳng không trả lời được: mắt lấy nét không bằng cách di chuyển thấu kính như máy ảnh, mà bằng cách để thể mi bóp cho thể thuỷ tinh phồng lên.',
    yaw: 1.2,
    pitch: 0.08,
    fill: 0.84,
    /* Like the kidney: the parts are nested, so the outermost one has to be seen
       through rather than at. See the `shell` field on the model view. */
    shell: ['VH_M_sclera'],
    parts: [
      { label: 'Củng mạc', body: 'Lớp trắng bên ngoài, giữ hình dạng cầu mắt — dựng trong suốt để nhìn vào trong.' },
      { label: 'Kết mạc', body: 'Màng mỏng trong suốt phủ mặt trước củng mạc.' },
      { label: 'Thể mi', body: 'Vòng cơ bóp thể thuỷ tinh để đổi độ cong.' },
      { label: 'Khoang thuỷ dịch', body: 'Dịch trong ở phía trước, giữ áp suất nội nhãn.' },
      { label: 'Ora serrata', body: 'Mép trước của võng mạc — nơi lớp cảm quang kết thúc.' },
    ],
    goals: [
      'Chỉ ra củng mạc, thể mi và ora serrata trên mô hình',
      'Giải thích mắt lấy nét bằng cách nào, khác máy ảnh ở đâu',
      'Nêu vai trò của thuỷ dịch với áp suất nội nhãn',
    ],
    facts: [
      { label: 'Đường kính', value: '~24 mm ở người trưởng thành', icon: 'ruler' },
      { label: 'Tế bào que', value: '~120 triệu — nhìn trong tối', icon: 'scale-micro' },
      { label: 'Tế bào nón', value: '~6 triệu — nhìn màu', icon: 'scale-micro' },
      { label: 'Cách lấy nét', value: 'Thể mi đổi độ cong thể thuỷ tinh', icon: 'layers' },
      { label: 'Áp suất nội nhãn', value: '10–21 mmHg', icon: 'drop' },
      { label: 'Cơ vận nhãn', value: '6 cơ cho mỗi mắt', icon: 'geometry' },
    ],
    notes: [
      {
        label: 'Vì sao mắt không lấy nét như máy ảnh',
        body: 'Máy ảnh dịch cả thấu kính ra xa hay lại gần cảm biến. Cầu mắt không có chỗ để làm thế, nên nó đổi tiêu cự thay vì đổi khoảng cách: thể mi co lại thì thể thuỷ tinh phồng lên và hội tụ mạnh hơn. Thấu kính đó cứng dần theo tuổi, và đó chính là lão thị.',
      },
      {
        label: 'Bạn có biết',
        body: 'Ảnh trên võng mạc bị lộn ngược và trái phải đảo nhau. Não học cách đọc nó ngay từ những tháng đầu, nên cái “đúng chiều” mà ta thấy là một thói quen của não chứ không phải một tính chất của quang học.',
      },
    ],
    context: [
      'Sinh học 8 — Cơ quan phân tích thị giác',
      'Vật lý 9 — thấu kính hội tụ, tiêu cự và tật của mắt',
      'Thực tế: vì sao kính lão và kính cận là hai loại thấu kính khác nhau',
    ],
    keywords: 'mat eye cau mat cung mac the mi vong mac thuy dich thi giac co the nguoi bulbus oculi',
  }),
  organEntry({
    id: 'organ-liver',
    file: 'liver.glb',
    mark: 'organ-liver',
    title: 'Gan',
    subtitle: 'Hepar',
    poetic: 'Nhà máy hoá chất duy nhất trong cơ thể tự mọc lại được.',
    summary: 'Hai thuỳ lệch nhau, kèm dây chằng gan – tá tràng.',
    description:
      'Mô hình gan người, gồm cả vùng trần — phần mặt gan áp trực tiếp vào cơ hoành và không có màng bụng phủ — cùng dây chằng gan – tá tràng. Gan là cơ quan nội tạng lớn nhất và cũng là cơ quan duy nhất ở người tái tạo lại được khối lượng đã mất, và mô hình cho thấy vì sao hai thuỳ của nó lệch nhau nhiều đến thế.',
    yaw: 0.58,
    pitch: 0.22,
    fill: 0.9,
    parts: [
      { label: 'Thuỳ phải', body: 'Lớn hơn hẳn thuỳ trái, chiếm phần lớn khối gan.' },
      { label: 'Thuỳ trái', body: 'Nhỏ, vắt sang bên trái phía trước dạ dày.' },
      { label: 'Vùng trần', body: 'Mặt áp vào cơ hoành, không có màng bụng phủ.' },
      { label: 'Dây chằng gan – tá tràng', body: 'Bó mang ống mật, động mạch gan và tĩnh mạch cửa.' },
    ],
    goals: [
      'Chỉ ra hai thuỳ gan và nêu vì sao chúng lệch nhau',
      'Giải thích vai trò của tĩnh mạch cửa với thức ăn vừa hấp thu',
      'Nêu ba việc khác nhau mà gan làm cùng lúc',
    ],
    facts: [
      { label: 'Khối lượng', value: '1,4–1,6 kg — nội tạng lớn nhất', icon: 'weight' },
      { label: 'Lưu lượng máu', value: '~1,5 L mỗi phút', icon: 'drop' },
      { label: 'Vị trí', value: 'Hạ sườn phải, dưới cơ hoành', icon: 'pin' },
      { label: 'Số chức năng đã biết', value: 'Hơn 500', icon: 'layers' },
      { label: 'Tái tạo', value: 'Có — mô gan mọc lại được', icon: 'dna' },
      { label: 'Mật tiết mỗi ngày', value: '~0,5–1 L', icon: 'drop' },
    ],
    notes: [
      {
        label: 'Vì sao gan nhận máu từ hai đường',
        body: 'Ngoài động mạch gan mang máu giàu oxy, gan còn nhận tĩnh mạch cửa — toàn bộ máu vừa đi qua ruột. Nghĩa là mọi thứ hấp thu từ thức ăn phải qua gan trước khi đến bất kỳ cơ quan nào khác. Đó là lý do gan là nơi giải độc, và cũng là lý do gan chịu tổn thương đầu tiên.',
      },
      {
        label: 'Bạn có biết',
        body: 'Cắt bỏ tới hai phần ba khối gan thì phần còn lại có thể mọc lại gần đủ khối lượng cũ trong vài tuần. Đó là điều mà tim, não hay thận không làm được, và là nền của việc ghép gan từ người cho còn sống.',
      },
    ],
    context: [
      'Sinh học 8 — Tiêu hoá và chuyển hoá vật chất',
      'Hoá học — phản ứng chuyển hoá và khái niệm giải độc',
      'Thực tế: vì sao rượu và nhiều loại thuốc đều “tính liều theo gan”',
    ],
    keywords: 'gan liver thuy gan tinh mach cua mat tieu hoa giai doc tai tao co the nguoi hepar',
  }),
  organEntry({
    id: 'organ-gallbladder',
    file: 'gallbladder.glb',
    mark: 'organ-gallbladder',
    title: 'Túi mật',
    subtitle: 'Vesica biliaris',
    poetic: 'Không sản xuất gì cả — chỉ cô đặc và chờ đúng lúc.',
    summary: 'Túi trữ mật nằm áp mặt dưới thuỳ gan phải.',
    description:
      'Túi mật không tạo ra mật; gan tạo ra mật liên tục còn túi mật cô đặc và giữ nó lại cho đến khi có bữa ăn nhiều chất béo. Mô hình nhỏ này đáng xem cạnh mô hình gan vì nó trả lời một câu hỏi thực tế: cắt túi mật rồi người ta vẫn tiêu hoá được chất béo, chỉ là mật chảy xuống ruột đều đều thay vì dồn thành từng đợt.',
    yaw: 0.8,
    pitch: 0.14,
    fill: 0.82,
    parts: [
      { label: 'Thân túi mật', body: 'Khoang trữ, cô đặc mật lên nhiều lần.' },
      { label: 'Cổ túi mật', body: 'Chỗ hẹp nối vào ống túi mật.' },
      { label: 'Ống túi mật', body: 'Đưa mật ra ống mật chủ khi túi bóp lại.' },
    ],
    goals: [
      'Nêu đúng việc túi mật làm và việc nó không làm',
      'Giải thích vì sao mật cần được dồn thành đợt chứ không chảy đều',
      'Dự đoán điều gì thay đổi sau khi cắt túi mật',
    ],
    facts: [
      { label: 'Thể tích', value: '30–50 mL', icon: 'drop' },
      { label: 'Chiều dài', value: '7–10 cm', icon: 'ruler' },
      { label: 'Vị trí', value: 'Mặt dưới thuỳ gan phải', icon: 'pin' },
      { label: 'Vai trò', value: 'Cô đặc và trữ mật, không tiết mật', icon: 'layers' },
      { label: 'Mức cô đặc', value: 'Gấp khoảng 5–10 lần', icon: 'scale-micro' },
    ],
    notes: [
      {
        label: 'Vì sao mật phải dồn thành từng đợt',
        body: 'Mật không tiêu hoá chất béo mà nhũ hoá nó: cắt các giọt lớn thành vô số giọt nhỏ để enzyme có đủ diện tích làm việc. Việc đó chỉ cần khi có chất béo trong ruột, nên cơ thể trữ sẵn một liều đậm rồi bơm ra đúng lúc, thay vì tiết loãng suốt ngày.',
      },
      {
        label: 'Bạn có biết',
        body: 'Sỏi mật phần lớn là cholesterol kết tinh ra khỏi mật đã bị cô đặc quá mức. Chính cái khả năng cô đặc làm túi mật hữu ích cũng là cái làm nó dễ sinh sỏi.',
      },
    ],
    context: [
      'Sinh học 8 — Tiêu hoá ở ruột non',
      'Hoá học — chất nhũ hoá và hệ nhũ tương',
      'Thực tế: vì sao bữa nhiều dầu mỡ gây đau ở người có sỏi mật',
    ],
    keywords: 'tui mat gallbladder dich mat nhu hoa soi mat tieu hoa co the nguoi vesica biliaris',
  }),
  organEntry({
    id: 'organ-pancreas',
    file: 'pancreas.glb',
    mark: 'organ-pancreas',
    title: 'Tuyến tụy',
    subtitle: 'Pancreas',
    poetic: 'Hai tuyến khác nhau hoàn toàn, nằm trong cùng một khối.',
    summary: 'Một cơ quan làm hai việc: tiết enzyme và tiết hormone.',
    description:
      'Tuyến tụy là ví dụ rõ nhất trong cơ thể về một cơ quan mang hai hệ tiết riêng biệt. Phần ngoại tiết chiếm gần hết khối lượng và đổ enzyme tiêu hoá vào tá tràng; phần nội tiết chỉ là khoảng 1–2% khối lượng, nằm rải thành các đảo tụy, và tiết insulin cùng glucagon thẳng vào máu. Mô hình cho thấy khối thân tụy vắt ngang phía sau dạ dày.',
    yaw: 0.24,
    pitch: 0.3,
    fill: 0.9,
    parts: [
      { label: 'Đầu tụy', body: 'Phần to, nằm trong vòng của tá tràng.' },
      { label: 'Thân tụy', body: 'Vắt ngang phía sau dạ dày.' },
      { label: 'Đuôi tụy', body: 'Đầu hẹp, hướng về phía lách.' },
      { label: 'Ống tụy', body: 'Chạy suốt chiều dài, đổ enzyme vào tá tràng.' },
      { label: 'Đảo tụy', body: 'Các cụm nội tiết, tiết insulin và glucagon vào máu.' },
    ],
    goals: [
      'Phân biệt phần ngoại tiết với phần nội tiết của tuyến tụy',
      'Nêu đường đi của enzyme tụy và của insulin, và chỉ ra chúng khác nhau ở đâu',
      'Giải thích vì sao tổn thương đầu tụy ảnh hưởng cả đuôi tụy',
    ],
    facts: [
      { label: 'Chiều dài', value: '15–20 cm', icon: 'ruler' },
      { label: 'Dịch tiêu hoá', value: '~1,5 L mỗi ngày', icon: 'drop' },
      { label: 'Số đảo tụy', value: '~1 triệu', icon: 'scale-micro' },
      { label: 'Hai chức năng', value: 'Ngoại tiết và nội tiết', icon: 'layers' },
      { label: 'Phần nội tiết', value: 'Chỉ 1–2% khối lượng tuyến', icon: 'geometry' },
      { label: 'Vị trí', value: 'Sau dạ dày, vắt ngang bụng trên', icon: 'pin' },
    ],
    notes: [
      {
        label: 'Vì sao một cơ quan lại có hai hệ tiết',
        body: 'Ngoại tiết đổ sản phẩm vào một cái ống dẫn ra ngoài lòng ruột; nội tiết đổ thẳng vào máu. Tuyến tụy làm cả hai, và đó là lý do một khối u chặn ống tụy gây rối tiêu hoá, còn mất tế bào đảo tụy gây đái tháo đường — hai bệnh khác nhau trên cùng một cơ quan.',
      },
      {
        label: 'Bạn có biết',
        body: 'Enzyme tụy được tiết ra ở dạng chưa hoạt động và chỉ được kích hoạt sau khi đã vào ruột. Nếu chúng hoạt động ngay trong tuyến thì tuyến sẽ tự tiêu hoá chính nó — đó chính là điều xảy ra trong viêm tụy cấp.',
      },
    ],
    context: [
      'Sinh học 8 — Tiêu hoá và tuyến nội tiết',
      'Hoá học — enzyme, chất xúc tác sinh học và dạng tiền enzyme',
      'Thực tế: insulin, đường huyết và bệnh đái tháo đường',
    ],
    keywords: 'tuyen tuy pancreas enzyme insulin glucagon dao tuy noi tiet ngoai tiet co the nguoi',
  }),
  organEntry({
    id: 'organ-ileum',
    file: 'small_intestine.glb',
    mark: 'organ-ileum',
    title: 'Hồi tràng',
    subtitle: 'Ileum — đoạn cuối ruột non',
    poetic: 'Đoạn ruột dài nhất, và là đoạn hấp thu những gì còn lại.',
    summary: 'Đoạn cuối ruột non — mô hình là hồi tràng, không phải cả ruột non.',
    description:
      'Mô hình này là hồi tràng — đoạn thứ ba và dài nhất của ruột non — chứ không phải toàn bộ ruột non — nguồn của mesh nói rõ như vậy và tiêu đề ở đây gọi đúng theo. Hồi tràng là nơi hấp thu vitamin B12 và tái hấp thu muối mật, hai việc mà tá tràng và hỗng tràng phía trước không làm. Bề mặt trong của nó gấp ba lần: nếp niêm mạc, nhung mao, rồi vi nhung mao.',
    yaw: 0.62,
    pitch: 0.26,
    fill: 0.92,
    parts: [
      { label: 'Nếp niêm mạc', body: 'Gấp lớn nhất, nhân diện tích lên khoảng ba lần.' },
      { label: 'Nhung mao', body: 'Nhú cao chừng 1 mm, nhân tiếp khoảng mười lần.' },
      { label: 'Vi nhung mao', body: 'Lông trên từng tế bào — lớp gấp thứ ba.' },
      { label: 'Mảng Peyer', body: 'Cụm mô lympho canh vi khuẩn trong lòng ruột.' },
    ],
    goals: [
      'Nêu ba mức gấp của thành ruột non và tác dụng của từng mức',
      'Chỉ ra hai chất chỉ hồi tràng hấp thu được',
      'Giải thích vì sao ruột hấp thu cần diện tích chứ không cần thể tích',
    ],
    facts: [
      { label: 'Chiều dài', value: '2–4 m — đoạn dài nhất của ruột non', icon: 'ruler' },
      { label: 'Diện tích hấp thu', value: '~30 m² nhờ ba mức gấp', icon: 'surface' },
      { label: 'Hấp thu riêng', value: 'Vitamin B12 và muối mật', icon: 'drop' },
      { label: 'Ba mức gấp', value: 'Nếp · nhung mao · vi nhung mao', icon: 'layers' },
      { label: 'Vi nhung mao', value: '~1 µm cao, hàng nghìn trên một tế bào', icon: 'scale-micro' },
      { label: 'Vị trí', value: 'Nối vào ruột già ở van hồi – manh tràng', icon: 'pin' },
    ],
    notes: [
      {
        label: 'Vì sao phải gấp ba lần chứ không một lần',
        body: 'Mỗi mức gấp nhân diện tích lên một hệ số, và ba hệ số nhân với nhau: khoảng 3 × 10 × 20. Một ống trơn cùng chiều dài chỉ có chừng 0,5 m² bề mặt; ba mức gấp đưa nó lên khoảng 30 m² mà không cần thêm một centimét ruột nào.',
      },
      {
        label: 'Bạn có biết',
        body: 'Cắt mất hồi tràng thì người ta vẫn tiêu hoá được, nhưng sẽ thiếu vitamin B12 sau vài năm — vì lượng B12 dự trữ trong gan đủ dùng khoảng thời gian đó, rồi hết. Đây là chỗ mà “đoạn nào của ruột” là một câu hỏi có hậu quả.',
      },
    ],
    context: [
      'Sinh học 8 — Hấp thụ chất dinh dưỡng ở ruột non',
      'Vật lý — tỉ lệ diện tích trên thể tích và tốc độ khuếch tán',
      'Thực tế: vì sao thiếu máu do thiếu B12 xuất hiện muộn',
    ],
    keywords: 'hoi trang ileum ruot non nhung mao vi nhung mao hap thu b12 muoi mat co the nguoi',
  }),
  organEntry({
    id: 'organ-colon',
    file: 'intestine.glb',
    mark: 'organ-colon',
    title: 'Ruột già',
    subtitle: 'Intestinum crassum',
    poetic: 'Ngắn hơn ruột non bốn lần, và làm một việc hoàn toàn khác.',
    summary: 'Khung ruột già — ống rộng hơn, ngắn hơn, không có nhung mao.',
    description:
      'Ruột già không hấp thu chất dinh dưỡng và cũng không có nhung mao; việc của nó là lấy lại nước cùng chất điện giải, và cho hệ vi sinh đường ruột chỗ làm việc. Đặt cạnh mô hình hồi tràng thì tương phản rất rõ: ruột già rộng gấp đôi mà ngắn hơn bốn lần, vì nó không cần diện tích — nó cần thời gian.',
    yaw: 0.44,
    pitch: 0.2,
    fill: 0.92,
    parts: [
      { label: 'Manh tràng', body: 'Đoạn đầu, nơi ruột non đổ vào.' },
      { label: 'Đại tràng lên', body: 'Đi ngược lên phía gan bên phải ổ bụng.' },
      { label: 'Đại tràng ngang', body: 'Vắt ngang bụng trên, dưới dạ dày.' },
      { label: 'Đại tràng xuống', body: 'Đi xuống dọc bên trái ổ bụng.' },
      { label: 'Đại tràng sigma', body: 'Đoạn uốn chữ S trước trực tràng.' },
    ],
    goals: [
      'Lần theo đường đi của chất thải qua khung ruột già',
      'So sánh ruột già với ruột non về đường kính, chiều dài và bề mặt',
      'Nêu hai việc ruột già làm mà ruột non không làm',
    ],
    facts: [
      { label: 'Chiều dài', value: '~1,5 m', icon: 'ruler' },
      { label: 'Đường kính', value: '6–7 cm — rộng gấp đôi ruột non', icon: 'geometry' },
      { label: 'Nước tái hấp thu', value: '~1,5 L mỗi ngày', icon: 'drop' },
      { label: 'Hệ vi sinh', value: 'Cỡ 10¹³ tế bào vi khuẩn', icon: 'scale-micro' },
      { label: 'Nhung mao', value: 'Không có — bề mặt trơn', icon: 'surface' },
      { label: 'Thời gian lưu', value: '12–48 giờ', icon: 'era' },
    ],
    notes: [
      {
        label: 'Vì sao rộng hơn mà lại ngắn hơn',
        body: 'Hấp thu chất dinh dưỡng cần diện tích, nên ruột non dài và gấp khúc. Lấy lại nước cần thời gian tiếp xúc, nên ruột già chọn ống rộng và dòng chảy chậm. Cùng một bài toán vận chuyển, hai lời giải trái ngược nhau — và hình dạng của hai đoạn ruột là hai lời giải đó.',
      },
      {
        label: 'Bạn có biết',
        body: 'Vi khuẩn ruột già tổng hợp được vitamin K và một số vitamin nhóm B mà cơ thể không tự làm ra. Đó là lý do một đợt kháng sinh dài có thể làm rối cả việc đông máu, chứ không chỉ làm rối tiêu hoá.',
      },
    ],
    context: [
      'Sinh học 8 — Thải phân và vai trò của ruột già',
      'Sinh học 10 — vi sinh vật cộng sinh',
      'Thực tế: mất nước do tiêu chảy và cách bù điện giải',
    ],
    keywords: 'ruot gia colon dai trang manh trang sigma vi sinh nuoc dien giai co the nguoi intestinum crassum',
  }),
  organEntry({
    id: 'organ-kidney',
    file: 'kidney.glb',
    mark: 'organ-kidney',
    title: 'Thận',
    subtitle: 'Ren — thận trái, có vỏ và tháp thận',
    poetic: 'Lọc 180 lít mỗi ngày để giữ lại 179 lít.',
    summary: 'Bao thận trong suốt, để thấy cột thận và tháp thận nằm bên trong.',
    description:
      'Mô hình thận trái, và điểm đáng giá của nó là ba khối dựng riêng chứ không phải một quả đậu đặc: bao thận, cột thận và một tháp thận. Bao thận ở đây được dựng trong suốt — nó là một túi kín bọc hai khối kia, nên để nguyên thì phần cần nhìn nhất bị giấu bên trong. Nhìn xuyên qua nó thì thấy đúng chỗ cần nhìn: tháp thận là khối hình nón, và phần vỏ chen vào giữa các tháp chính là cột thận.',
    yaw: 0.9,
    pitch: 0.16,
    fill: 0.86,
    /* The one organ in the set whose parts are *nested* rather than adjacent.
       See the `shell` field on the model view for why only this entry has it. */
    shell: ['VH_M_kidney_capsule'],
    parts: [
      { label: 'Vỏ thận', body: 'Lớp ngoài — nơi gần hết cầu thận nằm.' },
      { label: 'Tháp thận', body: 'Khối hình nón, các ống góp chạy song song về đỉnh.' },
      { label: 'Cột thận', body: 'Phần vỏ chen giữa hai tháp kề nhau.' },
      { label: 'Bao thận', body: 'Màng sợi bọc ngoài, giữ hình dạng và bảo vệ.' },
      { label: 'Bể thận', body: 'Khoang thu nước tiểu trước khi xuống niệu quản — ngoài phạm vi mô hình.' },
    ],
    goals: [
      'Phân biệt vỏ thận với tháp thận trên mô hình',
      'Lần theo đường dịch lọc từ vỏ thận vào tháp thận',
      'Giải thích vì sao lượng lọc lớn hơn lượng nước tiểu gần hai trăm lần',
    ],
    facts: [
      { label: 'Kích thước', value: '~11 cm mỗi thận', icon: 'ruler' },
      { label: 'Số nephron', value: '~1 triệu mỗi thận', icon: 'scale-micro' },
      { label: 'Lưu lượng máu', value: '~1,1 L mỗi phút — 20% cung lượng tim', icon: 'drop' },
      { label: 'Dịch lọc mỗi ngày', value: '~180 L', icon: 'pulse' },
      { label: 'Nước tiểu mỗi ngày', value: '1–2 L', icon: 'drop' },
      { label: 'Ba khối dựng rời', value: 'Bao · cột · một tháp', icon: 'layers' },
      { label: 'Phạm vi mô hình', value: 'Thận trái, không có bể thận', icon: 'geometry' },
    ],
    notes: [
      {
        label: 'Vì sao lọc thừa rồi thu lại',
        body: 'Thận không chọn ra chất cần thải, nó lọc gần như mọi thứ nhỏ hơn protein rồi thu lại những gì cần giữ. Cách đó tốn năng lượng nhưng cực kỳ linh hoạt: chỉ cần đổi mức thu lại là điều chỉnh được nước, natri, kali, canxi, pH — không cần một cơ chế nhận biết riêng cho từng chất.',
      },
      {
        label: 'Bạn có biết',
        body: 'Thận nhận khoảng một phần năm lượng máu tim bơm ra, dù chỉ nặng chừng 0,4% khối lượng cơ thể. Chúng nhận nhiều máu như vậy không phải vì cần nhiều oxy, mà vì máu chính là thứ chúng đang xử lý.',
      },
    ],
    context: [
      'Sinh học 8 — Bài tiết và cấu tạo của thận',
      'Hoá học — dung dịch, nồng độ và cân bằng điện giải',
      'Thực tế: chạy thận nhân tạo thay được việc gì của thận',
    ],
    keywords: 'than kidney nephron vo than thap than be than bai tiet nuoc tieu co the nguoi ren',
  }),
  organEntry({
    id: 'organ-spleen',
    file: 'spleen.glb',
    mark: 'organ-spleen',
    title: 'Lách',
    subtitle: 'Lien',
    poetic: 'Bộ lọc kiểm từng hồng cầu và loại ra những cái đã quá già.',
    summary: 'Cơ quan lympho lớn nhất — lọc máu, không lọc dịch lympho.',
    description:
      'Lách là cơ quan lympho lớn nhất cơ thể, và khác mọi hạch lympho ở một điểm quyết định: nó lọc máu chứ không lọc dịch lympho. Hồng cầu đi qua lách phải lách qua những khe rất hẹp, và cái nào đã mất độ mềm vì quá già thì không qua được và bị phá bỏ ngay tại đó. Mặt lõm của mô hình có khuyết rốn lách — nơi mạch máu đi vào.',
    yaw: 0.72,
    pitch: 0.18,
    fill: 0.86,
    parts: [
      { label: 'Tuỷ đỏ', body: 'Phần lọc hồng cầu, chiếm phần lớn khối lách.' },
      { label: 'Tuỷ trắng', body: 'Các cụm lympho — nơi đáp ứng miễn dịch xảy ra.' },
      { label: 'Rốn lách', body: 'Khuyết ở mặt lõm, nơi mạch máu đi vào và ra.' },
      { label: 'Mặt tiếp giáp đại tràng', body: 'Vùng lách áp vào ruột già bên trái.' },
    ],
    goals: [
      'Nêu điểm khác nhau giữa lách và một hạch lympho',
      'Giải thích lách nhận ra hồng cầu già bằng cách nào',
      'Dự đoán hệ quả của việc cắt lách với khả năng chống nhiễm khuẩn',
    ],
    facts: [
      { label: 'Chiều dài', value: '10–12 cm', icon: 'ruler' },
      { label: 'Khối lượng', value: '~150 g', icon: 'weight' },
      { label: 'Máu chứa trong lách', value: '~200–250 mL', icon: 'drop' },
      { label: 'Vị trí', value: 'Hạ sườn trái, sau dạ dày', icon: 'pin' },
      { label: 'Lọc gì', value: 'Máu — không phải dịch lympho', icon: 'layers' },
      { label: 'Đời hồng cầu', value: '~120 ngày rồi bị loại ở đây', icon: 'era' },
    ],
    notes: [
      {
        label: 'Vì sao lách nhận ra được hồng cầu già',
        body: 'Lách không đọc dấu hiệu hoá học nào cả — nó dùng một phép thử cơ học. Hồng cầu phải biến dạng để lách qua khe rộng chừng 2 µm trong khi đường kính của nó là 7 µm; cái nào đã cứng lại vì tuổi thì tắc và bị đại thực bào dọn ngay. Một bộ lọc đo độ mềm.',
      },
      {
        label: 'Bạn có biết',
        body: 'Người cắt lách vẫn sống bình thường, nhưng dễ nhiễm nặng bởi các vi khuẩn có vỏ bao như phế cầu — vì tuỷ trắng của lách là nơi tạo kháng thể chống đúng loại vỏ đó. Đây là lý do người cắt lách được tiêm chủng riêng.',
      },
    ],
    context: [
      'Sinh học 8 — Máu và hệ miễn dịch',
      'Vật lý — biến dạng đàn hồi và dòng chảy qua khe hẹp',
      'Thực tế: vì sao chấn thương bụng trái có thể gây mất máu nặng',
    ],
    keywords: 'lach spleen tuy do tuy trang hong cau lympho mien dich ron lach co the nguoi lien',
  }),
  organEntry({
    id: 'organ-thymus',
    file: 'thymus.glb',
    mark: 'organ-thymus',
    title: 'Thùy tuyến ức trái',
    subtitle: 'Thymus, lobus sinister',
    poetic: 'Trường huấn luyện đóng cửa dần sau khi ta lớn.',
    summary: 'Một thùy của tuyến ức — nơi tế bào T học phân biệt ta với địch.',
    description:
      'Mô hình là thùy trái của tuyến ức, không phải cả tuyến — nguồn của mesh nói rõ, và tiêu đề gọi đúng theo. Tuyến ức là cơ quan duy nhất mà nhiệm vụ chính là loại bỏ: tế bào T non đi qua đây và hơn 95% bị tiêu diệt, vì chúng nhận diện sai — hoặc không nhận được kháng nguyên nào, hoặc tấn công chính cơ thể. Tuyến ức lớn nhất trước dậy thì rồi teo dần thành mô mỡ.',
    yaw: 0.86,
    pitch: 0.14,
    fill: 0.8,
    parts: [
      { label: 'Vỏ thùy', body: 'Nơi tế bào T non tăng sinh dày đặc nhất.' },
      { label: 'Tuỷ thùy', body: 'Vòng sàng lọc cuối trước khi tế bào T ra máu.' },
      { label: 'Vách xơ', body: 'Chia thùy thành các tiểu thùy nhỏ hơn.' },
    ],
    goals: [
      'Nêu việc tuyến ức làm và giải thích vì sao nó chủ yếu là loại bỏ',
      'Chỉ ra tuyến ức nằm ở đâu so với tim và xương ức',
      'Giải thích vì sao tuyến ức teo đi mà miễn dịch vẫn hoạt động',
    ],
    facts: [
      { label: 'Hoạt động mạnh nhất', value: 'Trước tuổi dậy thì', icon: 'era' },
      { label: 'Vai trò', value: 'Huấn luyện và sàng lọc tế bào T', icon: 'dna' },
      { label: 'Tỉ lệ bị loại', value: 'Hơn 95% tế bào T non', icon: 'scale-micro' },
      { label: 'Vị trí', value: 'Sau xương ức, trước tim', icon: 'pin' },
      { label: 'Về sau', value: 'Teo dần, thay bằng mô mỡ', icon: 'layers' },
      { label: 'Phạm vi mô hình', value: 'Một thùy — tuyến ức có hai', icon: 'geometry' },
    ],
    notes: [
      {
        label: 'Vì sao một cơ quan lại tồn tại để loại bỏ',
        body: 'Tế bào T được tạo ra với thụ thể ghép ngẫu nhiên, nên phần lớn hoặc vô dụng hoặc nguy hiểm. Không có cách nào tạo sẵn đúng thụ thể, nên cơ thể chọn cách sinh thật nhiều rồi thử từng cái: cái nào tấn công chính mình thì bị diệt ở đây. Miễn dịch được huấn luyện bằng cách loại trừ.',
      },
      {
        label: 'Bạn có biết',
        body: 'Tuyến ức teo gần hết ở người trưởng thành mà miễn dịch vẫn tốt, vì đội tế bào T đã được huấn luyện trong tuổi thơ sống rất lâu và tự nhân lên khi cần. Cái teo đi là trường học, không phải học viên.',
      },
    ],
    context: [
      'Sinh học 8 — Miễn dịch và bạch cầu',
      'Sinh học 10 — chọn lọc ở mức tế bào',
      'Thực tế: vì sao trẻ nhỏ cần tiêm chủng đúng lịch',
    ],
    keywords: 'tuyen uc thymus thuy trai te bao t mien dich sang loc lympho co the nguoi lobus sinister',
  }),
];
