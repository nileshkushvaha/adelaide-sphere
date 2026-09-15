import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PermissionCatalogEntry } from '@/api/authorization';
import { PermissionMatrix } from './PermissionMatrix';

const entry = (key: string, label: string, module: string, menuItem: string, action: string, isActive = true) =>
  ({ key, label, module, menuItem, action, description: `${label} description`, isActive, isSystem: true }) as PermissionCatalogEntry;

const catalog = [
  entry('settings.general.view', 'View general settings', 'Configuration', 'General settings', 'View'),
  entry('settings.general.update', 'Change general settings', 'Configuration', 'General settings', 'Update'),
  entry('settings.seo.view', 'View SEO settings', 'Configuration', 'SEO settings', 'View'),
  entry('settings.seo.update', 'Change SEO settings', 'Configuration', 'SEO settings', 'Update'),
  entry('reviews.view', 'View reviews', 'Community', 'Reviews', 'View'),
  entry('reviews.redact', 'Redact reviews', 'Community', 'Reviews', 'Redact'),
  entry('settings.manage', 'Manage settings (retired)', 'Retired', 'General settings', 'Retired', false),
];

describe('PermissionMatrix', () => {
  it('lays each sidebar section out as menu items by action', () => {
    render(<PermissionMatrix catalog={catalog} value={[]} onChange={() => undefined} />);
    const configuration = screen.getByRole('group', { name: /Configuration/ });
    expect(within(configuration).getByRole('rowheader', { name: /SEO settings/ })).toBeInTheDocument();
    expect(within(configuration).getByRole('checkbox', { name: 'SEO settings: Update' })).toBeInTheDocument();
    expect(within(configuration).queryByRole('checkbox', { name: 'SEO settings: Publish' })).not.toBeInTheDocument();
  });

  it('grants one menu item without its neighbours, and ticks View with any action', () => {
    const onChange = vi.fn();
    render(<PermissionMatrix catalog={catalog} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'SEO settings: Update' }));
    expect(onChange).toHaveBeenCalledWith(['settings.seo.update', 'settings.seo.view']);
  });

  it('takes the actions away with View', () => {
    const onChange = vi.fn();
    render(<PermissionMatrix catalog={catalog} value={['settings.seo.update', 'settings.seo.view']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'SEO settings: View' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('offers named extras beside the standard columns', () => {
    render(<PermissionMatrix catalog={catalog} value={[]} onChange={() => undefined} />);
    expect(screen.getByRole('checkbox', { name: /Redact/ })).toBeInTheDocument();
  });

  it('counts active permissions only, and shows a retired one only while it is held', () => {
    const { rerender } = render(<PermissionMatrix catalog={catalog} value={['settings.seo.view', 'settings.manage']} onChange={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 6 permissions selected + 1 retired');
    expect(screen.getByRole('group', { name: /Retired/ })).toBeInTheDocument();
    rerender(<PermissionMatrix catalog={catalog} value={['settings.seo.view']} onChange={() => undefined} />);
    expect(screen.queryByRole('group', { name: /Retired/ })).not.toBeInTheDocument();
  });

  it('lists the selection at the top, and removing one there updates the value', () => {
    const onChange = vi.fn();
    render(<PermissionMatrix catalog={catalog} value={['reviews.view', 'settings.seo.view']} onChange={onChange} />);
    const summary = screen.getByRole('region', { name: 'Selected permissions' });
    expect(within(summary).getByText('SEO settings: View')).toBeInTheDocument();
    fireEvent.click(within(summary).getByRole('button', { name: 'Remove View reviews' }));
    expect(onChange).toHaveBeenCalledWith(['settings.seo.view']);
  });

  it('offers no remove buttons when read-only', () => {
    render(<PermissionMatrix catalog={catalog} value={['reviews.view']} onChange={() => undefined} disabled />);
    expect(screen.queryByRole('button', { name: 'Remove View reviews' })).not.toBeInTheDocument();
  });
});
