import Cookies from 'js-cookie';
import { ACCESS_TOKEN_KEY, ACCESS_TOKEN_PERMISSIONS, DOMAIN } from './config';
import { http, httpNoAuth, type AbpResponse } from './http';

// Ported endpoint-for-endpoint from the reference app's `authService`
// (src/services/auth/auth.service.ts) — same paths, same payload shapes,
// same cookie contract — against whatever backend NEXT_PUBLIC_BASE_URL
// eventually points at. Only the pieces this site's login/register/forgot-
// password screens need are ported; profile/avatar/logout endpoints belong
// to the dashboard app, not this one.

export type LoginInput = {
  userNameOrEmailAddress: string;
  password: string;
  rememberClient?: boolean;
};

export type ExternalAuthProvider = 'Google' | 'Facebook' | 'Apple';

export type LoginExternalInput = {
  authProvider: ExternalAuthProvider;
  providerKey: string;
  providerAccessCode: string;
  emailAddress?: string;
  name?: string;
  surName?: string;
  imageUrl?: string;
};

export type RegisterInput = {
  emailOrPhoneNumber: string;
  fullName: string;
  password: string;
  referral?: string;
};

type LoginResultData = {
  tenantId?: number | string;
  accessToken?: string;
  encryptedAccessToken?: string;
  refreshToken?: string;
  expireInSeconds?: number;
};

function applySessionCookies(data: LoginResultData) {
  if (typeof window === 'undefined') return;

  if (data.tenantId) Cookies.set('tenantId', String(data.tenantId));

  const expires = (data.expireInSeconds ?? 86400) / (3600 * 24);
  const cookieOptions: Cookies.CookieAttributes = {
    expires,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  };
  if (DOMAIN && window.location.hostname.includes(DOMAIN.replace(/^\./, ''))) {
    cookieOptions.domain = DOMAIN;
  }

  if (data.accessToken) Cookies.set(ACCESS_TOKEN_KEY, data.accessToken, cookieOptions);
  if (data.encryptedAccessToken) Cookies.set('encryptedAccessToken', data.encryptedAccessToken, cookieOptions);
  if (data.refreshToken) Cookies.set('refreshToken', data.refreshToken, cookieOptions);

  return cookieOptions;
}

async function finishLogin(data: LoginResultData) {
  const cookieOptions = applySessionCookies(data);
  try {
    const configResponse = await http.request<AbpResponse<{ auth?: { grantedPermissions?: Record<string, string> } }>>({
      url: '/AbpUserConfiguration/GetAll',
      method: 'GET',
    });
    const permissions = configResponse.data.result?.auth?.grantedPermissions?.['Data.Admin'];
    if (permissions && cookieOptions) {
      Cookies.set(ACCESS_TOKEN_PERMISSIONS, permissions === 'true' ? '88' : '0', cookieOptions);
    }
  } catch {
    // Non-fatal: the session cookies are already set even if the follow-up
    // permissions fetch fails (e.g. backend not configured yet).
  }
}

async function login(input: LoginInput) {
  const response = await httpNoAuth.request<AbpResponse<LoginResultData>>({
    url: '/api/TokenAuth/AuthenticateStudio',
    method: 'post',
    data: input,
  });
  await finishLogin(response.data.result);
  return true;
}

async function loginExternal(input: LoginExternalInput) {
  const response = await httpNoAuth.request<AbpResponse<LoginResultData>>({
    url: '/api/GlobalAuth/ExternalAuthenticateStudio',
    method: 'post',
    data: input,
  });
  await finishLogin(response.data.result);
  return true;
}

type RegisterResultData = {
  canLogin?: boolean;
  timeCodeExpire?: string;
  totalSeconds?: number;
};

type RegisterResult = {
  result_Code?: number;
  message?: string;
  data?: RegisterResultData;
};

