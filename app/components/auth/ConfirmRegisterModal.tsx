'use client';

import { useEffect, useState } from 'react';
import authService from '../../lib/auth/auth-service';
import { describeApiError } from '../../lib/auth/http';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the reference app's `ConfirmRegister`: verify the OTP against
// VerifyActiveAccountEmail/Sms, resend via ReSendVerificationOtp.
export function ConfirmRegisterModal({
  account,
  initialSeconds = 300,
  onClose,
  onVerified,
}: {
  account: string;
  initialSeconds?: number;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timeout = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [seconds]);

  const submit = async () => {
    if (!code.trim()) {
      setError('Nhập OTP');
      return;
    }
    setError('');
    setPending(true);
    try {
      const isEmail = EMAIL_RE.test(account);
      if (isEmail) await authService.verifyActiveAccountEmail({ email: account, code });
      else await authService.verifyPhoneNumberOtpCode({ phoneNumber: account, code });
      onVerified();
    } catch (error) {
      setError(describeApiError(error, 'Xác thực không thành công'));
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError('');
    try {
      const isEmail = EMAIL_RE.test(account);
      await authService.reSendVerificationOtp(
        isEmail ? { fullName: '', email: account } : { fullName: '', phoneNumber: account },
      );
      setSeconds(300);
    } catch (error) {
      setError(describeApiError(error, 'Gửi OTP không thành công'));
    } finally {
      setResending(false);
    }
  };

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  return (
    <div className="auth-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Xác thực đăng ký">
        <div className="auth-modal-head">
          <h3 className="auth-modal-title">Xác thực đăng ký</h3>
          <button className="auth-modal-close" type="button" aria-label="Đóng" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="auth-modal-copy">
          Nhập mã OTP vừa được gửi tới <strong>{account}</strong>.
        </p>

        <div className="auth-otp-row">
          <input
            className="auth-otp-input"
            value={code}
            placeholder="Mã OTP"
            aria-invalid={Boolean(error)}
            onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(''); }}
            onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
          />
          <div className="auth-otp-timer" aria-live="polite">
            {seconds > 0 ? (
              <span className="auth-otp-countdown">{minutes}:{secs}</span>
            ) : (
              <button type="button" className="auth-otp-resend" disabled={resending} onClick={resend}>
                {resending ? '...' : 'Gửi lại'}
              </button>
            )}
          </div>
        </div>
        {error && <span className="auth-field-error">{error}</span>}

        <div className="auth-modal-actions">
          <button className="auth-modal-cancel" type="button" onClick={onClose}>
            Huỷ
          </button>
          <button className="auth-modal-submit" type="button" disabled={pending} onClick={submit}>
            {pending && <span className="auth-spinner" />}
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
