import type { ReactNode } from 'react';
import { Button, Empty, Typography } from 'antd';

interface Props {
  title: string;
  /** Why the list is empty and what to do next; never just "No data". */
  description: ReactNode;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}

/** Explains an empty list and offers the next step, instead of an empty table. */
export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <Empty
        image={icon ?? Empty.PRESENTED_IMAGE_SIMPLE}
        styles={{ image: { height: 56 } }}
        description={
          <span>
            <Typography.Title level={3} style={{ fontSize: 16, marginBottom: 4 }}>
              {title}
            </Typography.Title>
            <Typography.Text type="secondary">{description}</Typography.Text>
          </span>
        }
      >
        {action && (
          <Button type="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </Empty>
    </div>
  );
}
