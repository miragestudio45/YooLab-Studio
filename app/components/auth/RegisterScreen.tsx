'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import authService from '../../lib/auth/auth-service';
import { describeApiError } from '../../lib/auth/http';
import { REGISTER_PREFILL_KEY } from './LoginScreen';
import { ConfirmRegisterModal } from './ConfirmRegisterModal';
import { EyeIcon, GiftIcon, HERO_IMAGE, IdCardIcon, UserIcon } from './shared';

const PHONE_RE = /^(\+?84|0)(3|5|7|8|9)[0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { account?: string; fullName?: string; password?: string };

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralFromLink = searchParams.get('referral') ?? '';

  const [account, setAccount] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState(referralFromLink);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpSeconds, setOtpSeconds] = useState(300);

  const validate = () => {
    const next: Errors = {};
    if (!account.trim()) {
      next.account = 'Vui lòng nhập số điện thoại hoặc email';
    } else if (!PHONE_RE.test(account) && !EMAIL_RE.test(account)) {
      next.account = 'Số điện thoại hoặc email không hợp lệ';
    }
    if (!fullName.trim()) next.fullName = 'Vui lòng nhập họ tên';
    if (!password) {
      next.password = 'Vui lòng nhập mật khẩu';
    } else if (password.length < 6) {
      next.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    } else if (/\s/.test(password)) {
      next.password = 'Mật khẩu không được chứa cách';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    if (!validate()) return;

    setPending(true);
    try {
      const result = await authService.register({ emailOrPhoneNumber: account, fullName, password, referral });
      if (result.result_Code === 204) {
        setBanner({ kind: 'error', text: 'Tài khoản này đã có, vui lòng đăng nhập' });
        router.push('/login');
        return;
      }
      if (result.data?.canLogin) {
        window.sessionStorage.setItem(REGISTER_PREFILL_KEY, JSON.stringify({ account, password }));
        router.push('/login');
        return;
      }
      setOtpSeconds(result.data?.totalSeconds || 300);
      setOtpOpen(true);
    } catch (error) {
      setBanner({ kind: 'error', text: describeApiError(error, 'Đăng ký thất bại') });
    } finally {
      setPending(false);
    }
  };

  const onVerified = () => {
    setOtpOpen(false);
    window.sessionStorage.setItem(REGISTER_PREFILL_KEY, JSON.stringify({ account, password }));
    router.push('/login');
  };

  return (
    <div className="auth-page">
      <div className="auth-mobile-backdrop" style={{ backgroundImage: `url(${HERO_IMAGE})` }} aria-hidden="true" />
      <div className="auth-visual" style={{ backgroundImage: `url(${HERO_IMAGE})` }} aria-hidden="true" />

      <main className="auth-panel">
        <div className="auth-panel-inner">
          <div>
            <div className="auth-header">
              <p className="auth-title">Đăng ký YooLab miễn phí</p>
              <div className="auth-mark">
                <img className="auth-mark-logo" src="/brand/yoolab-login-mark.svg" alt="YooLab" width={100} height={100} />
                <p className="auth-subtitle">Nền tảng soạn giảng &amp; thực hành thí nghiệm 3D/VR/XR</p>
              </div>
            </div>

            {banner && <div className={`auth-banner auth-banner--${banner.kind}`}>{banner.text}</div>}

            <form className="auth-form" onSubmit={onSubmit} noValidate>
              <div className="auth-field">
                <div className="auth-input-wrap">
                  <label htmlFor="register-account">Tên đăng nhập</label>
                  <input
                    id="register-account"
                    className="auth-input"
                    type="text"
                    autoComplete="username"
                    placeholder="Số điện thoại hoặc email"
                    value={account}
                    aria-invalid={Boolean(errors.account)}
                    onChange={(event) => setAccount(event.target.value)}
                  />
                  <span className="auth-input-icon"><IdCardIcon /></span>
                </div>
                {errors.account && <span className="auth-field-error">{errors.account}</span>}
              </div>

              <div className="auth-field">
                <div className="auth-input-wrap">
                  <label htmlFor="register-fullname">
                    Họ và tên <span className="auth-field-required">*</span>
                  </label>
                  <input
                    id="register-fullname"
                    className="auth-input"
                    type="text"
                    autoComplete="name"
                    placeholder="Họ và tên"
                    value={fullName}
                    aria-invalid={Boolean(errors.fullName)}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                  <span className="auth-input-icon"><UserIcon /></span>
                </div>
                {errors.fullName && <span className="auth-field-error">{errors.fullName}</span>}
              </div>

              <div className="auth-field">
                <div className="auth-input-wrap">
                  <label htmlFor="register-password">Mật khẩu</label>
                  <input
                    id="register-password"
                    className="auth-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mật khẩu"
                    value={password}
                    aria-invalid={Boolean(errors.password)}
                    onChange={(event) => setPassword(event.target.value)}
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
                {errors.password && <span className="auth-field-error">{errors.password}</span>}
              </div>

              <div className="auth-field">
                <div className="auth-input-wrap">
                  <label htmlFor="register-referral">Mã giới thiệu</label>
                  <input
                    id="register-referral"
                    className="auth-input"
                    type="text"
                    placeholder="Mã giới thiệu"
                    value={referral}
                    onChange={(event) => setReferral(event.target.value)}
                  />
                  <span className="auth-input-icon"><GiftIcon /></span>
                </div>
              </div>

              <button className="auth-submit" type="submit" disabled={pending}>
                {pending && <span className="auth-spinner" />}
                Đăng ký
              </button>
            </form>

            <p className="auth-register">
              Đã có tài khoản?
              {/* A plain next/link here silently fails to navigate on the
                  production vinext build (its client Link chunk throws on
                  click) even though it works in local dev — router.push,
                  same as the header CTA, is confirmed working in production. */}
              <button type="button" className="auth-register-link" onClick={() => router.push('/login')}>
                Đăng nhập
              </button>
            </p>
          </div>

          <div className="auth-foot">
            <span className="auth-foot-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .7 3a2 2 0 01-.5 2.1L8 10.1a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c1 .4 2 .6 3 .7a2 2 0 011.7 2z" />
              </svg>
              <a href="tel:+84964714148">+84 964 714 148</a>
            </span>
          </div>
        </div>
      </main>

      {otpOpen && (
        <ConfirmRegisterModal
          account={account}
          initialSeconds={otpSeconds}
          onClose={() => setOtpOpen(false)}
          onVerified={onVerified}
        />
      )}
    </div>
  );
}

export function RegisterScreen() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
