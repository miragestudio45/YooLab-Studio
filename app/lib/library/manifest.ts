import type { ExperienceManifest, Subject, SubjectId } from './types';
import { BIOLOGY_EXPERIENCES } from './subjects/biology';
import { CHEMISTRY_EXPERIENCES } from './subjects/chemistry';
import { PHYSICS_EXPERIENCES } from './subjects/physics';
import { EARTH_EXPERIENCES } from './subjects/earth';
import { STEM_EXPERIENCES } from './subjects/stem';

/**
 * The YooLab Library.
 *
 * Seven subjects, and only the experiences that actually run in this build.
 *
 * There is no padding here. A subject with nothing behind it says so — the
 * alternative, filling it with plausible-looking cards, is the one thing that
 * would make the rest of this page untrustworthy.
 *
 * The entries themselves live one file per subject under `subjects/`. This file
 * is only the join and the queries over it.
 */

export const SUBJECTS: Subject[] = [
  { id: 'sinh-hoc', label: 'Sinh học', note: 'Cơ thể · Tế bào · Vi sinh', tint: 'var(--color-sage)' },
  { id: 'hoa-hoc', label: 'Hóa học', note: 'Nguyên tố · Cấu tạo chất', tint: 'var(--color-accent-strong)' },
  { id: 'vat-ly', label: 'Vật lý', note: 'Chuyển động · Lực · Sóng', tint: 'var(--color-lavender)' },
  { id: 'dia-ly', label: 'Địa lý & Trái Đất', note: 'Địa cầu · Cấu tạo hành tinh', tint: 'var(--color-cyan)' },
  { id: 'stem', label: 'KHCN & STEM', note: 'Kỹ thuật · Thực hành', tint: 'var(--color-accent-deep)' },
  { id: 'vu-tru', label: 'Khoa học vũ trụ', note: 'Hệ Mặt Trời · Phi hành', tint: 'var(--color-lavender)' },
  { id: 'lich-su', label: 'Lịch sử & Văn hóa', note: 'Di sản · Cổ vật', tint: 'var(--color-blush)' },
];

/** Subjects with no `ready` entry yet, and the honest reason. */
export const SUBJECT_GAPS: Partial<Record<SubjectId, string>> = {
  'vu-tru':
    'Học liệu vũ trụ đang được bổ sung. YooLab chỉ đưa vào thư viện những mô hình đã xác minh được nguồn và giấy phép sử dụng — chưa có mô hình nào của môn này đạt điều kiện đó.',
  'lich-su':
    'Học liệu lịch sử & văn hóa đang được bổ sung. Cổ vật số cần thoả thuận với đơn vị lưu giữ hiện vật, nên phần này sẽ mở khi có nguồn hợp lệ.',
};

export const EXPERIENCES: ExperienceManifest[] = [
  ...BIOLOGY_EXPERIENCES,
  ...CHEMISTRY_EXPERIENCES,
  ...PHYSICS_EXPERIENCES,
  ...EARTH_EXPERIENCES,
  ...STEM_EXPERIENCES,
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

/** Related items inside the same subject, for the strip under the workspace. */
export function relatedExperiences(item: ExperienceManifest, limit = 3) {
  return EXPERIENCES.filter(
    (entry) => entry.subject === item.subject && entry.id !== item.id && entry.status === 'ready',
  ).slice(0, limit);
}

/** Biology leads: it has the most verified assets, so it is what opens. */
export const DEFAULT_SUBJECT: SubjectId = 'sinh-hoc';
