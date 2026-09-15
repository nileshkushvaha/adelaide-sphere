import type { ReactNode } from 'react';
import { Card, Typography } from 'antd';
import { brand } from '@/config/theme';

interface Props {
  title: string;
  /** One plain sentence saying what this group of settings controls. */
  description?: ReactNode;
  /** A short status line for the group, shown on the right of the header. */
  status?: ReactNode;
  children: ReactNode;
  /** A summary of what the current values mean, in words rather than numbers. */
  summary?: ReactNode;
}

/**
 * One group of settings: heading, a sentence of purpose, the fields, and an
 * optional summary of what the current values add up to.
 *
 * Settings screens are read in groups — sessions, passwords, sign-in — and a
 * long unbroken column of numbers gives an administrator no way to find the one
 * they came for.
 */
export function SettingsSection({ title, description, status, children, summary }: Props) {
  return (
    <Card
      style={{ marginBottom: 20 }}
      title={
        <div style={{ paddingBlock: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
          {description && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 3, fontWeight: 400, fontSize: 13, lineHeight: 1.5, whiteSpace: 'normal' }}>
              {description}
            </Typography.Text>
          )}
        </div>
      }
      extra={status}
    >
      {children}
      {summary && (
        <div
          style={{
            marginTop: 4,
            padding: '12px 14px',
            borderRadius: 10,
            background: brand.surfaceMuted,
            border: `1px solid ${brand.border}`,
            fontSize: 13,
            color: brand.textMuted,
            lineHeight: 1.6,
          }}
        >
          {summary}
        </div>
      )}
    </Card>
  );
}