async function register(input: RegisterInput) {
  const response = await httpNoAuth.request<AbpResponse<RegisterResult>>({
    url: '/api/services/app/AccountErp/RegisterStudio',
    method: 'post',
    data: { ...input, voucherCode: 'KT01' },
  });

  if (!response.data.success) throw new Error('Đăng ký thất bại');

  const result = response.data.result ?? {};
  if (result.result_Code === 400) throw new Error(result.message || 'Đăng ký thất bại');

  if (result.result_Code === 203) void reSendVerificationEmailOtp({ email: input.emailOrPhoneNumber });
  if (result.result_Code === 202) void reSendVerificationSmsOtp({ phoneNumber: input.emailOrPhoneNumber });

  const data = result.data ?? {};
  let totalSeconds = 300;
  if (data.timeCodeExpire) {
    const parts = data.timeCodeExpire.split(':').map(Number);
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  data.totalSeconds = totalSeconds;

  return { ...result, data };
}

async function reSendVerificationOtp(data: { fullName: string; email?: string; phoneNumber?: string }) {
  await httpNoAuth.request({ method: 'post', url: '/api/services/app/AccountErp/ReSendVerificationOtp', data });
}

async function reSendVerificationEmailOtp(data: { email: string }) {
  await http.request({ method: 'post', url: '/api/services/app/GlobalAccount/ReSendVerificationEmailOtp', data });
}

async function reSendVerificationSmsOtp(data: { phoneNumber: string }) {
  await http.request({ method: 'post', url: '/api/services/app/GlobalAccount/ReSendVerificationSmsOtp', data });
}

async function verifyActiveAccountEmail(data: { code: string; email: string }) {
  await http.request({ method: 'post', url: '/api/services/app/AccountErp/VerifyActiveAccountEmail', data });
}

async function verifyPhoneNumberOtpCode(data: { code: string; phoneNumber: string }) {
  await http.request({ method: 'post', url: '/api/services/app/GlobalAccount/VerifyActiveAccountSms', data });
}

async function sendForgotPasswordEmailOtp(data: { email: string }) {
  await http.request({ method: 'post', url: '/api/services/app/GlobalAccount/SendForgotPasswordEmailOtp', data });
}

async function sendForgotPasswordSmsOtp(data: { phoneNumber: string }) {
  await http.request({ method: 'post', url: '/api/services/app/GlobalAccount/SendForgotPasswordSmsOtp', data });
}

async function confirmResetPasswordEmailGlobal(data: { otpCode: string; email: string; newPassword: string }) {
  const response = await http.request<AbpResponse<unknown>>({
    method: 'post',
    url: '/api/services/app/GlobalAccount/ConfirmResetPasswordEmailGlobal',
    data,
  });
  if (response.data.success) {
    return login({ userNameOrEmailAddress: data.email, password: data.newPassword, rememberClient: true });
  }
}

async function confirmResetPasswordSmsGlobal(data: { otpCode: string; phoneNumber: string; newPassword: string }) {
  const response = await http.request<AbpResponse<unknown>>({
    method: 'post',
    url: '/api/services/app/GlobalAccount/ConfirmResetPasswordSmsGlobal',
    data,
  });
  if (response.data.success) {
    return login({ userNameOrEmailAddress: data.phoneNumber, password: data.newPassword, rememberClient: true });
  }
}

// Real shape of StudioUserProfile/GetMine's `data`; only `id`, `fullName`
// and `imageUrl` are actually used on this site right now, the rest is kept
// loosely typed since the endpoint returns more than that.
export type UserDetail = {
  id: number;
  fullName?: string;
  imageUrl?: string | null;
  [key: string]: unknown;
};

// Reads `.data`, not `.result` — same field the reference app's own
// `getUserDetailRequest` reads off this envelope.
async function getUserDetailRequest(): Promise<UserDetail> {
  const response = await http.request<AbpResponse<UserDetail>>({
    url: '/studio/api/services/app/StudioUserProfile/GetMine',
    method: 'get',
  });
  if (!response.data.data) throw new Error('User data not found');
  return response.data.data;
}

function sessionCookieOptions(): Cookies.CookieAttributes {
  const options: Cookies.CookieAttributes = { path: '/' };
  if (typeof window !== 'undefined' && DOMAIN && window.location.hostname.includes(DOMAIN.replace(/^\./, ''))) {
    options.domain = DOMAIN;
  }
  return options;
}

function clearSessionCookies(): void {
  const options = sessionCookieOptions();
  Cookies.remove(ACCESS_TOKEN_KEY, options);
  Cookies.remove('encryptedAccessToken', options);
  Cookies.remove('refreshToken', options);
  Cookies.remove('tenantId', options);
  Cookies.remove(ACCESS_TOKEN_PERMISSIONS, options);
}

// Same endpoint as the reference app's `authService.logout` — the session
// cookies are cleared locally either way, even if the request itself fails.
async function logout(): Promise<void> {
  try {
    await http.request({ method: 'get', url: '/api/TokenAuth/LogOut' });
  } finally {
    clearSessionCookies();
  }
}

const authService = {
  login,
  loginExternal,
  register,
  reSendVerificationOtp,
  reSendVerificationEmailOtp,
  reSendVerificationSmsOtp,
  verifyActiveAccountEmail,
  verifyPhoneNumberOtpCode,
  sendForgotPasswordEmailOtp,
  sendForgotPasswordSmsOtp,
  confirmResetPasswordEmailGlobal,
  confirmResetPasswordSmsGlobal,
  getUserDetailRequest,
  logout,
};

export default authService;
