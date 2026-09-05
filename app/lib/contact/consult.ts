/**
 * The consultation lead, and the one place it is sent from.
 *
 * ## Why this file is separate from the form
 *
 * There is no lead endpoint in this repository. `EducationSection` already said
 * so in a comment and answered it with a `mailto:` link, which is honest but
 * asks the visitor to write the message themselves — the exact gap MKT reported
 * ("no clear way to submit their needs").
 *
 * A form can fix the writing without inventing a backend, but only if it is
 * clear about what actually happens on submit. So the transport lives here,
 * alone, behind one function with one return type, and the UI renders whatever
 * that returns. When a real endpoint exists, `CONSULT_ENDPOINT` is the only line
 * that changes and the form is untouched.
 *
 * ## What it must never do
 *
 * Report success for something that was not sent. A "Gửi thành công" toast over
 * a request that never left the browser is worse than no form: the visitor stops
 * waiting for a reply that is never coming. The `handoff` outcome below exists
 * precisely so the UI can say "your mail app is open, press send" instead.
 */

export type ConsultAudience = 'ca-nhan' | 'to-chuc';

export type ConsultLead = {
  name: string;
  audience: ConsultAudience;
  email: string;
  phone: string;
  need: string;
  /** Which CTA opened the dialog, so a future endpoint can attribute the lead. */
  source?: string;
};

export type ConsultResult =
  /** A real endpoint accepted it. */
  | { status: 'sent' }
  /** No endpoint configured: the visitor's mail client was opened, pre-filled. */
  | { status: 'handoff'; mailto: string }
  | { status: 'error'; message: string };

export const CONSULT_MAILBOX = 'hello@yoolab.vn';

/**
 * Set this to a POST endpoint that accepts `ConsultLead` as JSON and the form
 * starts submitting for real. Empty means "no backend yet", which is the
 * current, documented state of this repository.
 */
const CONSULT_ENDPOINT = '';

const AUDIENCE_LABEL: Record<ConsultAudience, string> = {
  'ca-nhan': 'Cá nhân',
  'to-chuc': 'Tổ chức',
};

/** RFC-shaped enough to catch a typo without rejecting a valid address. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Vietnamese numbers, allowing spaces, dots, dashes and a +84 prefix. */
const PHONE = /^\+?[\d\s.\-()]{8,16}$/;

export type ConsultErrors = Partial<Record<keyof ConsultLead, string>>;

/**
 * Field-level validation, shared by the live form and by `submitConsult`.
 *
 * Returned as a map rather than thrown, because every invalid field has to be
 * marked at once: a form that reports its problems one at a time makes the
 * visitor submit five times to find out about five fields.
 */
export function validateConsult(lead: ConsultLead): ConsultErrors {
  const errors: ConsultErrors = {};
  if (!lead.name.trim()) errors.name = 'Cho chúng tôi biết tên của bạn.';
  else if (lead.name.trim().length < 2) errors.name = 'Tên quá ngắn.';

  if (!lead.email.trim()) errors.email = 'Cần email để chúng tôi trả lời bạn.';
  else if (!EMAIL.test(lead.email.trim())) errors.email = 'Email chưa đúng định dạng.';

  if (!lead.phone.trim()) errors.phone = 'Cần số điện thoại để liên hệ nhanh.';
  else if (!PHONE.test(lead.phone.trim())) errors.phone = 'Số điện thoại chưa hợp lệ.';

  if (!lead.need.trim()) errors.need = 'Mô tả ngắn nhu cầu để chúng tôi chuẩn bị trước.';
  else if (lead.need.trim().length < 10) errors.need = 'Viết thêm một chút để chúng tôi hiểu đúng nhu cầu.';

  return errors;
}

function composeMailto(lead: ConsultLead): string {
  const subject = `Tư vấn YooLab — ${lead.name.trim()} (${AUDIENCE_LABEL[lead.audience]})`;
  const body = [
    `Tên: ${lead.name.trim()}`,
    `Đối tượng: ${AUDIENCE_LABEL[lead.audience]}`,
    `Email: ${lead.email.trim()}`,
    `Số điện thoại: ${lead.phone.trim()}`,
    lead.source ? `Nguồn: ${lead.source}` : '',
    '',
    'Nhu cầu:',
    lead.need.trim(),
  ].filter(Boolean).join('\n');
  return `mailto:${CONSULT_MAILBOX}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function submitConsult(lead: ConsultLead): Promise<ConsultResult> {
  const errors = validateConsult(lead);
  if (Object.keys(errors).length) {
    return { status: 'error', message: 'Vui lòng kiểm tra lại các trường còn thiếu.' };
  }

  if (!CONSULT_ENDPOINT) {
    /* No backend. Hand the composed message to the visitor's mail client and
       let the UI say exactly that — see the note at the top of this file. */
    return { status: 'handoff', mailto: composeMailto(lead) };
  }

  try {
    const response = await fetch(CONSULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
    if (!response.ok) {
      return { status: 'error', message: 'Không gửi được lúc này. Bạn thử lại giúp chúng tôi nhé.' };
    }
    return { status: 'sent' };
  } catch {
    return { status: 'error', message: 'Mất kết nối. Kiểm tra mạng rồi thử lại giúp chúng tôi.' };
  }
}
