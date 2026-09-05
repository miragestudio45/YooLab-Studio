'use client';

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import {
  CONSULT_MAILBOX,
  submitConsult,
  validateConsult,
  type ConsultAudience,
  type ConsultErrors,
  type ConsultLead,
} from '../lib/contact/consult';

/**
 * One consultation form, opened from everywhere that asks for one.
 *
 * MKT's note was that the consultation action "does not give users a clear way
 * to submit their needs" — it was a `mailto:` and the visitor had to compose the
 * message. The fix is a real form, and the reason it lives behind a context
 * rather than inside a section is that three different CTAs want it: the final
 * "Trao đổi thêm", the Enterprise tier in the pricing table, and the school
 * conversion in the Education section. Three copies of a contact form is three
 * places for the field list to drift.
 *
 * The transport is deliberately not here — see `lib/contact/consult.ts`, which
 * is the single line to change when a lead endpoint exists.
 */

type ConsultApi = { open: (source?: string) => void };

const ConsultContext = createContext<ConsultApi | null>(null);

/** Opens the shared consultation dialog. Safe to call from any client component. */
export function useConsult(): ConsultApi {
  const api = useContext(ConsultContext);
  /* A no-op rather than a throw: a CTA that renders outside the provider should
     not take the page down, and the provider wraps the whole page anyway. */
  return api ?? { open: () => {} };
}

/**
 * A button that opens the shared consultation dialog.
 *
 * Exists so a server component — `page.tsx` is one — can place the action
 * without becoming a client component itself.
 */
export function ConsultButton({
  className,
  source,
  children,
}: {
  className?: string;
  source?: string;
  children: ReactNode;
}) {
  const consult = useConsult();
  return (
    <button type="button" className={className} onClick={() => consult.open(source)}>
      {children}
    </button>
  );
}

const EMPTY: ConsultLead = { name: '', audience: 'ca-nhan', email: '', phone: '', need: '' };

export function ConsultProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | undefined>();
  /*
   * Bumped on every open so the dialog remounts with fresh state.
   *
   * This used to be a `useEffect` that reset six pieces of state whenever
   * `open` flipped, which is a synchronous setState inside an effect — a
   * cascading render, and one React's own lint rule rejects. A key is the same
   * intent stated to React instead of fought with: "this is a new dialog", so
   * reopening cannot inherit the previous attempt's error states.
   */
  const [session, setSession] = useState(0);
  const api = useMemo<ConsultApi>(() => ({
    open: (from?: string) => {
      setSource(from);
      setSession((value) => value + 1);
      setOpen(true);
    },
  }), []);

  return (
    <ConsultContext.Provider value={api}>
      {children}
      <ConsultDialog key={session} open={open} source={source} onClose={() => setOpen(false)} />
    </ConsultContext.Provider>
  );
}

type Phase = 'form' | 'sending' | 'sent' | 'handoff';

