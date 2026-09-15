import { Spin } from 'antd';

/**
 * The one loading screen for the admin: shown while a route's code is being
 * fetched, while the session is verified and while a screen's own data loads.
 *
 * It is announced politely rather than as an alert, so a reader is told work is
 * in progress without losing its place (SRS NFR 011), and it reserves height so
 * the page does not jump when the content arrives.
 */
export function PageLoader({ label = 'Loading…', minHeight = 240 }: { label?: string; minHeight?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight, padding: 24 }}
    >
      <Spin size="large" />
      <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)' }}>{label}</span>
    </div>
  );
}
