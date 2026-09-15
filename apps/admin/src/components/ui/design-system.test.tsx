import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { DangerZone, EmptyState, ErrorState, PermissionDenied, RecordMetadata, SettingsSection, StatusTag, TableCard } from './index';

const wrap = (node: React.ReactNode) => render(<App>{node}</App>);

/**
 * The shared pieces every admin screen is built from. These assert the
 * behaviour the screens depend on — that a heading is a heading, that a failure
 * says what to do, that a status survives greyscale — rather than the styling.
 */
describe('admin design system', () => {
  it('gives a settings group a real heading and states what the values mean', () => {
    wrap(
      <SettingsSection title="Sessions" description="How long an administrator stays signed in." summary="Signed out after 30 minutes.">
        <p>fields</p>
      </SettingsSection>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByText('How long an administrator stays signed in.')).toBeInTheDocument();
    expect(screen.getByText('Signed out after 30 minutes.')).toBeInTheDocument();
  });

  it('announces a failure and offers the way out of it', async () => {
    const retry = vi.fn();
    wrap(<ErrorState message="We could not load this" reference="req-1" onRetry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('We could not load this');
    expect(screen.getByText(/quote reference req-1/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('names the access an administrator is missing rather than showing a blank screen', () => {
    wrap(<PermissionDenied what="email logs" />);
    expect(screen.getByText(/you do not have access to view email logs/i)).toBeInTheDocument();
  });

  it('keeps irreversible actions in their own region', () => {
    wrap(
      <DangerZone description="These cannot be undone.">
        <button type="button">Delete everything</button>
      </DangerZone>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: /irreversible actions/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('These cannot be undone.')).toBeInTheDocument();
  });

  it('states a status in words as well as colour', () => {
    wrap(
      <>
        <StatusTag status="published" />
        <StatusTag status="failed" />
      </>,
    );
    // The word is the status; colour only repeats it (WCAG 1.4.1).
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('frames a table with its own toolbar, summary and heading', () => {
    wrap(
      <TableCard title="Stored data" description="What the site keeps." toolbar={<input aria-label="Search" />} summary="2 of 20">
        <table>
          <tbody>
            <tr>
              <td>row</td>
            </tr>
          </tbody>
        </table>
      </TableCard>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Stored data' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByText('2 of 20')).toBeInTheDocument();
  });

  it('shows record provenance as a description list, not free text', () => {
    wrap(<RecordMetadata items={[{ label: 'Last changed', value: '7 Sept 2026' }]} />);
    const term = screen.getByText('Last changed');
    expect(term.tagName).toBe('DT');
    expect(within(term.parentElement as HTMLElement).getByText('7 Sept 2026')).toBeInTheDocument();
  });

  it('offers the next step from an empty list instead of only stating emptiness', () => {
    wrap(<EmptyState title="No roles yet" description="Create one for a group of administrators." action={{ label: 'New role', onClick: () => {} }} />);
    expect(screen.getByText('No roles yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New role' })).toBeInTheDocument();
  });
});
