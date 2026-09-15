import type { ReactNode } from 'react';
import { Button } from 'antd';
import { EmptyState } from './EmptyState';
import type { AsyncState } from '@/shared/useAsync';

/**
 * What a table shows in place of rows.
 *
 * Three different situations were being answered with one sentence — often
 * "No comments match." whether or not anything had been asked for, and in one
 * case a literal space. They need different answers because they need different
 * next steps:
 *
 *  * nothing has been created yet — offer to create something;
 *  * nothing matches these filters — offer to clear them;
 *  * the request failed — say so and offer to try again, which is the one case
 *    where an empty table is a lie.
 *
 * While the request is in flight this renders nothing: Ant would otherwise
 * flash "nothing here" underneath the loading spinner before the first row
 * arrives.
 */
interface Props<T> {
  state: AsyncState<T>;
  /** Whether any filter or search term is currently in force. */
  filtered: boolean;
  /** Shown when the collection itself is empty. */
  empty: { title: string; description: ReactNode; action?: { label: string; onClick: () => void } };
  /** What the filtered-out case is called, e.g. "articles". Defaults to "records". */
  noun?: string;
  onClear: () => void;
}

export function ListEmpty<T>({ state, filtered, empty, noun = 'records', onClear }: Props<T>): ReactNode {
  // A failed load is reported above the table by ErrorState; an empty-table
  // message here would contradict it.
  if (state.status !== 'ready') return <span className="sr-only">Loading</span>;
  if (filtered) {
    return <EmptyState title={`No ${noun} match your filters`} description="Try a different search term, or clear the filters to see everything." action={{ label: 'Clear filters', onClick: onClear }} />;
  }
  return <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
}

/**
 * The chip row above a filtered table: what is in force, and one way out of it.
 * Only rendered when something is filtered, so it never takes space it has not
 * earned.
 */
export function FilterSummary({ children, onClear }: { children?: ReactNode; onClear: () => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }} role="status">
      {children}
      <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
