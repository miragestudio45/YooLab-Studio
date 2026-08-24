import type { ExperienceManifest } from '../types';

/**
 * Vật lý.
 *
 * Mỗi mục ở đây là một mô hình số đang chạy có điều khiển, không phải một đoạn
 * hoạt hình mô tả một tình huống vật lý. Phân biệt đó là toàn bộ giá trị của
 * môn này: một học sinh đổi góc ném rồi thấy tầm xa giảm ở cả hai phía của 45°
 * đã học được điều mà một hình vẽ không dạy nổi.
 *
 * Bốn mục, bốn chủ đề của chương trình phổ thông — động học, lực và ma sát, sóng
 * cơ, dòng điện một chiều — và cả bốn dùng cùng một bộ khung điều khiển (`.sim`):
 * cùng dải canvas, cùng băng số đọc, cùng kiểu thanh trượt và chip đặt sẵn. Bốn
 * mô phỏng trong một môn với bốn giao diện khác nhau sẽ đọc ra là bốn sản phẩm
 * khác nhau.
 *
 * Không mục nào có số hiển thị riêng. Mọi con số trên màn hình đều lấy ra từ
 * chính bộ giải mà hình vẽ dùng, nên khi học sinh đặt μ = 0 hoặc tắt lực cản, kết
 * quả trùng với công thức các em tính bằng tay — đó là điều kiện để mô phỏng
 * được dùng làm chỗ dựa chứ chỉ để xem.
 */
