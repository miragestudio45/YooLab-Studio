'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import authService from '../../lib/auth/auth-service';
import { describeApiError } from '../../lib/auth/http';
import { EyeIcon } from './shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the reference app's `ConfirmOtp` (src/components/auth/confirm-otp.tsx):
// OTP code + new password, submitted against the same
// ConfirmResetPassword{Email,Sms}Global endpoints, then logs the user in
// with the new password.
export function ConfirmResetPasswordModal({
  emailOrPhone,
  onClose,
  onDone,
}: {
  emailOrPhone: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(300);

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
    if (!otpCode.trim()) {
      setError('Nhập mã OTP');
      return;
    }
    if (!newPassword) {
      setError('Nhập mật khẩu mới');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (/\s/.test(newPassword)) {
      setError('Mật khẩu không được chứa cách');
      return;
    }

    setError('');
    setPending(true);
    try {
      const isEmail = EMAIL_RE.test(emailOrPhone);
      if (isEmail) {
        await authService.confirmResetPasswordEmailGlobal({ email: emailOrPhone, otpCode, newPassword });
      } else {
        await authService.confirmResetPasswordSmsGlobal({ phoneNumber: emailOrPhone, otpCode, newPassword });
      }
      router.replace('/');
      onDone();
    } catch (error) {
      setError(describeApiError(error));
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError('');
    try {
      const isEmail = EMAIL_RE.test(emailOrPhone);
      if (isEmail) await authService.sendForgotPasswordEmailOtp({ email: emailOrPhone });
      else await authService.sendForgotPasswordSmsOtp({ phoneNumber: emailOrPhone });
      setSeconds(300);
    } catch (error) {
      setError(describeApiError(error));
    } finally {
      setResending(false);
    }
  };

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  return (
    <div className="auth-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Nhập mã xác minh">
        <div className="auth-modal-head">
          <h3 className="auth-modal-title">Nhập mã xác minh</h3>
          <button className="auth-modal-close" type="button" aria-label="Đóng" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="auth-modal-copy">
          Một mã xác minh vừa được gửi tới <strong>{emailOrPhone}</strong>. Nhập mã và mật khẩu mới bên dưới.
        </p>

        <div className="auth-otp-row">
          <input
            className="auth-otp-input"
            value={otpCode}
            placeholder="Mã OTP"
            aria-invalid={Boolean(error)}
            onChange={(event) => { setOtpCode(event.target.value.toUpperCase()); setError(''); }}
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

        <div className="auth-field">
          <div className="auth-input-wrap">
            <label htmlFor="reset-new-password">Đặt lại mật khẩu</label>
            <input
              id="reset-new-password"
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mật khẩu mới"
              value={newPassword}
              aria-invalid={Boolean(error)}
              onChange={(event) => { setNewPassword(event.target.value); setError(''); }}
              onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
            />
            <button
              type="button"
              className="auth-input-icon auth-input-icon--button"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShowPassword((value) => !value)}
            >
              <EyeIcon off={showPassword} />
            </button>
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
