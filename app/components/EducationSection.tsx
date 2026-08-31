'use client';

import { useState } from 'react';
import { ModelThumbnail } from './ModelThumbnail';
import { BEE_THUMBNAIL, CLOWNFISH_THUMBNAIL, JELLYFISH_THUMBNAIL } from '../lib/three/thumbnailRequests';

/**
 * One platform, three ways to use it.
 *
 * Three SaaS cards side by side is the wrong shape for this: it asks a visitor
 * to read all three to find the one that is theirs, and it forces every role to
 * be summarised in the same four lines. A segmented control lets each role have
 * a full asymmetric layout — the claim, what that person actually does, and a
 * picture of the product doing it.
 *
 * The student tab also absorbed what used to be a separate "học sinh sáng tạo"
 * section further down the page. That section made no claim this one does not,
 * and two sections making the same claim is how a page gets long without getting
 * stronger.
 *
 * Every visual is a real render of an asset that ships in this repository, baked
 * through the shared thumbnail renderer. Nothing here is an illustration of a
 * product that does not exist.
 */

type RoleId = 'teacher' | 'student' | 'school';

const ROLES: {
  id: RoleId;
  tab: string;
  kicker: string;
  headline: string;
  lede: string;
  points: { title: string; body: string }[];
  cta: { label: string; href: string };
}[] = [
  {
    id: 'teacher',
    tab: 'Giáo viên',
    kicker: 'Soạn & tổ chức',
    headline: 'Soạn bài giảng 3D không cần viết code.',
    lede: 'Chọn học liệu, dựng không gian, gắn ghi chú và xếp nhịp trình bày — tất cả trong một scene dùng lại được cho các lớp sau.',
    points: [
      { title: 'Chọn học liệu', body: 'Mở thư viện theo môn và đưa mô hình vào bài.' },
      { title: 'Tạo bài học', body: 'Dựng không gian, đặt góc nhìn, chia thành từng bước.' },
      { title: 'Chú thích', body: 'Gắn kiến thức đúng vào bộ phận, đúng thời điểm.' },
      { title: 'Giao bài', body: 'Chia sẻ để mở trên web, màn hình lớp học hoặc XR.' },
      { title: 'Tổ chức hoạt động', body: 'Thêm hotspot và câu hỏi trả lời ngay trên mô hình.' },
    ],
    cta: { label: 'Xem YooLab', href: '#cong-cu' },
  },
  {
    id: 'student',
    tab: 'Học sinh',
    kicker: 'Khám phá & tạo',
    headline: 'Không chỉ xem. Tự tay tạo ra.',
    lede: 'Xoay, tách lớp và đọc chú thích trên mô hình thật — rồi tự dựng scene 3D/XR của mình và trình bày nó.',
    points: [
      { title: 'Xoay & quan sát', body: 'Nhìn mô hình từ mọi phía, phóng vào chi tiết.' },
      { title: 'Tương tác', body: 'Đổi trạng thái, tách lớp, mở chú thích.' },
      { title: 'Thực hành', body: 'Làm những thao tác khó thực hiện trong lớp.' },
      { title: 'Tạo scene', body: 'Chọn học liệu, sắp đặt không gian, chọn góc nhìn.' },
      { title: 'Trình bày', body: 'Dẫn người xem theo mạch của mình, kể cả trong XR.' },
    ],
    cta: { label: 'Mở thư viện học liệu', href: '#thu-vien' },
  },
  {
    id: 'school',
    tab: 'Nhà trường',
    kicker: 'Triển khai',
    headline: 'Một kho học liệu số cho toàn trường.',
    lede: 'Học liệu và bài giảng ở cùng một nơi, để giáo viên mới nhận lớp là dùng được ngay.',
    points: [
      { title: 'Học liệu số', body: 'Thư viện dùng chung cho nhiều lớp, nhiều khối.' },
      { title: 'Đồng hành cùng giáo viên', body: 'Hỗ trợ trong giai đoạn đầu làm quen.' },
      { title: 'Lớp học', body: 'Mở bài giảng trên web hoặc màn hình lớp.' },
      { title: 'Năng lực số', body: 'Giáo viên và học sinh đều tạo được nội dung 3D.' },
      { title: 'Triển khai theo quy mô', body: 'Mở rộng theo từng trường, từng tổ bộ môn.' },
    ],
    cta: { label: 'Nhận tư vấn triển khai', href: '#bat-dau-voi-yoolab' },
  },
];

