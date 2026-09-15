import { Button, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { brand } from '@/config/theme';
import { useThemeMode } from '@/theme/theme-mode';

/**
 * Switches between the light and dark themes.
 *
 * One button with a fixed name and a pressed state — the ARIA toggle pattern —
 * rather than a label that changes: a screen reader hears "Dark theme, toggle
 * button, not pressed", which says both what it is and where it stands.
 */
export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const dark = mode === 'dark';
  return (
    <Tooltip title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}>
      <Button
        type="text"
        aria-label="Dark theme"
        aria-pressed={dark}
        icon={dark ? <SunOutlined aria-hidden="true" /> : <MoonOutlined aria-hidden="true" />}
        onClick={() => setMode(dark ? 'light' : 'dark')}
        style={{ color: brand.textMuted }}
      />
    </Tooltip>
  );
}
