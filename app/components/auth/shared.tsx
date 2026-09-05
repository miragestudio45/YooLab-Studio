// Shared between the login and register screens: the hero photo, the social
// row and the small icon set — the two screens are one visual family, same
// as the reference app's shared `(auth)` layout.

export const HERO_IMAGE = 'https://assets.yoolife.com.vn/yootek/1786953357525-5274.webp';

export function GoogleIcon() {
  return (
    <svg className="auth-social-icon" width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.16.27-1.7V4.97H.9A9 9 0 000 9c0 1.45.35 2.83.9 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

export function FacebookIcon() {
  return (
    <svg className="auth-social-icon" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="9" fill="#1877F2" />
      <path fill="#fff" d="M11.4 9.6h-1.7v5.3H7.6V9.6H6.3V7.7h1.3V6.4c0-1.1.5-2.8 2.8-2.8l2 .01v1.85H10.9c-.2 0-.5.1-.5.6v1.35h1.9l-.2 1.9z" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg className="auth-social-icon" width="16" height="18" viewBox="0 0 16 18" fill="#1c1c1c">
      <path d="M13.1 9.5c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.7-3.1.7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.6 2 1-.1 1.4-.7 2.7-.7s1.6.7 2.7.6c1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.9-2.3-3.3zM11 3.3c.6-.7 1-1.7.9-2.6-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.5.9.1 1.9-.5 2.5-1.2z" />
    </svg>
  );
}

export function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 003.4 3.4M6.6 6.7C4.4 8.1 2.7 10 2 12c1.7 4.2 6 7 10 7 1.8 0 3.5-.5 5-1.4M9.9 4.2A10.8 10.8 0 0112 4c4 0 8.3 2.8 10 7-.5 1.3-1.3 2.6-2.3 3.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12c1.7-4.2 6-7 10-7s8.3 2.8 10 7c-1.7 4.2-6 7-10 7s-8.3-2.8-10-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21a8 8 0 00-16 0" strokeLinecap="round" />
      <circle cx="12" cy="8" r="4.2" />
    </svg>
  );
}

export function IdCardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 9.5h4M14 13h4" strokeLinecap="round" />
    </svg>
  );
}

export function GiftIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="9" width="16" height="11" rx="1.4" />
      <path d="M4 9h16v3H4zM12 9v11M12 9c-1.6 0-4-.6-4-3a2 2 0 014-.3 2 2 0 014 .3c0 2.4-2.4 3-4 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
