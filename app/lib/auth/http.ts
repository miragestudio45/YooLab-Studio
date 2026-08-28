import axios, { type AxiosError } from 'axios';
import Cookies from 'js-cookie';
import { ACCESS_TOKEN_KEY, API_ENDPOINT } from './config';

// Same shape the reference app's httpService returns — ABP's standard
// envelope. Most calls read `.result`; a couple of the reference app's own
// service methods (getUserDetailRequest, DeeplinkContext/Resolve) read the
// separate `.data` field instead, so both are kept here for parity.
export type AbpResponse<T> = { success: boolean; result: T; data?: T };

export const http = axios.create({ baseURL: API_ENDPOINT, timeout: 6_000_000 });
export const httpNoAuth = axios.create({ baseURL: API_ENDPOINT, timeout: 6_000_000 });

http.interceptors.request.use((config) => {
  const accessToken = Cookies.get(ACCESS_TOKEN_KEY);
  const tenantId = Cookies.get('tenantId');
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  if (tenantId) config.headers.set('Abp.TenantId', tenantId);
  return config;
});

// Same message path the reference app reads everywhere:
// `err.response.data.error?.details`.
export function describeApiError(error: unknown, fallback = 'Đã có lỗi xảy ra'): string {
  const details = (error as AxiosError<{ error?: { details?: string; message?: string } }>)?.response?.data?.error;
  return details?.details || details?.message || fallback;
}

export function apiErrorCode(error: unknown): number | undefined {
  return (error as AxiosError<{ error?: { code?: number } }>)?.response?.data?.error?.code;
}
