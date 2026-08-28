'use client';

import { useEffect, useState } from 'react';
import authService from '../../lib/auth/auth-service';
import { apiErrorCode, describeApiError } from '../../lib/auth/http';
import { ConfirmResetPasswordModal } from './ConfirmResetPasswordModal';

const PHONE_RE = /^(\+?84|0)(3|5|7|8|9)[0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the reference app's `ForgotPassModal`: send an OTP to the given
// phone/email, then hand off to `ConfirmResetPasswordModal` (its `ConfirmOtp`)
// for the code + new password.
export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!emailOrPhone.trim()) {
      setError('Vui lòng nhập số điện thoại hoặc email');
      return;
    }
    if (!PHONE_RE.test(emailOrPhone) && !EMAIL_RE.test(emailOrPhone)) {
      setError('Số điện thoại hoặc email không hợp lệ');
      return;
    }

    setError('');
    setPending(true);
    try {
      const isEmail = EMAIL_RE.test(emailOrPhone);
      if (isEmail) await authService.sendForgotPasswordEmailOtp({ email: emailOrPhone });
      else await authService.sendForgotPasswordSmsOtp({ phoneNumber: emailOrPhone });
      setOtpOpen(true);
    } catch (error) {
      setError(apiErrorCode(error) === 404 ? 'Tài khoản không tồn tại' : describeApiError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Quên mật khẩu">
        <div className="auth-modal-head">
          <h3 className="auth-modal-title">Quên mật khẩu?</h3>
          <button className="auth-modal-close" type="button" aria-label="Đóng" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="auth-modal-copy">Nhập số điện thoại hoặc email đã đăng ký, chúng tôi sẽ gửi mã xác minh.</p>

        <div className="auth-field">
          <div className="auth-input-wrap">
            <label htmlFor="forgot-account">Số điện thoại hoặc email</label>
            <input
              id="forgot-account"
              className="auth-input"
              placeholder="Số điện thoại hoặc email"
              value={emailOrPhone}
              aria-invalid={Boolean(error)}
              onChange={(event) => { setEmailOrPhone(event.target.value); setError(''); }}
              onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
            />
          </div>
          {error && <span className="auth-field-error">{error}</span>}
        </div>

        <div className="auth-modal-actions">
          <button className="auth-modal-cancel" type="button" onClick={onClose}>
            Huỷ
          </button>
          <button className="auth-modal-submit" type="button" disabled={pending} onClick={submit}>
            {pending && <span className="auth-spinner" />}
            Gửi OTP
          </button>
        </div>
      </div>

      {otpOpen && (
        <ConfirmResetPasswordModal emailOrPhone={emailOrPhone} onClose={() => setOtpOpen(false)} onDone={onClose} />
      )}
    </div>
  );
}
