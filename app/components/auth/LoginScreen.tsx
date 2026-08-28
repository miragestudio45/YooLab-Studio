'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import authService from '../../lib/auth/auth-service';
import { openDeeplinkProject } from '../../lib/auth/deeplink';
import { describeApiError } from '../../lib/auth/http';
import { discardPendingTab, openBlankTab } from '../../lib/auth/session';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { GoogleSocialButton } from './GoogleSocialButton';
import { signInWithApple, signInWithFacebook, type SocialResult } from './social-handlers';
import { AppleIcon, EyeIcon, FacebookIcon, HERO_IMAGE, UserIcon } from './shared';

const PHONE_RE = /^(\+?84|0)(3|5|7|8|9)[0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_KEY = 'yoolab_remember_account';
// Written by the register flow right before it redirects here, and consumed once.
export const REGISTER_PREFILL_KEY = 'yoolab_register_prefill';

// Peeked once, on the first client render: the register flow leaves this
// behind right before it redirects here. A pure read only — no removal here,
// since a lazy useState initializer can be invoked twice (React StrictMode
// probes it for purity in dev), and a side effect on the first call would
// make the second call see nothing. The clear happens in an effect below.
function peekRegisterPrefill(): { account?: string; password?: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(REGISTER_PREFILL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { account?: string; password?: string };
  } catch {
    return null;
  }
}

export function LoginScreen() {
  const router = useRouter();
  const [prefill] = useState(peekRegisterPrefill);
  const [account, setAccount] = useState(() =>
    prefill?.account ?? (typeof window === 'undefined' ? '' : window.localStorage.getItem(REMEMBER_KEY) ?? ''),
  );
  const [password, setPassword] = useState(() => prefill?.password ?? '');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ account?: string; password?: string }>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(
    () => (prefill ? { kind: 'success', text: 'Đăng ký thành công, đăng nhập để tiếp tục' } : null),
  );
  const [pending, setPending] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [studioLinkVisible, setStudioLinkVisible] = useState(false);

  useEffect(() => {
    if (prefill) window.sessionStorage.removeItem(REGISTER_PREFILL_KEY);
    // Runs once per mount; `prefill` is read-only state from the initializer above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = () => {
    const next: typeof errors = {};
    if (!account.trim()) {
      next.account = 'Vui lòng nhập số điện thoại hoặc email';
    } else if (!PHONE_RE.test(account) && !EMAIL_RE.test(account)) {
      next.account = 'Số điện thoại hoặc email không hợp lệ';
    }
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

    // Opened synchronously, still inside this click's user-gesture window —
    // openDeeplinkProject() redirects it once the account's project is
    // resolved, or closes it on failure. Only plain email/password login
    // does this; social login below just goes home, same as the reference.
    openBlankTab();
    setPending(true);
    try {
      await authService.login({ userNameOrEmailAddress: account, password, rememberClient: remember });
      if (remember) window.localStorage.setItem(REMEMBER_KEY, account);
      else window.localStorage.removeItem(REMEMBER_KEY);
      setBanner({ kind: 'success', text: 'Đăng nhập thành công' });
      void openDeeplinkProject();
      setStudioLinkVisible(true);
      setTimeout(() => router.push('/'), 500);
    } catch (error) {
      discardPendingTab();
      setBanner({ kind: 'error', text: describeApiError(error) });
    } finally {
      setPending(false);
    }
  };

  const onSocialResult = (result: SocialResult) => {
    if (result.status === 'success') {
      setBanner({ kind: 'success', text: 'Đăng nhập thành công' });
      router.replace('/');
    } else {
      setBanner({ kind: 'error', text: result.message });
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-mobile-backdrop" style={{ backgroundImage: `url(${HERO_IMAGE})` }} aria-hidden="true" />
      <div className="auth-visual" style={{ backgroundImage: `url(${HERO_IMAGE})` }} aria-hidden="true" />

      <main className="auth-panel">
        <div className="auth-panel-inner">
          <div>
            <div className="auth-header">
              <p className="auth-title">Đăng nhập vào YooLab</p>
              <div className="auth-mark">
                <img className="auth-mark-logo" src="/brand/yoolab-login-mark.svg" alt="YooLab" width={100} height={100} />
                <p className="auth-subtitle">Nền tảng soạn giảng &amp; thực hành thí nghiệm 3D/VR/XR</p>
              </div>
            </div>

            {banner && <div className={`auth-banner auth-banner--${banner.kind}`}>{banner.text}</div>}
            {studioLinkVisible && (
              <button type="button" className="auth-studio-link" onClick={() => openDeeplinkProject()}>
                Tab YooLab Studio chưa mở? Bấm vào đây
              </button>
            )}

            <form className="auth-form" onSubmit={onSubmit} noValidate>
              <div className="auth-field">
                <div className="auth-input-wrap">
                  <label htmlFor="login-account">Email/Số điện thoại</label>
                  <input
                    id="login-account"
                    className="auth-input"
                    type="text"
                    autoComplete="username"
                    placeholder="Nhập email hoặc số điện thoại"
                    value={account}
                    aria-invalid={Boolean(errors.account)}
                    onChange={(event) => setAccount(event.target.value)}
                  />
                  <span className="auth-input-icon">
                    <UserIcon />
                  </span>
                </div>
                {errors.account && <span className="auth-field-error">{errors.account}</span>}
              </div>

              <div className="auth-field">
                <div className="auth-input-wrap">
                  <label htmlFor="login-password">Mật khẩu</label>
                  <input
                    id="login-password"
                    className="auth-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
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

              <div className="auth-options">
                <label className="auth-remember">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  Ghi nhớ mật khẩu
                </label>
                <button type="button" className="auth-forgot" onClick={() => setForgotOpen(true)}>
                  Quên mật khẩu ?
                </button>
              </div>

              <button className="auth-submit" type="submit" disabled={pending}>
                {pending && <span className="auth-spinner" />}
                Đăng nhập
              </button>
            </form>

            <p className="auth-register">
              Bạn chưa có tài khoản?
              <Link href="/register">Đăng ký</Link>
            </p>

            <div className="auth-divider">hoặc</div>

            <div className="auth-socials">
              <GoogleSocialButton onResult={onSocialResult} />
              <button type="button" className="auth-social" onClick={() => signInWithFacebook(onSocialResult)}>
                <FacebookIcon />
                Đăng nhập bằng Facebook
              </button>
              <button type="button" className="auth-social" onClick={() => signInWithApple(onSocialResult)}>
                <AppleIcon />
                Đăng nhập bằng Apple
              </button>
            </div>
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

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </div>
  );
}
