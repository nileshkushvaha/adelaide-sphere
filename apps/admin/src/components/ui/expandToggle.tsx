import type { MouseEvent } from 'react';
import { Button } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

/**
 * The expand control for a table row, as a named button.
 *
 * Ant's own expand icon is a `<button>` with no text, so a screen reader
 * announces "button" once per row and nothing else (axe `button-name`,
 * WCAG 4.1.2). This one says what it opens and whether it is open.
 *
 *   expandable={{ expandIcon: expandToggle((row) => `the enquiry from ${row.name}`), … }}
 */
export function expandToggle<T>(describe: (record: T) => string) {
  return function ExpandToggle({ expanded, onExpand, record }: { expanded: boolean; onExpand: (record: T, event: MouseEvent<HTMLElement>) => void; record: T }) {
    return (
      <Button
        type="text"
        size="small"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Hide' : 'Show'} ${describe(record)}`}
        icon={expanded ? <DownOutlined aria-hidden="true" /> : <RightOutlined aria-hidden="true" />}
        onClick={(event) => onExpand(record, event)}
      />
    );
  };
}
