import type { ReactNode } from 'react';
import { Card, Typography } from 'antd';

interface Props {
  title?: ReactNode;
  /** Short guidance shown under the section title. */
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  bodyPadding?: number;
  style?: React.CSSProperties;
}

/** A titled block of content; the standard container inside every screen. */
export function SectionCard({ title, description, extra, children, bodyPadding, style }: Props) {
  return (
    <Card
      title={
        title ? (
          <div style={{ paddingBlock: 4 }}>
            {/* A real heading keeps the document outline continuous (WCAG 1.3.1). */}
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
            {description && (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 3, fontWeight: 400, fontSize: 13, lineHeight: 1.5, whiteSpace: 'normal' }}>
                {description}
              </Typography.Text>
            )}
          </div>
        ) : undefined
      }
      extra={extra}
      style={{ marginBottom: 20, ...style }}
      styles={{ body: bodyPadding !== undefined ? { padding: bodyPadding } : undefined }}
    >
      {children}
    </Card>
  );
}
