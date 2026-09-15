import type { ReactNode } from 'react';
import { Card, Space, Typography } from 'antd';

interface Props {
  /** A heading, when the screen holds more than one table and they need naming. */
  title?: string;
  /** One sentence saying what this table is, under the heading. */
  description?: ReactNode;
  /**
   * Search, filters and view controls. They belong to the table, so they sit
   * inside its card rather than floating above it — which is what made the list
   * screens read as two unrelated things stacked on a page.
   */
  toolbar?: ReactNode;
  /** Actions for the current selection, right-aligned in the toolbar. */
  actions?: ReactNode;
  /** The table itself, rendered flush to the card edges. */
  children: ReactNode;
  /** A short summary of what is on screen, e.g. "12 of 240". */
  summary?: ReactNode;
  /** Pagination or any other footer control, right-aligned. */
  footer?: ReactNode;
  style?: React.CSSProperties;
}

/**
 * The container every list screen uses: one card holding its own toolbar, the
 * table, and a footer that says how much is shown. Hairlines separate the three
 * bands, so the whole screen reads as a single object rather than a heading, a
 * loose row of dropdowns and a table floating on the page background.
 */
export function TableCard({ title, description, toolbar, actions, children, summary, footer, style }: Props) {
  return (
    <Card className="ms-table-card" style={{ marginBottom: 20, overflow: 'hidden', ...style }}>
      {title && (
        <div className="ms-table-toolbar" style={{ display: 'block' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
          {description && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 3, fontSize: 13, lineHeight: 1.5 }}>
              {description}
            </Typography.Text>
          )}
        </div>
      )}
      {(toolbar || actions) && (
        <div className="ms-table-toolbar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Space wrap size={10} style={{ flex: 1, minWidth: 0 }}>
            {toolbar}
          </Space>
          {actions && <Space wrap size={8}>{actions}</Space>}
        </div>
      )}
      {children}
      {(summary || footer) && (
        <div className="ms-table-footer">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {summary}
          </Typography.Text>
          {footer}
        </div>
      )}
    </Card>
  );
}
