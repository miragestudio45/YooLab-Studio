import authService from '../../lib/auth/auth-service';
import { FACEBOOK_APP_ID, FACEBOOK_CLIENT_ID } from '../../lib/auth/config';
import { describeApiError } from '../../lib/auth/http';
import { decodeJwtPayload, loadAppleIdSdk, loadFacebookSdk } from '../../lib/auth/social-sdk';

export type SocialResult = { status: 'success' } | { status: 'error'; message: string };

function describe(error: unknown, provider: string): string {
  return describeApiError(error, `Đăng nhập ${provider} thất bại`);
}

export async function signInWithFacebook(onResult: (result: SocialResult) => void) {
  if (!FACEBOOK_APP_ID) {
    onResult({ status: 'error', message: 'Thiếu NEXT_PUBLIC_FACEBOOK_APP_ID' });
    return;
  }
  try {
    const FB = await loadFacebookSdk(FACEBOOK_APP_ID);
    FB.login((response) => {
      const auth = response.authResponse;
      if (!auth) {
        onResult({ status: 'error', message: 'Đăng nhập Facebook đã bị huỷ' });
        return;
      }
      FB.api('/me', { fields: 'name,email,picture' }, async (profile) => {
        try {
          await authService.loginExternal({
            authProvider: 'Facebook',
            providerAccessCode: auth.accessToken,
            providerKey: auth.userID,
            emailAddress: profile.email,
            name: profile.name,
            imageUrl: profile.picture?.data?.url,
          });
          onResult({ status: 'success' });
        } catch (error) {
          onResult({ status: 'error', message: describe(error, 'Facebook') });
        }
      });
    }, { scope: 'email' });
  } catch (error) {
    onResult({ status: 'error', message: describe(error, 'Facebook') });
  }
}

export async function signInWithApple(onResult: (result: SocialResult) => void) {
  if (!FACEBOOK_CLIENT_ID) {
    onResult({ status: 'error', message: 'Thiếu NEXT_PUBLIC_FACEBOOK_CLIENT_ID' });
    return;
  }
  try {
    const AppleID = await loadAppleIdSdk();
    AppleID.auth.init({
      clientId: FACEBOOK_CLIENT_ID,
      scope: 'email name',
      redirectURI: `${window.location.origin}/login`,
      usePopup: true,
    });
    const response = await AppleID.auth.signIn();
    const idToken = response.authorization.id_token;
    const decoded = decodeJwtPayload<{ sub: string; email?: string }>(idToken);
    await authService.loginExternal({
      authProvider: 'Apple',
      providerAccessCode: idToken,
      providerKey: decoded.sub,
      emailAddress: response.user?.email ?? decoded.email,
      name: response.user?.name?.firstName ?? '',
      surName: response.user?.name?.lastName ?? '',
    });
    onResult({ status: 'success' });
  } catch (error) {
    onResult({ status: 'error', message: describe(error, 'Apple') });
  }
}
