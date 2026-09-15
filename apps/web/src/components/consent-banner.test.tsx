// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONSENT_KEY } from '@/lib/consent';
import { ConsentBanner, ConsentPreferencesLink } from './consent-banner';
import { Analytics } from './analytics';

const IDS = { googleAnalyticsId: 'G-ABC1234567', googleTagManagerId: null, facebookPixelId: null };

describe('analytics consent', () => {
  beforeEach(() => window.localStorage.clear());

  it('asks before anything is loaded', async () => {
    render(
      <>
        <Analytics ids={IDS} />
        <ConsentBanner configured />
      </>,
    );
    expect(await screen.findByRole('region', { name: 'Cookies' })).toBeInTheDocument();
    // Nothing is mounted while the question is unanswered.
    expect(document.getElementById('ms-ga4')).toBeNull();
  });

  it('loads nothing when the visitor declines, and remembers that', async () => {
    render(
      <>
        <Analytics ids={IDS} />
        <ConsentBanner configured />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Cookies' })).not.toBeInTheDocument());
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('declined');
    expect(document.getElementById('ms-ga4')).toBeNull();
  });

  it('loads analytics once, and only once, the visitor accepts', async () => {
    render(
      <>
        <Analytics ids={IDS} />
        <ConsentBanner configured />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Accept analytics' }));
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Cookies' })).not.toBeInTheDocument());
  });

  it('does not ask when no analytics are configured', () => {
    render(<ConsentBanner configured={false} />);
    expect(screen.queryByRole('region', { name: 'Cookies' })).not.toBeInTheDocument();
  });

  it('treats unreadable storage as unanswered rather than as agreement', async () => {
    window.localStorage.setItem(CONSENT_KEY, 'something-else');
    render(<ConsentBanner configured />);
    expect(await screen.findByRole('region', { name: 'Cookies' })).toBeInTheDocument();
  });

  it('offers a way back to the choice only after one has been made', async () => {
    const { rerender } = render(<ConsentPreferencesLink />);
    expect(screen.queryByRole('button', { name: 'Cookie choices' })).not.toBeInTheDocument();

    window.localStorage.setItem(CONSENT_KEY, 'declined');
    rerender(
      <>
        <ConsentPreferencesLink key="link" />
        <ConsentBanner configured />
      </>,
    );
    const reopen = await screen.findByRole('button', { name: 'Cookie choices' });
    expect(screen.queryByRole('region', { name: 'Cookies' })).not.toBeInTheDocument();
    fireEvent.click(reopen);
    expect(await screen.findByRole('region', { name: 'Cookies' })).toBeInTheDocument();
  });
});

describe('ConsentBanner wording', () => {
  beforeEach(() => window.localStorage.clear());

  it('names who receives the data, and links the privacy policy only when it is published', async () => {
    const { rerender } = render(<ConsentBanner configured providers={['Google', 'Meta']} privacyHref="/privacy" />);
    const region = await screen.findByRole('region', { name: 'Cookies' });
    expect(region).toHaveTextContent('analytics and advertising cookies from Google and Meta');
    expect(region).toHaveTextContent('Cookie choices');
    expect(screen.getByRole('link', { name: 'Read our privacy policy' })).toHaveAttribute('href', '/privacy');

    rerender(<ConsentBanner configured providers={['Google']} privacyHref={null} />);
    expect(region).toHaveTextContent('analytics cookies from Google');
    expect(region).not.toHaveTextContent('advertising');
    expect(screen.queryByRole('link', { name: 'Read our privacy policy' })).not.toBeInTheDocument();
  });
});
