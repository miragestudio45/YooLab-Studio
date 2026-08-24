import type { ExperienceManifest } from '../types';

/**
 * Hóa học.
 *
 * Bảng tuần hoàn là tấm bản đồ; bảy phân tử là địa hình. Một bảng nguyên tố mà
 * không có gì được dựng nên từ các nguyên tố đó là một cuốn tra cứu, không phải
 * một môn học — đó là điểm yếu nhất của môn này ở bản trước, và bảy mục dưới đây
 * là phần bù.
 *
 * Bảy phân tử không phải bảy component. Tất cả đi qua một `MoleculeViewer` duy
 * nhất, phân biệt bằng `params.molecule`, nên rail hiện bảy mẫu vật mà bundle
 * chỉ mang một trình xem. Toạ độ nguyên tử nằm trong `lib/chemistry/molecules.ts`
 * theo đơn vị Ångström thật, và không có phép co giãn nào ở giữa — nhờ vậy công
 * cụ "Đo" trong trình xem in ra đúng con số mà thẻ thông số bên cạnh trích dẫn,
 * và học sinh đối chiếu được với sách.
 *
 * Thứ tự cố ý: nước → CO₂ → O₂ → methane → ammonia → muối ăn → caffeine. Đi từ
 * phân tử mà mọi học sinh đã có sẵn hình dung, qua cặp phản ví dụ về tính phân
 * cực, tới tứ diện là nền của toàn bộ hoá hữu cơ, rồi tới một tinh thể ion (thứ
 * *không* phải phân tử), và kết ở một cấu trúc hữu cơ thật.
 */
