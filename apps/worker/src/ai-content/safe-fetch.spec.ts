import { PassThrough, Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { isPublicAddress, pinnedLookup, robotsAllows, safeFetch, urlProblem, type Transport, type TransportRequest } from './safe-fetch.js';

const PUBLIC = '93.184.216.34';
type Reply = { status?: number; headers?: Record<string, string>; body?: string | Buffer };
function fake(routes: Record<string, Reply | (() => Reply)>, dns: Record<string, string[]> = {}) {
  const seen: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    seen.push(req);
    const route = routes[req.url.toString()];
    if (!route) throw Object.assign(new Error('no route'), { code: 'ECONNREFUSED' });
    const r = typeof route === 'function' ? route() : route;
    return { status: r.status ?? 200, headers: { 'content-type': 'text/html; charset=utf-8', ...r.headers }, body: Readable.from([Buffer.from(r.body ?? '<html><body>ok</body></html>')]) };
  };
  const resolve = async (host: string) => dns[host] ?? [PUBLIC];
  return { transport, resolve, seen };
}

describe('research egress boundary: static URL rules', () => {
  it.each([
    ['http://example.org/', 'only https is allowed'],
    ['https://user:pass@example.org/', 'credentials in the URL'],
    ['https://example.org:8443/', 'non-default port'],
    ['https://127.0.0.1/', 'IP address hosts are not allowed'],
    ['https://[::1]/', 'IP address hosts are not allowed'],
    ['https://localhost/', 'not a public host name'],
    ['https://metadata.google.internal/', 'not a public host name'],
    ['https://printer.local/', 'not a public host name'],
    ['file:///etc/passwd', 'only https is allowed'],
  ])('refuses %s', (url, problem) => {
    expect(urlProblem(url)).toBe(problem);
  });

  it('accepts a normal public https page', () => {
    expect(urlProblem('https://www.example.org/visit?x=1')).toBeNull();
  });
});

describe('research egress boundary: resolved addresses', () => {
  it.each(['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])('treats %s as non-public', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it('treats ordinary public addresses as public', () => {
    expect(isPublicAddress(PUBLIC)).toBe(true);
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
  });

  it('blocks a host that resolves to a private address, and a mixed answer (DNS rebinding)', async () => {
    const f = fake({}, { 'intranet.example.org': ['10.0.0.5'], 'rebind.example.org': [PUBLIC, '127.0.0.1'] });
    expect(await safeFetch('https://intranet.example.org/', f)).toMatchObject({ ok: false, failure: 'blocked' });
    expect(await safeFetch('https://rebind.example.org/', f)).toMatchObject({ ok: false, failure: 'blocked' });
    expect(f.seen).toHaveLength(0);
  });

  it('pins the connection to the vetted address while keeping the host name for TLS', async () => {
    const f = fake({ 'https://venue.example.org/': {} });
    await safeFetch('https://venue.example.org/', f);
    expect(f.seen[0]).toMatchObject({ address: PUBLIC, family: 4 });
    expect(f.seen[0]!.url.hostname).toBe('venue.example.org');
  });
});

