#!/usr/bin/env node
/**
 * Load profile for SRS NFR 003.
 *
 * The requirement is a 30-minute seeded run at 50 GET/s plus 2 form POST/s
 * across 100 browsing sessions, with the error rate below 1% excluding expected
 * 4xx. This script runs that profile against a target of your choosing, and
 * defaults to a short smoke run so it is usable on a developer machine:
 *
 *   node run-load.mjs                          # 60 s smoke at the full rate
 *   node run-load.mjs --duration 1800          # the full 30-minute acceptance run
 *   node run-load.mjs --target https://staging.example --duration 1800
 *
 * Public reads only. Form POSTs are deliberately NOT generated: they are
 * captcha-protected and rate-limited by design, so driving them from a load
 * tool would measure the protection rather than the product. Run the POST leg
 * against a staging environment with test captcha keys, and record it
 * separately in the report.
 */
import autocannon from 'autocannon';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const target = argOf('target', 'http://127.0.0.1:4000').replace(/\/+$/, '');
const duration = Number(argOf('duration', '60'));
const connections = Number(argOf('connections', '100')); // 100 browsing sessions
const rate = Number(argOf('rate', '50')); // 50 GET/s across all connections

/** A realistic browsing mix rather than one hot URL. */
const apiMode = args.includes('--api');
const requests = apiMode
  ? [
      // API surface: the queries that touch the largest tables.
      { path: '/api/v1/businesses?pageSize=20', weight: 3 },
      { path: '/api/v1/businesses?q=fixture&pageSize=20', weight: 3 },
      { path: '/api/v1/businesses?category=cafes&sort=rating&pageSize=20', weight: 2 },
      { path: '/api/v1/businesses?area=norwood&minRating=4&pageSize=20', weight: 1 },
      { path: '/api/v1/businesses/load-fixture-42', weight: 2 },
      { path: '/api/v1/posts?pageSize=12', weight: 2 },
      // Suggestions are deliberately rate-limited per IP (SRS API 004), so they
      // are measured separately rather than inside the browsing mix.
      { path: '/api/v1/home', weight: 1 },
    ]
  : [
      { path: '/', weight: 3 },
      { path: '/directory', weight: 3 },
      { path: '/directory?q=cafe', weight: 2 },
      { path: '/directory?sort=rating', weight: 1 },
      { path: '/blog', weight: 2 },
      { path: '/robots.txt', weight: 1 },
    ];

const expanded = requests.flatMap((entry) => Array.from({ length: entry.weight }, () => ({ method: 'GET', path: entry.path })));

console.log(`Load profile: ${connections} sessions, ${rate} requests/second, ${duration}s against ${target}`);
console.log('Public GET traffic only; captcha-protected form POSTs are measured separately (see the file header).');

const result = await autocannon({
  url: target,
  connections,
  overallRate: rate,
  duration,
  requests: expanded,
  headers: { accept: 'text/html,application/xhtml+xml' },
  // Anything at or above 500 is a real error; 4xx from a probe URL is expected.
  expectBody: undefined,
});

const total = result.requests.total;
const serverErrors = (result['5xx'] ?? 0) + (result.errors ?? 0) + (result.timeouts ?? 0);
const errorRate = total === 0 ? 1 : serverErrors / total;

console.log('');
console.log(`Requests:      ${total} (${result.requests.average.toFixed(1)}/s average)`);
console.log(`Latency p50:   ${result.latency.p50} ms`);
console.log(`Latency p95:   ${result.latency.p97_5} ms (p97.5 — autocannon's closest published percentile)`);
console.log(`Latency p99:   ${result.latency.p99} ms`);
console.log(`Non-2xx:       ${result.non2xx}`);
console.log(`5xx/timeouts:  ${serverErrors}`);
console.log(`Error rate:    ${(errorRate * 100).toFixed(3)}% (target: below 1%)`);

if (errorRate >= 0.01) {
  console.error('\nFAILED: the error rate is at or above the 1% NFR 003 threshold.');
  process.exit(1);
}
console.log('\nPASSED the error-rate threshold. Record latency alongside the seeded data volume used.');
