'use client';

import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import authService from '../../lib/auth/auth-service';
import { GOOGLE_AUTH_CLIENT_ID } from '../../lib/auth/config';
import { describeApiError } from '../../lib/auth/http';
import { GoogleIcon } from './shared';
import type { SocialResult } from './social-handlers';

type GoogleUserInfo = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

function GoogleButtonInner({ onResult }: { onResult: (result: SocialResult) => void }) {
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const data = (await response.json()) as GoogleUserInfo;
        await authService.loginExternal({
          authProvider: 'Google',
          providerAccessCode: tokenResponse.access_token,
          providerKey: data.sub,
          emailAddress: data.email,
          name: data.given_name,
          surName: data.family_name,
          imageUrl: data.picture,
        });
        onResult({ status: 'success' });
      } catch (error) {
        onResult({ status: 'error', message: describeApiError(error, 'Đăng nhập Google thất bại') });
      }
    },
    onError: () => onResult({ status: 'error', message: 'Đăng nhập Google thất bại' }),
  });

  return (
    <button type="button" className="auth-social" onClick={() => login()}>
      <GoogleIcon />
      Đăng nhập bằng Google
    </button>
  );
}

export function GoogleSocialButton({ onResult }: { onResult: (result: SocialResult) => void }) {
  if (!GOOGLE_AUTH_CLIENT_ID) {
    return (
      <button
        type="button"
        className="auth-social"
        onClick={() => onResult({ status: 'error', message: 'Thiếu NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID' })}
      >
        <GoogleIcon />
        Đăng nhập bằng Google
      </button>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_AUTH_CLIENT_ID}>
      <GoogleButtonInner onResult={onResult} />
    </GoogleOAuthProvider>
  );
}
