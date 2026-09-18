import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { pipeline, type Readable } from 'node:stream';

/**
 * The research egress boundary (AI plan §G step 2; owner policy §8). Every
 * public retrieval the AI workflow makes goes through `safeFetch`:
 *
 * - https only, default port, no credentials in the URL, no IP literals;
 * - the host is resolved here and every address must be public unicast
 *   (loopback, private, link-local/metadata, CGNAT, multicast, reserved,
 *   IPv6 ULA/link-local and IPv4-mapped forms are refused);
 * - the connection is pinned to the vetted address, so a second DNS answer
 *   cannot redirect it (DNS rebinding), while TLS still verifies the name;
 * - redirects are followed manually, at most three, each hop re-validated;
 * - time, byte, decompressed-byte and content-type limits are enforced;
 * - no cookies, no authentication, no scripts: the body is returned as data.
 */
export type FetchFailure = 'blocked' | 'timeout' | 'too_large' | 'unsupported_type' | 'http_error' | 'network_error' | 'robots_disallowed';

export interface SafeFetchResult {
  ok: boolean;
  failure?: FetchFailure;
  detail?: string;
  url: string;
  finalUrl: string;
  status: number | null;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  retryAfterSeconds: number | null;
  body: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: readonly string[];
  userAgent?: string;
  /** Test seam: resolves a host to addresses. Defaults to the system resolver. */
  resolve?: (host: string) => Promise<string[]>;
  /** Test seam: performs one pinned request. Defaults to node:https. */
  transport?: Transport;
}

export interface TransportRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  timeoutMs: number;
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Readable;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export const RESEARCH_USER_AGENT = 'SphereContentResearch/1.0 (editorial fact checking; respects robots.txt)';
const DEFAULT_ACCEPT = ['text/html', 'application/xhtml+xml'] as const;
export const FEED_TYPES = ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml'] as const;

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) are refused explicitly below: a BlockList
  // rule for them would also match every plain IPv4 address.
  ['::', 128], ['::1', 128], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv6');

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && /^(::ffff:|64:ff9b::)/i.test(address)) return false;
  return !BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|localdomain|home|lan|corp|intranet|arpa)$/;

/** Static URL checks before any DNS lookup. */
export function urlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'not a URL';
  }
  if (url.protocol !== 'https:') return 'only https is allowed';
  if (url.username || url.password) return 'credentials in the URL';
  if (url.port && url.port !== '443') return 'non-default port';
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) return 'IP address hosts are not allowed';
  if (!host.includes('.') || BLOCKED_HOST.test(host)) return 'not a public host name';
  return null;
}

const defaultResolve = async (host: string) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;
/** A resolver that can only ever answer with the vetted address. */
export function pinnedLookup(address: string, family: 4 | 6) {
  return (_host: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) => {
    if (typeof options === 'object' && options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

const defaultTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const r = httpsRequest(
      {
        protocol: 'https:',
        hostname: req.url.hostname,
        servername: req.url.hostname,
        path: `${req.url.pathname}${req.url.search}`,
        method: 'GET',
        headers: req.headers,
        timeout: req.timeoutMs,
        agent: false,
        // Pinned: the socket connects to the address vetted above, never a fresh lookup. Node asks
        // for every address (`all: true`) when it races families; the answer is still only this one.
        lookup: pinnedLookup(req.address, req.family),
      },
      (res: IncomingMessage) => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
        resolve({ status: res.statusCode ?? 0, headers, body: res });
      },
    );
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    r.on('error', reject);
    r.end();
  });

