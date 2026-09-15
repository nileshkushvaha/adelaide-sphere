// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { ALERT_PRESENTATION, ALERT_SEVERITIES, contrastRatio } from '@adelaide-sphere/domain/alerts';
import { ServiceAlertBanner } from './service-alert-banner';
import type { PublicServiceAlert } from '@/lib/api';

const alert: PublicServiceAlert = {
  id: 'alert-1',
  title: 'Public holiday hours',
  message: 'Some businesses are closed on Monday.',
  severity: 'informational',
  linkLabel: 'See listings',
  linkUrl: '/business',
  linkExternal: false,
  dismissible: true,
  contentVersion: 1,
  role: 'status',
  ariaLive: 'polite',
};

/** Dismissal behaviour (SRS 1.2 ALRT 004/006). */
describe('ServiceAlertBanner', () => {
  beforeEach(() => window.localStorage.clear());

  it('announces politely and names which alert the dismiss button closes', () => {
    render(<ServiceAlertBanner alert={alert} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Dismiss the alert: Public holiday hours' })).toBeInTheDocument();
  });

  it('uses an assertive alert role only for an emergency', () => {
    render(<ServiceAlertBanner alert={{ ...alert, severity: 'emergency', role: 'alert', ariaLive: 'assertive' }} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('dismisses through a real button — keyboard operable by construction — and remembers it for this alert version', () => {
    const { unmount } = render(<ServiceAlertBanner alert={alert} />);
    const button = screen.getByRole('button', { name: /dismiss/i });
    // A <button> is focusable and activated by Enter and Space without any
    // handler of our own; a div with a click handler would not be.
    expect(button.tagName).toBe('BUTTON');
    expect(button).not.toHaveAttribute('tabindex', '-1');
    fireEvent.click(button);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();

    render(<ServiceAlertBanner alert={alert} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reappears when the wording changes, because dismissal is keyed to the content version', async () => {
    const { unmount } = render(<ServiceAlertBanner alert={alert} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    unmount();

    render(<ServiceAlertBanner alert={{ ...alert, message: 'Updated: more are closed.', contentVersion: 2 }} />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows the alert when storage is unavailable rather than failing', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      render(<ServiceAlertBanner alert={alert} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      // Dismissal still works for this page view; it simply is not remembered.
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('marks an external link with safe relationship attributes', () => {
    render(<ServiceAlertBanner alert={{ ...alert, linkUrl: 'https://example.com/status', linkExternal: true }} />);
    const link = screen.getByRole('link', { name: 'See listings' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

/** `#rrggbb` as the `rgb(r, g, b)` jsdom reports for an inline style. */
function rgb(hex: string): string {
  const value = hex.replace('#', '');
  const channel = (offset: number) => Number.parseInt(value.slice(offset, offset + 2), 16);
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

/**
 * Parity with the shared alert table (SRS 1.2 ALRT 004).
 *
 * The admin previews this banner without rendering it — a different framework,
 * a different stylesheet — so the only thing keeping the two honest is that both
 * read `@adelaide-sphere/domain/alerts`. This pins the banner to that table:
 * lightening the emergency band in a stylesheet alone fails here, and the admin
 * has a mirror of this test asserting the same values.
 */
describe('parity with the shared alert presentation table', () => {
  for (const severity of ALERT_SEVERITIES) {
    const presentation = ALERT_PRESENTATION[severity];

    it(`renders the ${severity} band exactly as the shared table describes it`, () => {
      render(
        <ServiceAlertBanner
          alert={{ ...alert, severity, role: presentation.role, ariaLive: presentation.ariaLive, dismissible: false }}
        />,
      );
      const band = screen.getByRole(presentation.role);
      expect(band).toHaveAttribute('data-tone', presentation.tone);
      expect(band).toHaveAttribute('aria-live', presentation.ariaLive);
      expect(band).toHaveStyle({ background: rgb(presentation.background), color: rgb(presentation.foreground) });
      // The claim the banner makes about itself, checked rather than asserted.
      expect(contrastRatio(presentation.background, presentation.foreground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
