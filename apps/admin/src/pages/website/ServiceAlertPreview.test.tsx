import { render, screen } from '@testing-library/react';
import { ALERT_PRESENTATION, ALERT_SEVERITIES } from '@adelaide-sphere/domain/alerts';
import { ServiceAlertPreview } from './ServiceAlertPreview';
import { alertVisibility, type AlertPreviewInput } from './alert-preview-model';

const base: AlertPreviewInput = {
  title: 'Public holiday hours',
  message: 'Some businesses are closed on Monday.',
  severity: 'informational',
  linkLabel: 'See listings',
  linkUrl: '/business',
  dismissible: true,
  status: 'published',
};

/** `#rrggbb` as the `rgb(r, g, b)` jsdom reports for an inline style. */
function rgb(hex: string): string {
  const value = hex.replace('#', '');
  const channel = (offset: number) => Number.parseInt(value.slice(offset, offset + 2), 16);
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

/**
 * Parity with the public banner (SRS 1.2 ALRT 004).
 *
 * The banner lives in another application, built with another framework, so the
 * two are kept honest by both reading `@adelaide-sphere/domain/alerts`. The
 * web suite has the mirror of this test; between them, a colour changed in one
 * application and not the other fails a test that names both values.
 */
describe('ServiceAlertPreview', () => {
  for (const severity of ALERT_SEVERITIES) {
    const presentation = ALERT_PRESENTATION[severity];

    it(`draws the ${severity} band exactly as the shared table describes it`, () => {
      const { container } = render(<ServiceAlertPreview alert={{ ...base, severity }} />);
      const band = container.querySelector(`[data-tone="${presentation.tone}"]`);
      expect(band).not.toBeNull();
      expect(band).toHaveStyle({ background: rgb(presentation.background), color: rgb(presentation.foreground) });
    });
  }

  it('is hidden from assistive technology and describes the announcement in words instead', () => {
    const { container } = render(<ServiceAlertPreview alert={{ ...base, severity: 'emergency' }} />);
    // A live region inside an editor re-announces itself on every keystroke.
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('[data-tone="critical"]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/interrupts what it is saying/i)).toBeInTheDocument();
  });

  it('uses the server’s link rule rather than a guess about a leading slash', () => {
    render(<ServiceAlertPreview alert={{ ...base, linkUrl: 'https://example.com/status' }} />);
    expect(screen.getByText(/leaves this site/i)).toBeInTheDocument();
  });

  it('says a link the server will refuse will be refused', () => {
    render(<ServiceAlertPreview alert={{ ...base, linkUrl: '//evil.example.com' }} />);
    expect(screen.getByText(/refused when you save/i)).toBeInTheDocument();
  });

  it('states what the site is doing with the alert right now, including a window that has not opened', () => {
    const now = new Date('2026-09-10T00:00:00.000Z');
    expect(alertVisibility({ ...base, status: 'draft' }, now)).toMatch(/draft/i);
    expect(alertVisibility({ ...base, startsAt: '2026-09-11T00:00:00.000Z' }, now)).toMatch(/not yet started/i);
    expect(alertVisibility({ ...base, endsAt: '2026-09-09T00:00:00.000Z' }, now)).toMatch(/has passed/i);
    expect(alertVisibility(base, now)).toMatch(/showing now/i);
  });
});