describe('research egress boundary: redirects and limits', () => {
  it('re-validates every redirect hop and refuses one to a private or metadata address', async () => {
    const f = fake({ 'https://a.example.org/': { status: 302, headers: { location: 'https://metadata.example.org/latest' } } }, { 'metadata.example.org': ['169.254.169.254'] });
    expect(await safeFetch('https://a.example.org/', f)).toMatchObject({ ok: false, failure: 'blocked', finalUrl: 'https://metadata.example.org/latest' });
    const toHttp = fake({ 'https://a.example.org/': { status: 301, headers: { location: 'http://a.example.org/' } } });
    expect(await safeFetch('https://a.example.org/', toHttp)).toMatchObject({ ok: false, failure: 'blocked' });
  });

  it('stops after three redirects', async () => {
    const f = fake(Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`https://a.example.org/${i}`, { status: 302, headers: { location: `/${i + 1}` } }])));
    expect(await safeFetch('https://a.example.org/0', f)).toMatchObject({ ok: false, detail: 'too many redirects' });
  });

  it('refuses unexpected content types, oversized bodies and decompression bombs', async () => {
    const pdf = fake({ 'https://a.example.org/': { headers: { 'content-type': 'application/pdf' } } });
    expect(await safeFetch('https://a.example.org/', pdf)).toMatchObject({ ok: false, failure: 'unsupported_type' });
    const big = fake({ 'https://a.example.org/': { body: 'x'.repeat(3_000) } });
    expect(await safeFetch('https://a.example.org/', { ...big, maxBytes: 1_000 })).toMatchObject({ ok: false, failure: 'too_large' });
    const bomb = fake({ 'https://a.example.org/': { headers: { 'content-encoding': 'gzip' }, body: gzipSync(Buffer.alloc(5_000_000)) } });
    expect(await safeFetch('https://a.example.org/', { ...bomb, maxBytes: 100_000 })).toMatchObject({ ok: false, failure: 'too_large' });
  });

  it('reports HTTP errors with Retry-After and timeouts without inventing a body', async () => {
    const busy = fake({ 'https://a.example.org/': { status: 503, headers: { 'retry-after': '120' } } });
    expect(await safeFetch('https://a.example.org/', busy)).toMatchObject({ ok: false, failure: 'http_error', status: 503, retryAfterSeconds: 120, body: '' });
    const slow: Transport = async () => {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    };
    expect(await safeFetch('https://a.example.org/', { transport: slow, resolve: async () => [PUBLIC] })).toMatchObject({ ok: false, failure: 'timeout' });
  });

  it('returns gzip-encoded HTML as text', async () => {
    const f = fake({ 'https://a.example.org/': { headers: { 'content-encoding': 'gzip' }, body: gzipSync('<p>hello</p>') } });
    expect(await safeFetch('https://a.example.org/', f)).toMatchObject({ ok: true, body: '<p>hello</p>' });
  });
});

describe('robots.txt', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: SphereContentResearch\nDisallow: /no-research';
  it('applies our specific group when present, with the longest matching rule winning', () => {
    expect(robotsAllows(robots, '/no-research/page')).toBe(false);
    expect(robotsAllows(robots, '/private/x')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/open', '/private/open/a')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /private', '/private/a')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /', '/')).toBe(false);
    expect(robotsAllows('', '/anything')).toBe(true);
  });
});

describe('research egress boundary: regressions found against a live site', () => {
  it('answers Node\'s all-addresses lookup with only the pinned address (found live: every request failed)', () => {
    const lookup = pinnedLookup(PUBLIC, 4);
    const all = vi.fn();
    lookup('venue.example.org', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: PUBLIC, family: 4 }]);
    const one = vi.fn();
    lookup('venue.example.org', {}, one);
    expect(one).toHaveBeenCalledWith(null, PUBLIC, 4);
  });

  it('gives up on a response that stops sending, instead of waiting forever', async () => {
    const stalled = new PassThrough();
    stalled.write('<html>');
    const transport: Transport = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: stalled });
    const started = Date.now();
    expect(await safeFetch('https://slow.example.org/', { transport, resolve: async () => [PUBLIC], timeoutMs: 200 })).toMatchObject({ ok: false, failure: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('reports a connection that breaks mid-way through a compressed body as a network error', async () => {
    const broken = new PassThrough();
    const transport: Transport = async () => ({ status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: broken });
    setTimeout(() => broken.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), 20);
    expect(await safeFetch('https://reset.example.org/', { transport, resolve: async () => [PUBLIC], timeoutMs: 2_000 })).toMatchObject({ ok: false, failure: 'network_error' });
  });

  it('prefers a vetted IPv4 address when both families are public', async () => {
    const f = fake({ 'https://dual.example.org/': {} }, { 'dual.example.org': ['2606:2800:220:1:248:1893:25c8:1946', PUBLIC] });
    await safeFetch('https://dual.example.org/', f);
    expect(f.seen[0]).toMatchObject({ address: PUBLIC, family: 4 });
  });
});