export const PHYSICS_EXPERIENCES: ExperienceManifest[] = [
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
      'Mô phỏng chạy thật theo phương trình động học: đặt góc ném, tốc độ đầu, độ cao, trọng lực và lực cản không khí rồi bắn. Quỹ đạo, điểm cao nhất, tầm xa và thời gian bay được tính và vẽ trực tiếp. Tắt lực cản thì kết quả trùng với công thức parabol; bật lên thì quỹ đạo mất tính đối xứng ngay trên hình.',
    view: { type: 'experience', key: 'projectile-lab' },
    rail: { kind: 'mark', mark: 'projectile' },
    goals: [
      'Dự đoán ảnh hưởng của góc ném lên tầm xa',
      'Tách chuyển động thành hai thành phần vuông góc',
      'Nhận ra góc 45° cho tầm xa lớn nhất khi không có lực cản',
    ],
    facts: [
      { label: 'Tham số', value: '5 — góc, tốc độ, độ cao, g, lực cản' },
      { label: 'Trọng lực đặt sẵn', value: 'Trái Đất · Mặt Trăng · Sao Hỏa' },
      { label: 'Bước tích phân', value: '1 ms' },
    ],
    notes: [
      {
        label: 'Hai chuyển động độc lập',
        body: 'Theo phương ngang vật chuyển động đều; theo phương thẳng đứng vật rơi tự do. Quỹ đạo parabol chỉ là hệ quả của hai điều đó cộng lại.',
      },
    ],
    credits: [
      {
        author: 'IlliniOpenEdu · PhysicsSims',
        license: 'MIT',
        source: 'https://github.com/IlliniOpenEdu/PhysicsSims',
        notice: 'Tham khảo kiến trúc module mô phỏng. Mã mô phỏng của YooLab được viết mới.',
      },
    ],
    keywords: 'chuyen dong nem projectile dong hoc luc can trong luc vat ly parabol',
  },
  {
    id: 'incline-lab',
    title: 'Mặt phẳng nghiêng',
    subtitle: 'Phân tích lực và ma sát',
    subject: 'vat-ly',
    topic: 'Lực',
    kind: 'simulation',
    status: 'ready',
    summary: 'Bàn phân tích lực: đổi góc, khối lượng và hệ số ma sát.',
    description:
      'Vật nằm trên mặt phẳng nghiêng với cả bốn lực được vẽ đúng tỉ lệ và đúng hướng: trọng lực, phản lực pháp tuyến, ma sát và lực đẩy. Vật trượt đúng lúc tan θ vượt μ tĩnh, và khối lượng không hề tham gia vào thời điểm đó — kéo khối lượng từ 0,5 kg lên 20 kg rồi xem góc tới hạn không nhúc nhích là cách hiểu vì sao m bị triệt tiêu khỏi bất đẳng thức.',
    view: { type: 'experience', key: 'incline-lab' },
    rail: { kind: 'mark', mark: 'incline' },
    parts: [
      { label: 'Trọng lực P', body: 'P = m·g, luôn hướng thẳng đứng xuống dưới.' },
      { label: 'Thành phần theo mặt', body: 'P·sin θ — phần trọng lực kéo vật xuống dốc.' },
      { label: 'Phản lực N', body: 'N = P·cos θ, vuông góc với mặt phẳng nghiêng.' },
      { label: 'Ma sát', body: 'Nhiều nhất là μ·N, và luôn ngược chiều chuyển động.' },
    ],
    goals: [
      'Phân tích trọng lực thành hai thành phần vuông góc với mặt nghiêng',
      'Xác định góc tới hạn từ hệ số ma sát tĩnh',
      'Giải thích vì sao góc tới hạn không phụ thuộc khối lượng',
    ],
    facts: [
      { label: 'Tham số', value: '5 — góc, khối lượng, μ tĩnh, μ động, lực đẩy' },
      { label: 'Điều kiện trượt', value: 'tan θ > μ tĩnh' },
      { label: 'Bước tích phân', value: '1/240 s' },
    ],
    notes: [
      {
        label: 'Khối lượng không quyết định vật có trượt hay không',
        body: 'Cả lực kéo xuống dốc và lực ma sát cực đại đều tỉ lệ với m, nên m bị triệt tiêu ở hai vế. Điều còn lại chỉ là so sánh tan θ với μ.',
      },
      {
        label: 'Trường hợp kiểm tra được bằng tay',
        body: 'Đặt μ = 0 thì gia tốc đúng bằng g·sin θ. Đó là con số học sinh tính được trên giấy, và mô phỏng phải trả về đúng nó.',
      },
    ],
    credits: [
      {
        author: 'IlliniOpenEdu · PhysicsSims',
        license: 'MIT',
        source: 'https://github.com/IlliniOpenEdu/PhysicsSims',
        notice: 'Tham khảo kiến trúc module mô phỏng. Mã mô phỏng của YooLab được viết mới.',
      },
    ],
    keywords: 'mat phang nghieng luc ma sat he so goc toi han phan tich luc newton',
  },
  {
    id: 'wave-lab',
    title: 'Sóng cơ',
    subtitle: 'Truyền · giao thoa · sóng dừng',
    subject: 'vat-ly',
    topic: 'Sóng',
    kind: 'simulation',
    status: 'ready',
    summary: 'Ba chế độ trên cùng một bộ máy: một sóng, giao thoa, sóng dừng.',
    description:
      'Cùng một hàm y(x, t) vẽ ra cả ba chế độ, nên λ, f, T và v giữ nguyên nghĩa khi chuyển giữa chúng. Cửa sổ quan sát là một đoạn môi trường dài 2,4 m cố định — không tự co giãn theo bước sóng — nên giảm λ thì thấy rõ số đỉnh sóng nhồi thêm vào cùng một đoạn dây. Điểm P đứng yên một chỗ, nhấp nhô lên xuống trong khi đỉnh sóng đi qua, để bác bỏ ngộ nhận phổ biến nhất: rằng môi trường chạy theo sóng.',
    view: { type: 'experience', key: 'wave-lab' },
    rail: { kind: 'mark', mark: 'wave' },
    parts: [
      { label: 'Một sóng', body: 'Sóng hình sin chạy — quan hệ v = λ·f.' },
      { label: 'Giao thoa', body: 'Hai sóng cùng môi trường, cộng biên độ theo pha.' },
      { label: 'Sóng dừng', body: 'Dây hai đầu cố định — chỉ các bậc dao động lọt được.' },
      { label: 'Điểm P', body: 'Một phần tử môi trường, chỉ dao động tại chỗ.' },
    ],
    goals: [
      'Dùng công thức v = λ·f và kiểm chứng trên hình',
      'Dự đoán giao thoa tăng cường và triệt tiêu theo độ lệch pha',
      'Giải thích vì sao chỉ một số bậc dao động tồn tại trên dây hai đầu cố định',
      'Phân biệt chuyển động của sóng với chuyển động của phần tử môi trường',
    ],
    facts: [
      { label: 'Chế độ', value: '3 — một sóng, giao thoa, sóng dừng' },
      { label: 'Bậc dao động', value: '6 bậc trên dây 1,2 m' },
      { label: 'Cửa sổ quan sát', value: '2,4 m môi trường' },
    ],
    notes: [
      {
        label: 'Sóng đi, môi trường thì không',
        body: 'Điểm P chỉ đi lên và đi xuống trên đường gạch dọc của nó. Sóng mang năng lượng đi, không mang vật chất đi — và đó là điều một chú thích không dạy được, phải nhìn.',
      },
      {
        label: 'Giao thoa là phép cộng thật',
        body: 'Biên độ tại P là √(A₁² + A₂² + 2A₁A₂·cos Δφ), tính từ chính hai sóng đang vẽ. Đặt lệch tần số thì được hiện tượng phách thật, cả trong không gian và theo thời gian.',
      },
    ],
    keywords: 'song co buoc song tan so giao thoa song dung bac dao dong phach',
  },
  {
    id: 'circuit-lab',
    title: 'Mạch điện một chiều',
    subtitle: 'Định luật Ohm · nối tiếp và song song',
    subject: 'vat-ly',
    topic: 'Điện học',
    kind: 'simulation',
    status: 'ready',
    summary: 'Giải mạch thật: đổi nguồn, đổi điện trở, đổi cách nối.',
    description:
      'Mạch được giải lại mỗi khung hình theo định luật Ohm và định luật Kirchhoff. Cùng một cặp điện trở, chuyển giữa nối tiếp và song song sẽ đảo ngược kết luận về đèn nào sáng hơn — nối tiếp thì cùng dòng nên P = I²R, song song thì cùng hiệu điện thế nên P = U²/R. Mật độ hạt trên dây là hằng số và tốc độ hạt tỉ lệ với cường độ dòng điện, nên hình vẽ tự nói ra rằng dòng điện chia ra ở nút và cộng lại sau nút.',
    view: { type: 'experience', key: 'circuit-lab' },
    rail: { kind: 'mark', mark: 'circuit' },
    parts: [
      { label: 'Nguồn', body: 'Hiệu điện thế đặt vào hai đầu mạch, 1,5 – 12 V.' },
      { label: 'Nối tiếp', body: 'Một đường duy nhất: R tương đương = R₁ + R₂.' },
      { label: 'Song song', body: 'Hai nhánh riêng: 1/R = 1/R₁ + 1/R₂.' },
      { label: 'Công tắc', body: 'Hở mạch thì dòng bằng 0 ở mọi điểm.' },
    ],
    goals: [
      'Áp dụng định luật Ohm cho từng đoạn và cho toàn mạch',
      'Tính điện trở tương đương của đoạn mạch nối tiếp và song song',
      'Giải thích vì sao cùng cặp điện trở lại đổi đèn sáng hơn khi đổi cách nối',
      'Nhận ra dòng điện chia ra và cộng lại tại nút',
    ],
    facts: [
      { label: 'Cách nối', value: '3 — một đèn, nối tiếp, song song' },
      { label: 'Nguồn', value: '1,5 – 12 V' },
      { label: 'Điện trở', value: '2 – 40 Ω mỗi đèn' },
    ],
    notes: [
      {
        label: 'Cùng hai điện trở, hai kết luận trái nhau',
        body: 'Nối tiếp: cùng I, nên P = I²R — đèn có R lớn hơn sáng hơn. Song song: cùng U, nên P = U²/R — đèn có R nhỏ hơn sáng hơn. Đổi cách nối và xem lại hai bóng là cách nhớ chắc nhất.',
      },
      {
        label: 'Dòng lớn không phải là nhiều điện tích hơn',
        body: 'Mật độ hạt trên dây trong hình là hằng số; chỉ tốc độ đổi. Cường độ dòng điện là lượng điện tích qua một tiết diện trong một đơn vị thời gian, không phải "lượng điện có trong dây".',
      },
    ],
    keywords: 'mach dien mot chieu ohm noi tiep song song dien tro cong tac bong den kirchhoff',
  },
];
