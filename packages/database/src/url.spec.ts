import { hasVerifiedTls, parseMysqlUrl } from './url.js';
import { sslOptionFor } from './client.js';

describe('parseMysqlUrl', () => {
  it('parses a standard URL', () => {
    expect(parseMysqlUrl('mysql://app:secret@127.0.0.1:3307/melbourne_sphere_dev')).toEqual({
      host: '127.0.0.1',
      port: 3307,
      user: 'app',
      password: 'secret',
      database: 'melbourne_sphere_dev',
      // TLS is off unless the URL asks for it, so a connection cannot be
      // silently unencrypted *or* silently encrypted-but-unverified.
      sslMode: 'disabled',
      sslCaPath: null,
    });
  });

  describe('transport security', () => {
    it('reads the mode and certificate authority from the URL', () => {
      expect(parseMysqlUrl('mysql://a:b@h/db?sslmode=verify-identity').sslMode).toBe('verify-identity');
      const withCa = parseMysqlUrl('mysql://a:b@h/db?sslmode=verify-ca&sslca=%2Fetc%2Fssl%2Fca.pem');
      expect(withCa.sslMode).toBe('verify-ca');
      expect(withCa.sslCaPath).toBe('/etc/ssl/ca.pem');
    });

    it('refuses a mode it does not implement, rather than ignoring it', () => {
      expect(() => parseMysqlUrl('mysql://a:b@h/db?sslmode=preferred')).toThrow(/sslmode must be one of/);
      expect(() => parseMysqlUrl('mysql://a:b@h/db?sslmode=verify-ca&sslca=')).toThrow(/sslca/);
    });

    it('reports which modes verify the server', () => {
      expect(hasVerifiedTls('mysql://a:b@h/db')).toBe(false);
      expect(hasVerifiedTls('mysql://a:b@h/db?sslmode=disabled')).toBe(false);
      // Encryption without verification is defeated by an active attacker.
      expect(hasVerifiedTls('mysql://a:b@h/db?sslmode=required')).toBe(false);
      expect(hasVerifiedTls('mysql://a:b@h/db?sslmode=verify-ca')).toBe(true);
      expect(hasVerifiedTls('mysql://a:b@h/db?sslmode=verify-identity')).toBe(true);
    });

    it('maps each mode onto the driver option the connector expects', () => {
      // The mariadb connector treats an ssl object as verifying unless
      // rejectUnauthorized is explicitly false.
      expect(sslOptionFor({ sslMode: 'disabled', sslCaPath: null })).toBe(false);
      expect(sslOptionFor({ sslMode: 'required', sslCaPath: null })).toEqual({ rejectUnauthorized: false });
      expect(sslOptionFor({ sslMode: 'verify-identity', sslCaPath: null })).toEqual({ rejectUnauthorized: true });
      expect(sslOptionFor({ sslMode: 'verify-ca', sslCaPath: null })).toEqual({ rejectUnauthorized: true });
    });
  });

  it('defaults the port to 3306', () => {
    expect(parseMysqlUrl('mysql://app:secret@db/x').port).toBe(3306);
  });

  it('percent-decodes user, password and database', () => {
    const s = parseMysqlUrl('mysql://us%40er:p%40ss%3Aw%2Frd%25@localhost:3306/my%20db');
    expect(s.user).toBe('us@er');
    expect(s.password).toBe('p@ss:w/rd%');
    expect(s.database).toBe('my db');
  });

  it.each([
    ['not a url', 'not a valid URL'],
    ['postgresql://a:b@h/db', 'mysql:// scheme'],
    ['mysql://a:b@h', 'database name'],
    ['mysql://a:b@h/', 'database name'],
    ['mysql://a:b@h/db/extra', 'database name'],
    ['mysql://a:b@h:0/db', 'port'],
  ])('rejects %s', (url, fragment) => {
    expect(() => parseMysqlUrl(url)).toThrow(fragment);
  });

  it('never includes the URL in error messages', () => {
    const secret = 'mysql://user:hunter2@host:3306/db/extra';
    let message = '';
    try {
      parseMysqlUrl(secret);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('host');
  });
});