export const CHEMISTRY_EXPERIENCES: ExperienceManifest[] = [
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
    rail: { kind: 'mark', mark: 'atom-grid' },
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
    notes: [
      {
        label: 'Bảng là một biểu đồ, không phải danh sách',
        body: 'Vị trí của một nguyên tố đã nói trước phần lớn tính chất của nó. Đi ngang một chu kỳ, độ âm điện tăng; đi xuống một nhóm, bán kính tăng.',
      },
    ],
    credits: [
      {
        author: 'Periodic-Table-JSON · PubChem (NIH)',
        license: 'CC BY-SA 4.0 (dữ liệu) · Public Domain (PubChem)',
        source: 'https://github.com/Bowserinator/Periodic-Table-JSON',
        notice:
          'Dữ liệu nguyên tố giữ nguyên giấy phép gốc. Giao diện và phần dựng 3D do YooLab viết.',
      },
    ],
    keywords: 'bang tuan hoan nguyen to hoa hoc periodic table electron',
  },

  /* ------------------------------------------------------------- phân tử --- */
  {
    id: 'molecule-water',
    title: 'Nước',
    subtitle: 'H₂O · gấp khúc 104,5°',
    subject: 'hoa-hoc',
    topic: 'Cấu tạo chất',
    kind: 'interactive',
    status: 'ready',
    summary: 'Phân tử gấp khúc — công thức đối xứng nhưng hình dạng thì không.',
    description:
      'Viết ra giấy, H₂O trông cân đối. Trong không gian, hai cặp electron chưa liên kết trên oxi ép hai liên kết O–H xuống còn 104,5°, nên phân tử có một đầu âm và một đầu dương. Bật “Đo” rồi nhấp H–O–H để tự đọc ra góc đó.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'nuoc' } },
    rail: { kind: 'mark', mark: 'molecule' },
    parts: [
      { label: 'Oxi', body: 'Nguyên tử trung tâm, giữ hai cặp electron chưa liên kết.' },
      { label: 'Hai liên kết O–H', body: 'Dài 0,9575 Å, lệch nhau 104,5°.' },
    ],
    goals: [
      'Đo góc liên kết H–O–H trên mô hình',
      'Giải thích vì sao nước là phân tử có cực',
      'Phân biệt công thức phân tử với hình dạng phân tử',
    ],
    facts: [
      { label: 'Khối lượng mol', value: '18,02 g/mol' },
      { label: 'Góc liên kết', value: '104,5°' },
      { label: 'Độ dài O–H', value: '0,9575 Å' },
    ],
    notes: [
      {
        label: 'Hình dạng quyết định tính chất',
        body: 'Chính vì gấp khúc mà nước có cực, và chính vì có cực mà nước hoà tan được muối, có sức căng mặt ngoài lớn và nở ra khi đóng băng.',
      },
    ],
    credits: [
      {
        author: 'PubChem (NIH) · YooLab',
        license: 'Public Domain (dữ liệu cấu trúc)',
        source: 'https://pubchem.ncbi.nlm.nih.gov',
        notice: 'Toạ độ nguyên tử theo số đo thực nghiệm công bố. Phần dựng 3D do YooLab viết.',
      },
    ],
    keywords: 'nuoc water h2o phan tu goc lien ket gap khuc phan cuc',
  },
  {
    id: 'molecule-co2',
    title: 'Carbon dioxide',
    subtitle: 'CO₂ · thẳng 180°',
    subject: 'hoa-hoc',
    topic: 'Cấu tạo chất',
    kind: 'interactive',
    status: 'ready',
    summary: 'Liên kết có cực nhưng phân tử không cực — phản ví dụ của nước.',
    description:
      'Hai liên kết C=O đều có cực, nhưng phân tử thẳng nên hai lực hút electron ngược chiều nhau và triệt tiêu. CO₂ là phân tử gồm những liên kết có cực mà bản thân nó không có cực — điều chỉ thấy được khi nhìn hình dạng.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'carbon-dioxide' } },
    rail: { kind: 'mark', mark: 'molecule-linear' },
    parts: [
      { label: 'Carbon', body: 'Nguyên tử trung tâm, không còn cặp electron riêng.' },
      { label: 'Hai liên kết đôi C=O', body: 'Đối xứng hoàn toàn, lệch nhau 180°.' },
    ],
    goals: [
      'So sánh CO₂ với H₂O để tách hai khái niệm: liên kết có cực và phân tử có cực',
      'Đo góc O–C–O và giải thích vì sao nó là 180°',
    ],
    facts: [
      { label: 'Khối lượng mol', value: '44,01 g/mol' },
      { label: 'Góc liên kết', value: '180°' },
      { label: 'Độ dài C=O', value: '1,16 Å' },
    ],
    notes: [
      {
        label: 'Vì sao CO₂ không tan nhiều trong nước',
        body: 'Nước có cực nên hoà tan tốt chất có cực. CO₂ không cực, nên nó chỉ tan ít — và phần tan được phải phản ứng thành acid carbonic.',
      },
    ],
    keywords: 'carbon dioxide co2 thang lien ket doi khong cuc khi nha kinh',
  },
  {
    id: 'molecule-o2',
    title: 'Oxi',
    subtitle: 'O₂ · liên kết đôi',
    subject: 'hoa-hoc',
    topic: 'Cấu tạo chất',
    kind: 'interactive',
    status: 'ready',
    summary: 'Đơn chất hai nguyên tử — trường hợp đơn giản nhất có thể.',
    description:
      'Hai nguyên tử giống nhau nên không bên nào kéo được cặp electron dùng chung về phía mình. Đây cũng là chỗ đo được độ dài liên kết đôi: 1,21 Å ở đây, so với 1,48 Å của liên kết đơn O–O trong peroxide.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'oxi' } },
    rail: { kind: 'mark', mark: 'molecule-diatomic' },
    parts: [{ label: 'Liên kết đôi O=O', body: 'Dài 1,21 Å — ngắn hơn liên kết đơn O–O.' }],
    goals: [
      'Nhận ra liên kết cộng hoá trị không cực',
      'So sánh độ dài liên kết đơn và liên kết đôi bằng số đo trên mô hình',
    ],
    facts: [
      { label: 'Khối lượng mol', value: '32,00 g/mol' },
      { label: 'Độ dài liên kết', value: '1,21 Å' },
      { label: 'Bậc liên kết', value: '2' },
    ],
    notes: [
      {
        label: 'Liên kết càng nhiều càng ngắn',
        body: 'Liên kết đôi kéo hai hạt nhân lại gần nhau hơn liên kết đơn, và liên kết ba còn ngắn hơn nữa. Độ dài liên kết là một cách đọc ra bậc liên kết.',
      },
    ],
    keywords: 'oxi oxygen o2 don chat lien ket doi khong cuc',
  },
  {
    id: 'molecule-methane',
    title: 'Methane',
    subtitle: 'CH₄ · tứ diện 109,5°',
    subject: 'hoa-hoc',
    topic: 'Cấu tạo chất',
    kind: 'interactive',
    status: 'ready',
    summary: 'Tứ diện — hình khối làm nền cho toàn bộ hoá hữu cơ.',
    description:
      'Vẽ phẳng, CH₄ trông như một dấu cộng với bốn góc 90°. Trong không gian, bốn liên kết đẩy nhau ra xa hết mức và dừng ở 109,5° — hình tứ diện mà mọi cấu trúc hữu cơ về sau đều dựng từ đó. Đây là mục cho thấy rõ nhất vì sao một trình xem 3D hơn một cái bảng.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'metan' } },
    rail: { kind: 'mark', mark: 'molecule-tetra' },
    parts: [
      { label: 'Carbon', body: 'Bốn liên kết đơn hướng ra bốn đỉnh tứ diện.' },
      { label: 'Bốn liên kết C–H', body: 'Dài 1,087 Å, đôi một lệch nhau 109,5°.' },
    ],
    goals: [
      'Đo góc H–C–H và thấy nó không phải 90°',
      'Giải thích hình tứ diện bằng lực đẩy giữa các cặp electron',
      'Liên hệ tứ diện với cấu trúc mạch carbon',
    ],
    facts: [
      { label: 'Khối lượng mol', value: '16,04 g/mol' },
      { label: 'Góc liên kết', value: '109,5°' },
      { label: 'Độ dài C–H', value: '1,087 Å' },
    ],
    notes: [
      {
        label: '90° là sai số của giấy phẳng',
        body: 'Không có góc 90° nào trong methane. Con số đó chỉ là hệ quả của việc phải vẽ một vật thể ba chiều lên một tờ giấy hai chiều.',
      },
    ],
    keywords: 'methane metan ch4 tu dien goc lien ket huu co mach carbon',
  },
  {
    id: 'molecule-ammonia',
    title: 'Ammonia',
    subtitle: 'NH₃ · chóp tam giác 107,8°',
    subject: 'hoa-hoc',
    topic: 'Cấu tạo chất',
    kind: 'interactive',
    status: 'ready',
    summary: 'Methane thay một liên kết bằng một cặp electron riêng.',
    description:
      'NH₃ là methane sau khi một liên kết bị thay bằng một cặp electron chưa liên kết, và mô hình cho thấy giá phải trả: cặp electron chiếm chỗ nhiều hơn một liên kết, nên hình chóp khép lại từ 109,5° còn 107,8°. Hướng thứ tư trống chính là chỗ NH₃ nhận proton.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'amoniac' } },
    rail: { kind: 'mark', mark: 'molecule-pyramid' },
    parts: [
      { label: 'Nitơ', body: 'Ba liên kết và một cặp electron chưa liên kết.' },
      { label: 'Ba liên kết N–H', body: 'Dài 1,012 Å, đôi một lệch nhau 107,8°.' },
      { label: 'Hướng trống', body: 'Nơi cặp electron riêng chiếm chỗ — cũng là nơi nhận H⁺.' },
    ],
    goals: [
      'So sánh góc liên kết của NH₃ với CH₄ và giải thích chênh lệch',
      'Chỉ ra hướng của cặp electron chưa liên kết trên mô hình',
      'Liên hệ cặp electron riêng với tính base của ammonia',
    ],
    facts: [
      { label: 'Khối lượng mol', value: '17,03 g/mol' },
      { label: 'Góc liên kết', value: '107,8°' },
      { label: 'Độ dài N–H', value: '1,012 Å' },
    ],
    notes: [
      {
        label: 'Cặp electron riêng chiếm chỗ nhiều hơn liên kết',
        body: 'Đó là toàn bộ lý do góc giảm 1,7° so với methane — và cũng là lý do nước, với hai cặp riêng, còn khép hơn nữa xuống 104,5°.',
      },
    ],
    keywords: 'ammonia amoniac nh3 chop tam giac cap electron rieng base',
  },
  {
    id: 'molecule-nacl',
    title: 'Muối ăn',
    subtitle: 'NaCl · tinh thể lập phương tâm mặt',
    subject: 'hoa-hoc',
    topic: 'Liên kết ion',
    kind: 'interactive',
    status: 'ready',
    summary: 'Không có phân tử NaCl — chỉ có một mạng tinh thể.',
    description:
      'Mục này sửa một thói quen. “NaCl” là một tỉ lệ, không phải một hạt: không có phân tử NaCl nào để chỉ vào, chỉ có một mạng trong đó mỗi Na⁺ được sáu Cl⁻ vây quanh và mỗi Cl⁻ được sáu Na⁺ vây quanh. Xoay khối này để thấy số phối trí sáu và các tiếp xúc vuông góc — và để hiểu vì sao hạt muối trong lọ có dạng khối lập phương.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'muoi-an' } },
    rail: { kind: 'mark', mark: 'crystal' },
    parts: [
      { label: 'Na⁺', body: 'Ion dương, bán kính nhỏ hơn nhiều so với nguyên tử natri.' },
      { label: 'Cl⁻', body: 'Ion âm, bán kính lớn hơn nguyên tử clo.' },
      { label: 'Số phối trí', body: 'Mỗi ion tiếp xúc gần nhất với sáu ion trái dấu.' },
    ],
    goals: [
      'Phân biệt hợp chất ion với hợp chất phân tử',
      'Đếm số ion trái dấu vây quanh một ion trên mô hình',
      'Liên hệ mạng tinh thể với hình dạng hạt muối thật',
    ],
    facts: [
      { label: 'Khối lượng mol công thức', value: '58,44 g/mol' },
      { label: 'Hằng số mạng', value: '5,64 Å' },
      { label: 'Số phối trí', value: '6' },
    ],
    notes: [
      {
        label: 'Công thức ion là tỉ lệ, không phải số hạt',
        body: 'Ở chế độ “Đặc”, mô hình dùng bán kính ion nên các ion vừa khít chạm nhau — đúng như trong tinh thể thật. Các đoạn nối trong hình là tiếp xúc gần nhất, không phải liên kết cộng hoá trị.',
      },
    ],
    keywords: 'muoi an nacl tinh the ion lap phuong tam mat so phoi tri natri clo',
  },
  {
    id: 'molecule-caffeine',
    title: 'Caffeine',
    subtitle: 'C₈H₁₀N₄O₂ · hai vòng ngưng tụ',
    subject: 'hoa-hoc',
    topic: 'Hoá hữu cơ',
    kind: 'interactive',
    status: 'ready',
    summary: 'Một cấu trúc hữu cơ thật — 24 nguyên tử, 25 liên kết.',
    description:
      'Phân tử lớn nhất trong bộ này, và là mục cho thấy một cấu trúc hữu cơ thật trông ra sao: hai vòng ngưng tụ nằm gần như hoàn toàn trên một mặt phẳng, với ba nhóm methyl chìa ra. Cùng bộ nguyên tố C, H, N, O như những mục trước, chỉ là được lắp thành một thứ phức tạp hơn nhiều.',
    view: { type: 'experience', key: 'molecule-viewer', params: { molecule: 'caffeine' } },
    rail: { kind: 'mark', mark: 'molecule-ring' },
    parts: [
      { label: 'Vòng sáu', body: 'Vòng pyrimidindion mang hai nhóm C=O.' },
      { label: 'Vòng năm', body: 'Vòng imidazol nối liền vào vòng sáu.' },
      { label: 'Ba nhóm methyl', body: 'Ba nhóm –CH₃ gắn trên ba nguyên tử nitơ.' },
    ],
    goals: [
      'Nhận ra hai vòng ngưng tụ và điểm nối giữa chúng',
      'Đếm số nguyên tử của từng nguyên tố và đối chiếu với công thức',
      'Nhận ra tính phẳng của hệ vòng liên hợp',
    ],
    facts: [
      { label: 'Khối lượng mol', value: '194,19 g/mol' },
      { label: 'Nguyên tử', value: '24' },
      { label: 'Liên kết', value: '25' },
    ],
    notes: [
      {
        label: 'Vòng liên hợp thì phẳng',
        body: 'Các nguyên tử trong hai vòng gần như nằm trên một mặt phẳng, vì electron π trải đều trên cả hệ vòng. Xoay mô hình về đúng cạnh để tự thấy nó mỏng như một tấm bìa.',
      },
    ],
    credits: [
      {
        author: 'PubChem (NIH) · YooLab',
        license: 'Public Domain (dữ liệu cấu trúc)',
        source: 'https://pubchem.ncbi.nlm.nih.gov/compound/2519',
        notice:
          'Cấu trúc theo dữ liệu PubChem CID 2519. Toạ độ được YooLab dựng lại từ hình học vòng liên hợp.',
      },
    ],
    keywords: 'caffeine cafein huu co vong ngung tu methyl phang ca phe',
  },
];
