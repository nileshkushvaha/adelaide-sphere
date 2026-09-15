import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Button, Result, Typography } from 'antd';

interface Props {
  children: ReactNode;
  /** Inside the admin shell: no second <main>, so navigation stays usable. */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  /** A stale build is the one render failure with a specific remedy, so it is told apart. */
  stale: boolean;
  /** Local time of the failure: the operator can quote it, and it matches the server logs. */
  occurredAt: string | null;
}

/**
 * Application-level boundary: an unexpected render error shows a recoverable
 * screen instead of a blank page. Error details stay in the console; nothing
 * sensitive is rendered.
 *
 * A failed lazy import ("ChunkLoadError") means the browser is running an older
 * build than the server now serves — after a deployment, for example. That is
 * not a defect in the screen, and reloading genuinely fixes it, so it is named
 * rather than reported as an unexplained error.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, stale: false, occurredAt: null };

  static getDerivedStateFromError(error: Error): State {
    const stale = error.name === 'ChunkLoadError' || /Loading chunk|dynamically imported module|Importing a module script failed/i.test(error.message);
    return { hasError: true, stale, occurredAt: new Date().toLocaleString('en-AU') };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const { stale, occurredAt } = this.state;
    return (
      <Wrapper inline={this.props.inline}>
        <Result
          status={stale ? 'warning' : 'error'}
          title={<h1 style={{ fontSize: 24, margin: 0 }}>{stale ? 'This page is out of date' : 'Something went wrong'}</h1>}
          subTitle={
            stale
              ? 'The admin has been updated since this tab was opened, so part of it could not be loaded. Reload to get the current version; nothing you have saved is affected.'
              : 'The admin interface hit an unexpected error. Reload the page to continue; if it keeps happening, report it with the time it occurred.'
          }
          extra={
            <>
              <Button type="primary" onClick={this.reload}>
                Reload page
              </Button>
              {occurredAt && (
                <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                  Occurred at {occurredAt}
                </Typography.Paragraph>
              )}
            </>
          }
        />
      </Wrapper>
    );
  }
}

function Wrapper({ inline, children }: { inline?: boolean; children: ReactNode }) {
  return inline ? (
    <div style={{ padding: 32 }} role="alert">
      {children}
    </div>
  ) : (
    <main id="main-content" tabIndex={-1} style={{ padding: 32 }} role="alert">
      {children}
    </main>
  );
}

/**
 * One screen's boundary: a render error replaces that screen only, the shell and
 * its navigation stay, and moving to another address starts fresh.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname} inline>
      {children}
    </ErrorBoundary>
  );
}