export function EducationSection() {
  const [role, setRole] = useState<RoleId>('teacher');
  const active = ROLES.find((entry) => entry.id === role) ?? ROLES[0];

  return (
    <section className="education" id="giao-duc" aria-labelledby="education-title">
      <div className="shell-editorial">
        <div className="section-heading section-heading--split" data-reveal>
          <div>
            <p className="section-kicker">Dành cho giáo dục</p>
            <h2 id="education-title">Một nền tảng.<br /><em>Ba cách sử dụng.</em></h2>
          </div>
          <p>Cùng một mô hình phục vụ ba việc khác nhau. Chọn phần của bạn.</p>
        </div>

        <div className="education-tabs" role="tablist" aria-label="Vai trò" data-reveal>
          {ROLES.map((entry) => (
            <button
              type="button"
              role="tab"
              key={entry.id}
              aria-selected={role === entry.id}
              className={role === entry.id ? 'is-active' : ''}
              onClick={() => setRole(entry.id)}
            >
              {entry.tab}
            </button>
          ))}
        </div>

        <div className="education-panel" role="tabpanel" aria-label={active.tab} data-reveal>
          <div className="education-copy">
            <p className="education-kicker">{active.kicker}</p>
            <h3>{active.headline}</h3>
            <p className="education-lede">{active.lede}</p>
            <ol className="education-points">
              {active.points.map((point, index) => (
                <li key={point.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <b>{point.title}</b>
                  <small>{point.body}</small>
                </li>
              ))}
            </ol>
            <a className="education-cta" href={active.cta.href}>
              {active.cta.label} <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="education-visual">
            {role === 'teacher' && (
              <div className="edu-compose" aria-hidden="true">
                <div className="edu-compose-frame">
                  <div className="edu-rail"><i /><i /><i /><i /></div>
                  <div className="edu-stage">
                    <ModelThumbnail request={JELLYFISH_THUMBNAIL} alt="" />
                    <span className="edu-marker">Màng ngoài</span>
                  </div>
                  <div className="edu-layers">
                    <b>Đối tượng</b>
                    <i>Màng ngoài</i><i>Tầng mô giữa</i><i>Khoang tiêu hoá</i><i>Ghi chú 01</i>
                  </div>
                </div>
                <div className="edu-timeline">
                  <span style={{ background: '#A852FC' }}>Model</span>
                  <span style={{ background: '#2B7FFF' }}>Văn bản</span>
                  <span style={{ background: '#00C950' }}>Âm thanh</span>
                  <span style={{ background: '#F6339A' }}>Hiệu ứng</span>
                </div>
              </div>
            )}

            {role === 'student' && (
              <div className="edu-explore" aria-hidden="true">
                <ModelThumbnail request={BEE_THUMBNAIL} alt="" />
                <span className="edu-pin edu-pin--a"><i />Ngực</span>
                <span className="edu-pin edu-pin--b"><i />Cánh</span>
                <span className="edu-pin edu-pin--c"><i />Bụng</span>
                <span className="edu-hint">Kéo để xoay · Nhấp để xem chú thích</span>
                <div className="edu-steps">
                  <span className="is-done">Chọn mô hình</span>
                  <span className="is-done">Sắp cảnh</span>
                  <span className="is-active">Ghi chú</span>
                  <span>Trình bày</span>
                </div>
              </div>
            )}

            {role === 'school' && (
              <div className="edu-deploy" aria-hidden="true">
                <ModelThumbnail request={CLOWNFISH_THUMBNAIL} alt="" />
                <ModelThumbnail request={JELLYFISH_THUMBNAIL} alt="" />
                <div className="edu-tile">
                  <b>Thư viện dùng chung</b>
                  <small>Học liệu số đồng bộ cho mọi lớp</small>
                </div>
                <div className="edu-tile">
                  <b>Bài giảng chuẩn hoá</b>
                  <small>Tổ bộ môn dùng lại cùng một scene</small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
