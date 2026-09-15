// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { StatusPage } from './status-page';
import { NotFoundContent } from './not-found-content';

describe('StatusPage', () => {
  it('names the status, explains it and always offers a published way onward', async () => {
    const { container } = render(<StatusPage status="500" title="We couldn’t load this page" description="Something on our side failed." reference="abc123" />);
    expect(screen.getByRole('heading', { level: 1, name: 'We couldn’t load this page' })).toBeInTheDocument();
    expect(screen.getByText('Error 500')).toBeInTheDocument();
    // A failure is announced, not left to be noticed.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // The reference is what a visitor can quote; the error text itself is never printed.
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse businesses' })).toHaveAttribute('href', '/business');

    const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  it('does not announce a 404, which is an ordinary answer rather than a failure', () => {
    render(<NotFoundContent title="Listing not found" description="This business is not published." />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Listing not found' })).toBeInTheDocument();
    expect(screen.getByText('Error 404')).toBeInTheDocument();
  });
});
