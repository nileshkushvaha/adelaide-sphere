import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useListParams } from './useListParams';
import { useBusy } from './useBusy';
import { user } from '@/test/render';

const FILTERS = ['status', 'q'] as const;

function Probe() {
  const list = useListParams<(typeof FILTERS)[number], 'sort'>(FILTERS);
  return (
    <div>
      <output data-testid="state">{JSON.stringify({ page: list.page, status: list.get('status') ?? null, sort: list.get('sort') ?? null, filtered: list.filtered, active: list.active })}</output>
      <button onClick={() => list.set('status', 'pending')}>Filter</button>
      <button onClick={() => list.setPage(3)}>Page three</button>
      <button onClick={() => list.set('sort', 'name')}>Sort</button>
      <button onClick={list.clear}>Clear</button>
    </div>
  );
}

const stateOf = () => JSON.parse(screen.getByTestId('state').textContent!);

describe('useListParams', () => {
  const renderAt = (url: string) => render(<Probe />, { wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> });

  it('reads the page and filters from the address', () => {
    renderAt('/comments?status=pending&page=2');
    expect(stateOf()).toMatchObject({ page: 2, status: 'pending', filtered: true, active: ['status'] });
  });

  it('treats a missing or nonsense page as the first one', () => {
    renderAt('/comments?page=nonsense');
    expect(stateOf().page).toBe(1);
  });

  it('returns to the first page when a filter changes', async () => {
    const ue = user();
    renderAt('/comments?page=4');
    await ue.click(screen.getByRole('button', { name: 'Filter' }));
    expect(stateOf()).toMatchObject({ page: 1, status: 'pending' });
  });

  it('keeps the page when the page itself changes', async () => {
    const ue = user();
    renderAt('/comments?status=pending');
    await ue.click(screen.getByRole('button', { name: 'Page three' }));
    expect(stateOf()).toMatchObject({ page: 3, status: 'pending' });
  });

  it('does not count sort as a filter, and leaves it alone when the filters are cleared', async () => {
    const ue = user();
    renderAt('/comments');
    await ue.click(screen.getByRole('button', { name: 'Sort' }));
    expect(stateOf()).toMatchObject({ sort: 'name', filtered: false });
    await ue.click(screen.getByRole('button', { name: 'Filter' }));
    expect(stateOf().filtered).toBe(true);
    await ue.click(screen.getByRole('button', { name: 'Clear' }));
    expect(stateOf()).toMatchObject({ sort: 'name', status: null, filtered: false, page: 1 });
  });
});

function BusyProbe({ action }: { action: () => Promise<void> }) {
  const [busy, run] = useBusy();
  return (
    <button disabled={false} onClick={() => void run(action)}>
      {busy ? 'Working' : 'Go'}
    </button>
  );
}

describe('useBusy', () => {
  it('runs one action at a time, however fast the button is clicked', async () => {
    const ue = user();
    let started = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(<BusyProbe action={async () => {
      started += 1;
      await held;
    }} />);

    const button = screen.getByRole('button');
    await ue.click(button);
    await ue.click(button);
    expect(started).toBe(1);
    expect(button).toHaveTextContent('Working');

    release();
    await screen.findByText('Go');
    await ue.click(button);
    expect(started).toBe(2);
  });
});