function ConsultDialog({ open, source, onClose }: { open: boolean; source?: string; onClose: () => void }) {
  const uid = useId();
  const [lead, setLead] = useState<ConsultLead>(EMPTY);
  const [errors, setErrors] = useState<ConsultErrors>({});
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [failure, setFailure] = useState('');
  const [mailto, setMailto] = useState('');
  const firstInvalid = useRef<HTMLElement | null>(null);

  const field = useCallback(<K extends keyof ConsultLead>(key: K, value: ConsultLead[K]) => {
    setLead((prev) => {
      const next = { ...prev, [key]: value };
      /* Re-validate live only after the first submit: marking a field red while
         it is still being typed for the first time is nagging, not helping. */
      if (touched) setErrors(validateConsult(next));
      return next;
    });
  }, [touched]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const found = validateConsult(lead);
    setErrors(found);
    if (Object.keys(found).length) {
      firstInvalid.current?.focus();
      return;
    }
    setPhase('sending');
    setFailure('');
    const result = await submitConsult({ ...lead, source });
    if (result.status === 'sent') { setPhase('sent'); return; }
    if (result.status === 'handoff') {
      setMailto(result.mailto);
      setPhase('handoff');
      /* Open it for them; the panel below still explains what just happened, so
         a blocked popup does not leave the visitor with nothing. */
      window.location.href = result.mailto;
      return;
    }
    setPhase('form');
    setFailure(result.message);
  };

  const invalid = (key: keyof ConsultLead) => (touched && errors[key] ? true : undefined);
  const describe = (key: keyof ConsultLead) => (touched && errors[key] ? `${uid}-${key}-err` : undefined);

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={`${uid}-title`} className="consult-modal">
      <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng cửa sổ tư vấn">
        <span aria-hidden="true">✕</span>
      </button>

      {phase === 'sent' || phase === 'handoff' ? (
        <div className="consult-done">
          <p className="consult-eyebrow">YooLab</p>
          <h2 id={`${uid}-title`}>
            {phase === 'sent' ? 'Đã gửi. Cảm ơn bạn.' : 'Thư đã soạn sẵn cho bạn.'}
          </h2>
          {phase === 'sent' ? (
            <p>Chúng tôi sẽ liên hệ trong vòng một ngày làm việc.</p>
          ) : (
            <>
              {/*
                The honest wording. Nothing left the browser: there is no lead
                endpoint yet, so what happened is that the mail client was handed
                a message that is already written. Saying "Gửi thành công" here
                would leave the visitor waiting for a reply to a mail still
                sitting unsent in their drafts.
              */}
              <p>
                Chúng tôi đã điền sẵn nội dung vào ứng dụng email của bạn — bạn chỉ
                cần bấm gửi. Nếu ứng dụng email không tự mở, dùng nút bên dưới hoặc
                viết thẳng tới <b>{CONSULT_MAILBOX}</b>.
              </p>
              <a className="consult-submit" href={mailto}>Mở lại ứng dụng email</a>
            </>
          )}
          <button type="button" className="consult-secondary" onClick={onClose}>Đóng</button>
        </div>
      ) : (
        <form className="consult-form" onSubmit={onSubmit} noValidate>
          <p className="consult-eyebrow">YooLab</p>
          <h2 id={`${uid}-title`}>Trao đổi cùng chúng tôi</h2>
          <p className="consult-lede">
            Cho chúng tôi biết bạn đang dạy gì hoặc cần triển khai gì — chúng tôi sẽ
            dựng thử một scene cùng bạn.
          </p>

          <label className="consult-field">
            <span>Tên của bạn</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={lead.name}
              aria-invalid={invalid('name')}
              aria-describedby={describe('name')}
              ref={(node) => { if (touched && errors.name && !firstInvalid.current) firstInvalid.current = node; }}
              onChange={(event) => field('name', event.target.value)}
            />
            {touched && errors.name ? <em id={`${uid}-name-err`}>{errors.name}</em> : null}
          </label>

          <fieldset className="consult-field consult-audience">
            <legend>Đối tượng</legend>
            <div>
              {([['ca-nhan', 'Cá nhân'], ['to-chuc', 'Tổ chức']] as [ConsultAudience, string][]).map(([value, label]) => (
                <label key={value} className={lead.audience === value ? 'is-on' : undefined}>
                  <input
                    type="radio"
                    name={`${uid}-audience`}
                    value={value}
                    checked={lead.audience === value}
                    onChange={() => field('audience', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="consult-row">
            <label className="consult-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                value={lead.email}
                aria-invalid={invalid('email')}
                aria-describedby={describe('email')}
                onChange={(event) => field('email', event.target.value)}
              />
              {touched && errors.email ? <em id={`${uid}-email-err`}>{errors.email}</em> : null}
            </label>
            <label className="consult-field">
              <span>Số điện thoại</span>
              <input
                type="tel"
                name="phone"
                inputMode="tel"
                autoComplete="tel"
                value={lead.phone}
                aria-invalid={invalid('phone')}
                aria-describedby={describe('phone')}
                onChange={(event) => field('phone', event.target.value)}
              />
              {touched && errors.phone ? <em id={`${uid}-phone-err`}>{errors.phone}</em> : null}
            </label>
          </div>

          <label className="consult-field">
            <span>Mô tả nhu cầu của bạn</span>
            <textarea
              name="need"
              rows={4}
              value={lead.need}
              aria-invalid={invalid('need')}
              aria-describedby={describe('need')}
              onChange={(event) => field('need', event.target.value)}
            />
            {touched && errors.need ? <em id={`${uid}-need-err`}>{errors.need}</em> : null}
          </label>

          {failure ? <p className="consult-failure" role="alert">{failure}</p> : null}

          <button type="submit" className="consult-submit" disabled={phase === 'sending'}>
            {phase === 'sending' ? 'Đang gửi…' : 'Gửi yêu cầu tư vấn'}
          </button>
          <p className="consult-note">
            Hoặc viết thẳng tới <a href={`mailto:${CONSULT_MAILBOX}`}>{CONSULT_MAILBOX}</a>.
          </p>
        </form>
      )}
    </ModalShell>
  );
}
