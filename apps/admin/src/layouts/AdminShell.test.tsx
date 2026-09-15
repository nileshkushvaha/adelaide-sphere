import { screen, waitFor, within } from '@testing-library/react';
import { AdminShell } from './AdminShell';
import { renderWithProviders, user } from '@/test/render';
import { setViewport } from '@/test/setup';

describe('AdminShell', () => {
  it('on desktop the toggle collapses and expands the side navigation with correct aria state', async () => {
    const ue = user();
    renderWithProviders(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
    );
    const toggle = screen.getByRole('button', { name: /collapse navigation/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const nav = screen.getByRole('navigation', { name: /admin navigation/i });
    expect(nav.closest(`#${CSS.escape(toggle.getAttribute('aria-controls') ?? '')}`)).not.toBeNull();
    await ue.click(toggle);
    expect(screen.getByRole('button', { name: /expand navigation/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('on mobile the navigation opens in a drawer by keyboard and closes with Escape, restoring focus', async () => {
    const ue = user();
    setViewport({ desktop: false });
    renderWithProviders(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
    );
    const toggle = screen.getByRole('button', { name: /open navigation/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    await ue.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: /close navigation/i })).toHaveAttribute('aria-expanded', 'true');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('navigation', { name: /admin navigation/i })).toBeInTheDocument();
    const dashboardLink = within(dialog).getByRole('link', { name: 'Dashboard' });
    dashboardLink.focus();
    expect(dashboardLink).toHaveFocus();
    await ue.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: /open navigation/i })).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(screen.getByRole('button', { name: /open navigation/i })).toHaveFocus());
  });

  it('skip link is the first focusable element', async () => {
    const ue = user();
    renderWithProviders(
      <AdminShell>
        <p>content</p>
      </AdminShell>,
    );
    await ue.tab();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });
});
