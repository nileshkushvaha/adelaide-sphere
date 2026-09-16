import { isAdminPath } from './admin-path.js';

describe('isAdminPath', () => {
  it('matches the admin prefix and everything below it', () => {
    expect(isAdminPath({ path: '/api/v1/admin' })).toBe(true);
    expect(isAdminPath({ path: '/api/v1/admin/' })).toBe(true);
    expect(isAdminPath({ path: '/api/v1/admin/enquiries' })).toBe(true);
  });

  it('ignores case, so a re-cased path is still guarded', () => {
    expect(isAdminPath({ path: '/api/v1/Admin/enquiries' })).toBe(true);
    expect(isAdminPath({ path: '/API/V1/ADMIN' })).toBe(true);
  });

  it('does not match public paths or look-alike prefixes', () => {
    expect(isAdminPath({ path: '/api/v1/health' })).toBe(false);
    expect(isAdminPath({ path: '/api/v1/administrators' })).toBe(false);
    expect(isAdminPath({ path: '/api/v1/site/admin' })).toBe(false);
  });
});
