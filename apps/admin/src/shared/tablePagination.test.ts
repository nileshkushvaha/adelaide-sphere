import { describe, expect, it, vi } from 'vitest';
import type { TablePaginationConfig } from 'antd';
import { tablePagination } from './tablePagination';

const listParams = (pageSize = 20) => ({ pageSize, setPage: vi.fn(), setPageSize: vi.fn() });
const change = (config: TablePaginationConfig | false, page: number, size: number) => (config as TablePaginationConfig).onChange!(page, size);

describe('tablePagination', () => {
  it('has no pagination until the list has loaded', () => {
    expect(tablePagination(undefined, listParams())).toBe(false);
  });

  it('moves to the chosen page', () => {
    const list = listParams(20);
    change(tablePagination({ page: 1, pageSize: 20, total: 240 }, list), 2, 20);
    expect(list.setPage).toHaveBeenCalledWith(2);
    expect(list.setPageSize).not.toHaveBeenCalled();
  });

  it('changes the page size when the reader picks another size', () => {
    const list = listParams(20);
    change(tablePagination({ page: 3, pageSize: 20, total: 240 }, list), 1, 50);
    expect(list.setPageSize).toHaveBeenCalledWith(50);
    expect(list.setPage).not.toHaveBeenCalled();
  });

  it('still moves pages when the API pages at a different size than the address bar asked for', () => {
    // The table shows the API's size; a click on page 2 reports that size, not the address bar's.
    const list = listParams(20);
    change(tablePagination({ page: 1, pageSize: 10, total: 240 }, list), 2, 10);
    expect(list.setPage).toHaveBeenCalledWith(2);
    expect(list.setPageSize).not.toHaveBeenCalled();
  });
});
