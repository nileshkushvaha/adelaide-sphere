import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { TermSelect } from './TermSelect';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const term = (id: string, name: string, active = true) => ({ id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), active, version: 1, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });

/** A form field's worth of state, so the picker behaves as it does inside a form. */
function Harness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <TermSelect kind="services" multiple aria-label="Services" value={value} onChange={(next) => setValue((next as string[]) ?? [])} />
      <output data-testid="value">{value.join(',')}</output>
    </>
  );
}

describe('TermSelect', () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const params = new URL(url, 'http://admin.test').searchParams;
      if (params.get('ids')) return jsonResponse(200, { data: [term('sold123456789012345678', 'Zinc roofing', false)], meta: { page: 1, pageSize: 50, total: 1, pageCount: 1 } });
      const q = params.get('q') ?? '';
      const all = [term('bath12345678901234567890', 'Bathroom plumbing'), term('plum12345678901234567890', 'Plumber'), term('plmb12345678901234567890', 'Plumbing')];
      const data = all.filter((item) => item.name.toLowerCase().includes(q.toLowerCase()));
      return jsonResponse(200, { data, meta: { page: 1, pageSize: 20, total: data.length, pageCount: 1 } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('asks the server for matches as the editor types, so terms beyond the first page can be chosen', async () => {
    const ue = user();
    renderWithProviders(<Harness initial={[]} />);
    await ue.click(screen.getByRole('combobox', { name: 'Services' }));
    await ue.type(screen.getByRole('combobox', { name: 'Services' }), 'plumber');
    await waitFor(() => expect(urls.some((url) => url.includes('q=plumber') && url.includes('status=active'))).toBe(true));
    await ue.click(await screen.findByTitle('Plumber'));
    expect(screen.getByTestId('value')).toHaveTextContent('plum12345678901234567890');
  });

  it('names a chosen term that is not in the current results, and marks it inactive', async () => {
    renderWithProviders(<Harness initial={['sold123456789012345678']} />);
    await waitFor(() => expect(urls.some((url) => url.includes('ids=sold123456789012345678'))).toBe(true));
    expect(await screen.findByText('Zinc roofing (inactive)')).toBeInTheDocument();
  });
});
