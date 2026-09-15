import { describe, expect, it } from 'vitest';
import { isPastLastPage, pagedPath, pagedTitle, readPageParam } from './pagination';

describe('listing pagination', () => {
  it('reads only whole page numbers of at least 1', () => {
    expect(readPageParam(undefined)).toBe(1);
    expect(readPageParam('3')).toBe(3);
    expect(readPageParam(['4', '9'])).toBe(4);
    for (const bad of ['0', '-2', '1.5', 'abc', '2abc', '', '9999999']) expect(readPageParam(bad), bad).toBe(1);
  });

  it('keeps page 1 on the plain address and gives later pages their own', () => {
    expect(pagedPath('/blog', 1)).toBe('/blog');
    expect(pagedPath('/blog/category/food', 2)).toBe('/blog/category/food?page=2');
    expect(pagedTitle('Blog', 1)).toBe('Blog');
    expect(pagedTitle('Blog', 3)).toBe('Blog — page 3');
  });

  it('treats a page beyond the last as missing, but never page 1', () => {
    expect(isPastLastPage(1, 0)).toBe(false);
    expect(isPastLastPage(2, 2)).toBe(false);
    expect(isPastLastPage(3, 2)).toBe(true);
  });
});
