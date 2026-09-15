// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { SocialLinks } from './social-links';
import { brandLabel } from './brand-icon';

const links = [
  { platform: 'facebook', url: 'https://www.facebook.com/adelaidesphere' },
  { platform: 'pinterest', url: 'https://www.pinterest.com/adelaidesphere' },
] as never;

describe('SocialLinks', () => {
  it('shows a mark per configured profile and names it for assistive technology', async () => {
    const { container } = render(<SocialLinks links={links} label="Adelaide Sphere on social media" />);
    const list = screen.getByRole('list', { name: 'Adelaide Sphere on social media' });
    // The icon carries no name of its own, so each link's name is the platform.
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('href', 'https://www.facebook.com/adelaidesphere');
    expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute('href', 'https://www.pinterest.com/adelaidesphere');
    expect(list.querySelectorAll('svg')).toHaveLength(2);
    // Outbound profiles carry no ranking signal and cannot reach back into the page.
    expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  it('renders nothing when no profile is configured, rather than an empty row', () => {
    const { container } = render(<SocialLinks links={[] as never} label="Social" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names every link kind, and falls back for one it does not know', () => {
    expect(brandLabel('pinterest')).toBe('Pinterest');
    expect(brandLabel('linkedin')).toBe('LinkedIn');
    expect(brandLabel('bluesky')).toBe('Profile');
  });
});
