import { CsrfOriginGuard } from './csrf-origin.guard.js';

function guard() {
  return new CsrfOriginGuard({ get: () => ['http://127.0.0.1:4002', 'https://admin.example'] } as never);
}
function ctx(method: string, path: string, headers: Record<string, string>) {
  return { switchToHttp: () => ({ getRequest: () => ({ method, path, headers }) }) } as never;
}

describe('CsrfOriginGuard', () => {
  it('ignores non-admin paths and safe methods', () => {
    expect(guard().canActivate(ctx('POST', '/api/v1/health', {}))).toBe(true);
    expect(guard().canActivate(ctx('GET', '/api/v1/admin/auth/me', {}))).toBe(true);
  });

  it('accepts trusted Origin, rejects others, and normalises trailing slashes', () => {
    expect(guard().canActivate(ctx('POST', '/api/v1/admin/auth/login', { origin: 'http://127.0.0.1:4002' }))).toBe(true);
    expect(guard().canActivate(ctx('POST', '/api/v1/admin/auth/login', { origin: 'https://admin.example/' }))).toBe(true);
    expect(() => guard().canActivate(ctx('POST', '/api/v1/admin/auth/login', { origin: 'https://evil.example' }))).toThrow(/origin is not allowed/);
    expect(() => guard().canActivate(ctx('DELETE', '/api/v1/admin/things/1', { origin: 'null' }))).toThrow();
  });

  it('falls back to Referer, then Sec-Fetch-Site, and rejects when nothing proves the origin', () => {
    expect(guard().canActivate(ctx('POST', '/api/v1/admin/x', { referer: 'https://admin.example/admin/page' }))).toBe(true);
    expect(() => guard().canActivate(ctx('POST', '/api/v1/admin/x', { referer: 'https://evil.example/' }))).toThrow();
    expect(guard().canActivate(ctx('POST', '/api/v1/admin/x', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(() => guard().canActivate(ctx('POST', '/api/v1/admin/x', { 'sec-fetch-site': 'cross-site' }))).toThrow();
    expect(() => guard().canActivate(ctx('POST', '/api/v1/admin/x', {}))).toThrow(/CSRF|origin/i);
  });
});
