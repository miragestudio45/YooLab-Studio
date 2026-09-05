// Decodes a JWT payload without pulling in a dependency — this is exactly
// what `jwt-decode` does for the reference app's Google/Apple id_token.
export function decodeJwtPayload<T>(token: string): T {
  const [, payload] = token.split('.');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const json = typeof window === 'undefined' ? Buffer.from(padded, 'base64').toString('utf8') : atob(padded);
  return JSON.parse(json) as T;
}

function loadScriptOnce(id: string, src: string): Promise<void> {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Không tải được ${src}`));
    document.head.appendChild(script);
  });
}

export function loadFacebookSdk(appId: string): Promise<NonNullable<typeof window.FB>> {
  return loadScriptOnce('facebook-jssdk', 'https://connect.facebook.net/vi_VN/sdk.js').then(() => {
    const FB = window.FB;
    if (!FB) throw new Error('Facebook SDK không khả dụng');
    FB.init({ appId, version: 'v19.0', cookie: true, xfbml: false });
    return FB;
  });
}

export function loadAppleIdSdk(): Promise<NonNullable<typeof window.AppleID>> {
  return loadScriptOnce(
    'appleid-auth-sdk',
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
  ).then(() => {
    const AppleID = window.AppleID;
    if (!AppleID) throw new Error('Apple Sign In SDK không khả dụng');
    return AppleID;
  });
}

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; version: string; cookie: boolean; xfbml: boolean }) => void;
      login: (
        callback: (response: { authResponse?: { accessToken: string; userID: string } }) => void,
        options: { scope: string },
      ) => void;
      api: (
        path: string,
        params: { fields: string },
        callback: (response: { name?: string; email?: string; picture?: { data?: { url?: string } } }) => void,
      ) => void;
    };
    AppleID?: {
      auth: {
        init: (options: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<{
          authorization: { id_token: string; code: string };
          user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        }>;
      };
    };
  }
}
