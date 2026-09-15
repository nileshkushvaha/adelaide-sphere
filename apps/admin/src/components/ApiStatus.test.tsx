import { screen, waitFor } from '@testing-library/react';
import { ApiStatus } from './ApiStatus';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse, textResponse } from '@/test/fetch-fakes';

describe('ApiStatus', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows loading, then available with the request id, and only re-checks on demand', async () => {
    const ue = user();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse(200, { data: { status: 'ok' } }, { 'x-request-id': 'rid-42' });
    }) as typeof fetch;
    renderWithProviders(<ApiStatus />);
    expect(screen.getByText(/checking the connection/i)).toBeInTheDocument();
    // Healthy is stated once, quietly: the loud treatment belongs to the state
    // an administrator has to act on.
    expect(await screen.findByText('connected')).toBeInTheDocument();
    expect(screen.getByText(/this interface can reach the api/i)).toBeInTheDocument();
    expect(calls).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1); // no background polling
    await ue.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('shows a safe failure state when the API is unreachable', async () => {
    globalThis.fetch = (async () => textResponse(502, 'Bad Gateway')) as typeof fetch;
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText(/cannot reach the api/i)).toBeInTheDocument();
    expect(screen.getByText(/unexpected problem/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing you save will be stored/i)).toBeInTheDocument();
    expect(screen.queryByText(/bad gateway/i)).not.toBeInTheDocument();
  });

  it('shows the API reference when the API returns an envelope', async () => {
    globalThis.fetch = (async () =>
      jsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable', fields: {}, requestId: 'r-9' } }, { 'x-request-id': 'r-9' })) as typeof fetch;
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText(/cannot reach the api/i)).toBeInTheDocument();
    // An availability failure gets the client's own sentence; what the server said stays off the page.
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/database unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByText(/quote reference SERVICE_UNAVAILABLE · request r-9/i)).toBeInTheDocument();
  });
});
