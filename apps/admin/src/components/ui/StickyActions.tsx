import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';

interface Props {
  /** Left-hand context: unsaved changes, current version, validation summary. */
  status?: ReactNode;
  children: ReactNode;
  /** Keeps the bar the same width as the form it belongs to. */
  style?: React.CSSProperties;
}

/**
 * Save bar pinned to the bottom of long forms, so the primary action is always
 * reachable without scrolling and unsaved state stays visible.
 */
export function StickyActions({ status, children, style }: Props) {
  return (
    <div
      className="ms-sticky-actions"
      style={{
        position: 'sticky',
        bottom: 16,
        zIndex: 20,
        marginTop: 20,
        padding: '12px 16px',
        borderRadius: 14,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        ...style,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {status}
      </Typography.Text>
      <Space wrap>{children}</Space>
    </div>
  );
}
