// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoryCombobox } from './category-combobox';

const categories = [
  { slug: 'food', label: 'All Food & Drink', group: 'Food & Drink' },
  { slug: 'cafes', label: 'Cafes', group: 'Food & Drink' },
  { slug: 'plumbers', label: 'Plumbers', group: 'Home Services' },
];

it('filters grouped options and submits the selected slug, not the typed label', () => {
  render(<form aria-label="Search"><CategoryCombobox categories={categories} /></form>);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  expect(screen.getByRole('group', { name: 'Food & Drink' })).toBeVisible();
  fireEvent.change(input, { target: { value: 'cafe' } });
  expect(screen.queryByRole('group', { name: 'Home Services' })).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('Cafes');
  expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('category')).toBe('cafes');
});

it('supports group-name searches and restores the selection on Escape', () => {
  render(<CategoryCombobox categories={categories} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Food' } });
  expect(screen.getByRole('option', { name: 'Cafes' })).toBeVisible();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('All categories');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('handles empty results and ArrowUp from the initial position', () => {
  render(<CategoryCombobox categories={categories} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.getByRole('status')).toHaveTextContent('No matching categories');
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('Plumbers');
});
