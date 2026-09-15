import type { TablePaginationConfig } from 'antd';
import { PAGE_SIZES } from './useListParams';

interface CollectionMeta {
  page: number;
  pageSize: number;
  total: number;
}

interface ListParams {
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * The pagination a list table shows: the page, how many rows it holds, and the
 * total, with the size chooser every list now offers.
 *
 * One helper rather than the same six lines on twenty screens — which is how
 * half of them ended up with `showSizeChanger: false` and no way to see more
 * than twenty rows at a time.
 *
 * Ant reports a size change through `onChange` as well as `onShowSizeChange`,
 * so the size is compared first: treating it as a page change would move the
 * reader to a page they did not ask for.
 */
export function tablePagination(meta: CollectionMeta | undefined, list: ListParams): TablePaginationConfig | false {
  if (!meta) return false;
  return {
    current: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZES,
    // "1–20 of 240" is the question a reader actually has when they look here.
    showTotal: (total, [from, to]) => `${from}–${to} of ${total}`,
    // Compared with the size the table is showing (the API's answer), not the
    // one in the address bar: when the two differ — a list the API pages at its
    // own size — every click on a page number would otherwise read as a size
    // change and send the reader back to page 1.
    onChange: (page, size) => {
      if (size !== undefined && size !== meta.pageSize) list.setPageSize(size);
      else list.setPage(page);
    },
  };
}