async function readBounded(stream: Readable, encoding: string | undefined, maxBytes: number, deadline: number): Promise<{ text: string } | { failure: FetchFailure }> {
  const enc = (encoding ?? 'identity').toLowerCase().trim();
  let source: Readable = stream;
  const decompressor = enc === 'gzip' || enc === 'x-gzip' ? createGunzip() : enc === 'deflate' ? createInflate() : enc === 'br' ? createBrotliDecompress() : null;
  if (!decompressor && enc !== 'identity' && enc !== '') {
    stream.destroy();
    return { failure: 'unsupported_type' };
  }
  // pipeline, not pipe: a socket error must reach the reader, or the read would wait forever.
  if (decompressor) source = pipeline(stream, decompressor, () => undefined) as unknown as Readable;
  let timedOut = false;
  // A hard deadline on the whole read, whether or not any bytes arrive.
  const timer = setTimeout(() => {
    timedOut = true;
    source.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    stream.destroy();
  }, Math.max(1, deadline - Date.now()));
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of source) {
      total += (chunk as Buffer).length;
      // The limit applies after decompression, so a compression bomb is cut off.
      if (total > maxBytes) {
        source.destroy();
        stream.destroy();
        return { failure: 'too_large' };
      }
      chunks.push(chunk as Buffer);
    }
  } catch {
    return { failure: timedOut ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
  return { text: Buffer.concat(chunks).toString('utf8') };
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const accept = options.accept ?? DEFAULT_ACCEPT;
  const resolve = options.resolve ?? defaultResolve;
  const transport = options.transport ?? defaultTransport;
  const deadline = Date.now() + timeoutMs;
  const base = { url: rawUrl, status: null, contentType: null, etag: null, lastModified: null, retryAfterSeconds: null, body: '' };
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const problem = urlProblem(current);
    if (problem) return { ...base, ok: false, failure: 'blocked', detail: problem, finalUrl: current };
    const url = new URL(current);
    let addresses: string[];
    try {
      addresses = await resolve(url.hostname);
    } catch {
      return { ...base, ok: false, failure: 'network_error', detail: 'DNS lookup failed', finalUrl: current };
    }
    // Every answer must be public: a mixed answer is how rebinding attacks start.
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) return { ...base, ok: false, failure: 'blocked', detail: 'host resolves to a non-public address', finalUrl: current };
    // Every answer was vetted above; IPv4 is preferred because IPv6 routes are often absent on servers.
    const address = addresses.find((a) => isIP(a) === 4) ?? addresses[0]!;
    let response: TransportResponse;
    try {
      response = await transport({
        url,
        address,
        family: isIP(address) === 6 ? 6 : 4,
        timeoutMs: Math.max(1, deadline - Date.now()),
        headers: { 'user-agent': options.userAgent ?? RESEARCH_USER_AGENT, accept: accept.join(', '), 'accept-encoding': 'gzip, deflate, br' },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      return { ...base, ok: false, failure: code === 'ETIMEDOUT' ? 'timeout' : 'network_error', detail: code ?? 'request failed', finalUrl: current };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.body.destroy();
      const location = response.headers.location;
      if (!location) return { ...base, ok: false, failure: 'http_error', status: response.status, detail: 'redirect without location', finalUrl: current };
      current = new URL(location, url).toString();
      continue;
    }
    const contentType = (response.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase() || null;
    const retryAfter = Number(response.headers['retry-after']);
    const meta = {
      url: rawUrl,
      finalUrl: current,
      status: response.status,
      contentType,
      etag: response.headers.etag ?? null,
      lastModified: response.headers['last-modified'] ?? null,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter, 3600) : null,
    };
    if (response.status < 200 || response.status >= 300) {
      response.body.destroy();
      return { ...meta, ok: false, failure: 'http_error', body: '' };
    }
    if (!contentType || !accept.includes(contentType)) {
      response.body.destroy();
      return { ...meta, ok: false, failure: 'unsupported_type', body: '' };
    }
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      response.body.destroy();
      return { ...meta, ok: false, failure: 'too_large', body: '' };
    }
    const read = await readBounded(response.body, response.headers['content-encoding'], maxBytes, deadline);
    if ('failure' in read) return { ...meta, ok: false, failure: read.failure, body: '' };
    return { ...meta, ok: true, body: read.text };
  }
  return { ...base, ok: false, failure: 'blocked', detail: 'too many redirects', finalUrl: current };
}

/**
 * robots.txt for our agent (`User-agent: *` or our product token): the
 * longest matching Allow/Disallow prefix wins. A missing or unreadable
 * robots.txt permits access, as the convention defines.
 */
export function robotsAllows(robots: string, path: string, agentToken = 'spherecontentresearch'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; prefix: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === 'allow', prefix: value.replace(/\*$/, '') });
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agentToken.includes(a)));
  const applicable = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  let best: { allow: boolean; prefix: string } | null = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (path.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length || (rule.prefix.length === best.prefix.length && rule.allow))) best = rule;
  }
  return best ? best.allow : true;
}
