import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('secret detail: token=abc');
}

describe('ErrorBoundary', () => {
  it('renders a recoverable fallback without leaking the error message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
    expect(screen.queryByText(/token=abc/)).not.toBeInTheDocument();
    // The time is offered so a report can be matched to the server log.
    expect(screen.getByText(/occurred at/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('names a stale build instead of reporting an unexplained error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function StaleChunk(): never {
      const error = new Error('Loading chunk 42 failed');
      error.name = 'ChunkLoadError';
      throw error;
    }
    render(
      <ErrorBoundary>
        <StaleChunk />
      </ErrorBoundary>,
    );
    // Reloading genuinely fixes this one, so it says so rather than blaming the screen.
    expect(screen.getByRole('heading', { name: /out of date/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing you have saved is affected/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
