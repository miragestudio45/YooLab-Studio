import Cookies from 'js-cookie';
import { ACCESS_TOKEN_KEY } from './config';

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(Cookies.get(ACCESS_TOKEN_KEY));
}
