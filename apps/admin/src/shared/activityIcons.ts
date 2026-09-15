import { createElement, type ReactNode } from 'react';
import {
  AppstoreOutlined,
  CommentOutlined,
  FileTextOutlined,
  LockOutlined,
  MailOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

const ICONS = {
  all: AppstoreOutlined,
  authentication: LockOutlined,
  access_control: TeamOutlined,
  content: FileTextOutlined,
  moderation: CommentOutlined,
  communication: MailOutlined,
  configuration: SettingOutlined,
  system: ThunderboltOutlined,
  unknown: QuestionCircleOutlined,
} as const;

/** The icon for an activity area. Decorative: the area's name is always written beside it. */
export function activityAreaIcon(category: string | null | undefined): ReactNode {
  const icon = ICONS[(category ?? 'unknown') as keyof typeof ICONS] ?? QuestionCircleOutlined;
  return createElement(icon, { 'aria-hidden': true });
}
