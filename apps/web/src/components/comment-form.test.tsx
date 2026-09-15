// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentForm } from './comment-form';

const SITE_KEY = '1x00000000000000000000AA';

interface RenderedWidget {
  callback: (token: string) => void;
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

const renderForm = (props: Partial<React.ComponentProps<typeof CommentForm>> = {}) =>
  render(<CommentForm postId="p1" turnstileSiteKey={SITE_KEY} guidelinesHref="/review-guidelines" privacyHref="/privacy" {...props} />);

/** Fills every field with something the client check accepts. */
function fillIn() {
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Dev Reader' } });
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'reader@example.com' } });
  fireEvent.change(screen.getByLabelText(/your comment/i), { target: { value: 'A useful thought about this article.' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

/** An API answer in the SRS API 002 envelope. */
const answer = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;
let turnstile: ReturnType<typeof installTurnstile>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  turnstile = installTurnstile();
  // `crypto.randomUUID` backs the idempotency key.
  if (!globalThis.crypto?.randomUUID) vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CommentForm validation (SRS COM 001)', () => {
  it('names each missing field and never reaches the API', () => {
    renderForm();
    submit();
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Write a comment before submitting.')).toBeInTheDocument();
    expect(screen.getByText(/confirm you have read the comment guidelines/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ties each message to its field, so it is announced with the control', () => {
    renderForm();
    submit();
    const name = screen.getByLabelText(/your name/i);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(name.getAttribute('aria-describedby')!)).toHaveTextContent('Enter your name.');
  });

  it('never pre-ticks the acknowledgement', () => {
    renderForm();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('moves focus to the explanation instead of leaving the reader at a button that did nothing', async () => {
    renderForm();
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
  });
});

describe('CommentForm security check (SRS SEC 002)', () => {
  it('renders the challenge itself, so a form reached by client-side navigation still gets one', async () => {
    renderForm();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: SITE_KEY, action: 'comment' })));
  });

  it('refuses to send before the challenge is complete', () => {
    renderForm();
    fillIn();
    submit();
    expect(screen.getByText('Please complete the security check')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the token and asks for a new challenge once the API has used it', async () => {
    fetchMock.mockReturnValue(answer(400, { error: { code: 'CAPTCHA_FAILED', fields: { captchaToken: ['Verification failed'] } } }));
    renderForm();
    fillIn();
    await turnstile.pass('token-1');
    submit();

    await waitFor(() => expect(turnstile.api.reset).toHaveBeenCalledWith('widget-1'));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ captchaToken: 'token-1' });
  });
});

describe('CommentForm submission (SRS COM 001, API 003)', () => {
  it('sends the trimmed values with an idempotency key and confirms moderation, not publication', async () => {
    fetchMock.mockReturnValue(answer(201, { data: { receiptId: 'rcpt-1', status: 'pending' } }));
    renderForm();
    fillIn();
    await turnstile.pass();
    submit();

    await screen.findByText(/submitted for review/i);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/posts/p1/comments');
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^ms-/);
    expect(JSON.parse(init.body as string)).toMatchObject({ displayName: 'Dev Reader', email: 'reader@example.com', acknowledged: true });

    // The comment must not be presented as though it were already on the page.
    expect(screen.getByText(/moderator reads every comment/i)).toBeInTheDocument();
    expect(screen.queryByText(/published|posted|live/i)).toBeNull();
  });

  it('says it is posting and refuses a second press while the first is in flight', async () => {
    let settle: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (settle = resolve)));
    renderForm();
    fillIn();
    await turnstile.pass();
    const button = screen.getByRole('button', { name: /post comment/i });
    fireEvent.click(button);

    // The same button, now saying what it is doing and refusing another press.
    await waitFor(() => expect(button).toHaveTextContent('Posting…'));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    settle({ ok: true, status: 201, json: () => Promise.resolve({ data: { receiptId: 'rcpt-1' } }) } as Response);
    await screen.findByText(/submitted for review/i);
  });
});

describe('CommentForm failures (SRS API 002)', () => {
  it('shows the API`s field errors against the right controls without printing its message', async () => {
    fetchMock.mockReturnValue(answer(400, { error: { code: 'BAD_REQUEST', message: 'displayName must be 2–80 characters (DTO SubmitCommentDto)', fields: { displayName: ['Name must be 2–80 characters'] } } }));
    renderForm();
    fillIn();
    await turnstile.pass();
    submit();

    // The API's field is marked against its control, in the form's own words.
    const message = await screen.findByText('Enter your name (2–80 characters).');
    const name = screen.getByLabelText(/Your name/);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', message.id);
    expect(screen.getByRole('alert')).toHaveTextContent('Please check the highlighted fields and try again.');
    // The API's own wording (form-level or per field) can name internal types; it is never shown.
    expect(screen.queryByText(/SubmitCommentDto/)).toBeNull();
    expect(screen.queryByText(/Name must be 2–80 characters/)).toBeNull();
  });

  it('explains rate limiting as something to wait out', async () => {
    fetchMock.mockReturnValue(answer(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests', fields: {} } }));
    renderForm();
    fillIn();
    await turnstile.pass();
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/too quickly/i));
  });

  it('separates a server fault from a closed service and from an unreachable network', async () => {
    renderForm();
    fillIn();

    // Each attempt uses up its token, so the visitor completes a fresh challenge before retrying.
    fetchMock.mockReturnValue(answer(500, { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error', fields: {} } }));
    await turnstile.pass('token-1');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/at our end/i));

    fetchMock.mockReturnValue(answer(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'x', fields: {} } }));
    await turnstile.pass('token-2');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i));

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await turnstile.pass('token-3');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i));
  });

  it('keeps what the visitor wrote when a submission fails, so nothing has to be typed twice', async () => {
    fetchMock.mockReturnValue(answer(500, { error: { code: 'INTERNAL_ERROR', message: 'x', fields: {} } }));
    renderForm();
    fillIn();
    await turnstile.pass();
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText(/your comment/i)).toHaveValue('A useful thought about this article.');
  });
});

describe('CommentForm surroundings', () => {
  it('closes the form rather than posting into a void when no captcha key is configured', () => {
    renderForm({ turnstileSiteKey: null });
    expect(screen.queryByRole('button', { name: /post comment/i })).toBeNull();
    expect(screen.getByText(/temporarily closed/i)).toBeInTheDocument();
  });

  it('links the guidelines and the privacy notice separately once each is published', () => {
    renderForm();
    expect(screen.getByRole('link', { name: 'comment guidelines' })).toHaveAttribute('href', '/review-guidelines');
    expect(screen.getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/privacy');
  });

  it('keeps the wording but drops a link that would point at an unpublished page', () => {
    renderForm({ guidelinesHref: null, privacyHref: null });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/comment guidelines/)).toBeInTheDocument();
    expect(screen.getByText(/privacy notice/)).toBeInTheDocument();
  });

  it('states the privacy position without claiming anything the API does not do', () => {
    renderForm();
    expect(screen.getByText(/never published/i)).toBeInTheDocument();
    expect(screen.getByText(/moderated before publication/i)).toBeInTheDocument();
  });

  it('has no accessibility violations, idle or showing errors', async () => {
    const { container } = renderForm();
    let results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);

    submit();
    results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
