// Same backend and env var names as the reference app (vr-studio-manage),
// so pointing these at the real ABP backend is the only thing left to do.
//
//   NEXT_PUBLIC_BASE_URL                 API base (axios baseURL)
//   NEXT_PUBLIC_DOMAIN                   cookie domain, e.g. ".yoolife.com.vn"
//   NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID
//   NEXT_PUBLIC_FACEBOOK_APP_ID
//   NEXT_PUBLIC_FACEBOOK_CLIENT_ID       reused as Apple's Services ID —
//                                        that's what the reference app does
//                                        too (see its apple-login.tsx), kept
//                                        as-is for parity rather than "fixed"
//   NEXT_PUBLIC_REDIRECT_URI_APPLE_LOGIN
//   NEXT_PUBLIC_URL_SHARE_HOTSPOT360     base URL for a Hotspot360 project
//   NEXT_PUBLIC_URL_SHARE_TOUR360        base URL for a Tour360 project
//   NEXT_PUBLIC_URL_SHARE_MODEL3D        base URL for a Model3D project

export const ACCESS_TOKEN_KEY = 'accessToken360';
export const ACCESS_TOKEN_PERMISSIONS = 'permissions';

export const API_ENDPOINT = process.env.NEXT_PUBLIC_BASE_URL ?? '';
export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? '';

export const GOOGLE_AUTH_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID ?? '';
export const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? '';
export const FACEBOOK_CLIENT_ID = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID ?? '';
export const REDIRECT_URI_APPLE_LOGIN = process.env.NEXT_PUBLIC_REDIRECT_URI_APPLE_LOGIN ?? '';

export const URL_SHARE_HOTSPOT360 = process.env.NEXT_PUBLIC_URL_SHARE_HOTSPOT360 ?? '';
export const URL_SHARE_TOUR360 = process.env.NEXT_PUBLIC_URL_SHARE_TOUR360 ?? '';
export const URL_SHARE_MODEL3D = process.env.NEXT_PUBLIC_URL_SHARE_MODEL3D ?? '';
