import { screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { THEME_STORAGE_KEY } from '@/theme/theme-mode';
import { renderWithProviders, user } from '@/test/render';

describe('ThemeToggle', () => {
  afterEach(() => window.localStorage.removeItem(THEME_STORAGE_KEY));

  it('starts light, switches to dark, and remembers the choice in this browser', async () => {
    const ui = user();
    renderWithProviders(<ThemeToggle />);
    const toggle = await screen.findByRole('button', { name: 'Dark theme' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.theme).toBe('light');

    await ui.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await ui.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('opens light when storage is refused, rather than failing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderWithProviders(<ThemeToggle />);
      expect(document.documentElement.dataset.theme).toBe('light');
    } finally {
      spy.mockRestore();
    }
  });
});
