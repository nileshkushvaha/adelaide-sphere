// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from './contact-form';

const SITE_KEY = '1x00000000000000000000AA';

interface RenderedWidget {
  callback: (token: string) => void;
  'expired-callback': () => void;
}

/** A stand-in for the Cloudflare script: records the widget and lets a test complete the challenge. */
function installTurnstile() {
  const widgets: RenderedWidget[] = [];
  const api = {
    render: vi.fn((_element: HTMLElement, options: RenderedWidget) => {
      widgets.push(options);
      return `widget-${widgets.length}`;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal('turnstile', api);
  return {
    api,
    /** Completes the challenge, as a visitor would. */
    pass: async (token = 'test-token') => {
      await waitFor(() => expect(api.render).toHaveBeenCalled());
      act(() => widgets.at(-1)!.callback(token));
    },
  };
}

const answer = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

function fillIn(overrides: Partial<Record<'name' | 'email' | 'topic' | 'message', string>> = {}) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: overrides.name ?? 'Sarah Wilson' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: overrides.email ?? 'sarah@example.com' } });
  fireEvent.change(screen.getByLabelText('What can we help with?'), { target: { value: overrides.topic ?? 'Correct a published listing' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: overrides.message ?? 'The opening hours on the Carlton bakery listing are out of date.' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /send message/i }));

let fetchMock: ReturnType<typeof vi.fn>;
let turnstile: ReturnType<typeof installTurnstile>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  turnstile = installTurnstile();
  if (!globalThis.crypto?.randomUUID) vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ContactForm fields', () => {
  it('labels every control, offers the topics in readers’ words and never pre-ticks the acknowledgement', () => {
    render(<ContactForm turnstileSiteKey={SITE_KEY} privacyHref="/privacy" />);
    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    const topic = screen.getByLabelText('What can we help with?');
    // The stored subject is unchanged; only the visible label is shorter.
    expect(screen.getByRole('option', { name: 'Correct listing information' })).toHaveValue('Correct a published listing');
    expect(screen.getByRole('option', { name: 'General enquiry' })).toHaveValue('Something else');
    expect(topic).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
  });

  it('shows an honest notice instead of a form that cannot be verified', () => {
    render(<ContactForm turnstileSiteKey={null} />);
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
  });
});

describe('ContactForm validation (SRS ENQ 001)', () => {
  it('names each missing field, ties the message to its control, focuses the first one and never reaches the API', async () => {
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/check the highlighted fields/i);
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Choose what your message is about.')).toBeInTheDocument();
    expect(screen.getByText('Enter your message.')).toBeInTheDocument();
    expect(screen.getByText('Please confirm that we can use these details to respond.')).toBeInTheDocument();
    expect(screen.getByText('Complete the security check.')).toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(name.getAttribute('aria-describedby')!)).toHaveTextContent('Enter your name.');
    await waitFor(() => expect(name).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address and a message under the API minimum', async () => {
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn({ email: 'sarah@example', message: 'Too short' });
    await turnstile.pass();
    submit();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Message must be at least 20 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the acknowledgement on its own', async () => {
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    fireEvent.click(screen.getByRole('checkbox')); // untick
    await turnstile.pass();
    submit();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ContactForm submission (SRS ENQ 002/003, SEC 002)', () => {
  it('posts the stored topic, the token and an idempotency key, then confirms receipt and clears the form', async () => {
    fetchMock.mockReturnValue(answer(202, { data: { receiptId: 'abc123def456', status: 'accepted' } }));
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    await turnstile.pass('token-1');
    submit();

    expect(await screen.findByRole('heading', { name: 'Message received' })).toBeInTheDocument();
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('/api/v1/contact');
    expect(init.headers['idempotency-key']).toMatch(/^ms-/);
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Sarah Wilson',
      email: 'sarah@example.com',
      subject: 'Correct a published listing',
      message: 'The opening hours on the Carlton bakery listing are out of date.',
      acknowledged: true,
      captchaToken: 'token-1',
    });

    fireEvent.click(screen.getByRole('button', { name: /send another message/i }));
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('sends one request however often the button is pressed', async () => {
    let settle: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (settle = resolve)));
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    await turnstile.pass();
    // The same element twice: after the first press its name is "Sending…".
    const button = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    await act(async () => settle(await answer(202, { data: { receiptId: 'r1' } })));
    expect(await screen.findByRole('heading', { name: 'Message received' })).toBeInTheDocument();
  });

  it('shows the API’s field errors, keeps what was typed and renews the single-use token', async () => {
    fetchMock.mockReturnValue(answer(400, { error: { code: 'VALIDATION_ERROR', message: 'internal wording', fields: { message: ['Message must be 20–5000 characters'], subject: ['subject must be longer than or equal to 3 characters'] } } }));
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    await turnstile.pass();
    submit();

    expect(await screen.findByText('Message must be 20–5000 characters')).toBeInTheDocument();
    expect(screen.getByText('Choose what your message is about.')).toBeInTheDocument();
    expect(screen.queryByText(/internal wording|longer than or equal/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('The opening hours on the Carlton bakery listing are out of date.');
    expect(turnstile.api.reset).toHaveBeenCalledWith('widget-1');
  });

  it('asks for the security check again when the API rejects the token', async () => {
    fetchMock.mockReturnValue(answer(400, { error: { code: 'CAPTCHA_FAILED', fields: { captchaToken: ['Verification failed'] } } }));
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    await turnstile.pass();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/security check didn’t pass/i);
    expect(screen.getByText('The security check didn’t pass. Please complete it again.')).toBeInTheDocument();
    expect(turnstile.api.reset).toHaveBeenCalled();
    // The old token was discarded, so resubmitting without a new one is refused locally.
    submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, 'RATE_LIMITED', /too many messages/i],
    [503, 'SERVICE_UNAVAILABLE', /can’t accept messages right now/i],
    [500, 'INTERNAL_ERROR', /still on this page/i],
  ])('explains a %i without the API’s own text and keeps the message', async (status, code, copy) => {
    fetchMock.mockReturnValue(answer(status, { error: { code, message: 'Redis connection refused at 10.0.0.4' } }));
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    await turnstile.pass();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(copy);
    expect(screen.queryByText(/redis/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Sarah Wilson');
  });

  it('reports a network failure and keeps the message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ContactForm turnstileSiteKey={SITE_KEY} />);
    fillIn();
    await turnstile.pass();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t reach the server/i);
    expect(screen.getByLabelText('Message')).toHaveValue('The opening hours on the Carlton bakery listing are out of date.');
    expect(screen.queryByRole('heading', { name: 'Message received' })).not.toBeInTheDocument();
  });
});
