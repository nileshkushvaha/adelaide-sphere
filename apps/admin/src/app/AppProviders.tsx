import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import enAU from 'antd/locale/en_GB';
import { Refine } from '@refinedev/core';
import { useNotificationProvider } from '@refinedev/antd';
import routerProvider from '@refinedev/react-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { dataProvider } from '@/api/data-provider';
import { createAuthProvider } from '@/auth/auth-provider';
import { createAccessControlProvider } from '@/auth/access-control';
import { CapabilityProvider } from '@/auth/CapabilityProvider';
import { withCapabilityLifecycle } from '@/auth/capability-lifecycle';
import { capabilityStore } from '@/auth/capability-store';
import type { AuthProvider } from '@refinedev/core';
import { APP_NAME } from '@/config/app-config';
import { applyThemeVariables, createAdminTheme, type ThemeMode } from '@/config/theme';
import { readStoredThemeMode, storeThemeMode, ThemeModeContext } from '@/theme/theme-mode';
import { usePrefersReducedMotion } from '@/shared/usePrefersReducedMotion';

interface AppProvidersProps {
  children: ReactNode;
  /** Test hook; the app uses the cookie-session provider. */
  authProvider?: AuthProvider;
}

const defaultAuthProvider = createAuthProvider();

/** Refine needs the antd App context for notifications, so it is mounted inside it. */
function RefineRoot({ children, authProvider }: AppProvidersProps) {
  const antNotifications = useNotificationProvider();
  // Refine's login hook opens a generic "login-error" toast whenever sign-in does
  // not complete. The sign-in screen answers every failure in place, so the toast
  // only repeated it — and for the two-step marker it printed the challenge
  // itself on screen. That one key is dropped; every other notification passes.
  const notificationProvider = useMemo(
    () => ({
      ...antNotifications,
      open: (params: Parameters<typeof antNotifications.open>[0]) => {
        if (params.key === 'login-error') return;
        antNotifications.open(params);
      },
    }),
    [antNotifications],
  );
  const provider = authProvider ?? defaultAuthProvider;
  // The capability store is the single owner of the codes the server returned;
  // the lifecycle wrapper keeps it in step with the session (SRS RBAC 010).
  const authProviderWithCapabilities = useMemo(() => withCapabilityLifecycle(provider, capabilityStore), [provider]);
  // The provider asks the auth provider for the codes the *server* calculated;
  // the admin never recreates role resolution (SRS RBAC 010).
  const accessControlProvider = useMemo(() => createAccessControlProvider(() => capabilityStore.get()), []);
  return (
    <Refine
      routerProvider={routerProvider}
      dataProvider={dataProvider}
      authProvider={authProviderWithCapabilities}
      accessControlProvider={accessControlProvider}
      notificationProvider={notificationProvider}
      resources={[{ name: 'businesses', list: '/businesses', create: '/businesses/new', edit: '/businesses/:id', meta: { label: 'Businesses' } }]}
      options={{
        disableTelemetry: true,
        syncWithLocation: true,
        warnWhenUnsavedChanges: true,
        title: { text: APP_NAME },
      }}
    >
      {children}
    </Refine>
  );
}

/**
 * Provider stack: theme → antd App (message/notification context) → error
 * boundary → Refine. Must be rendered inside a router (BrowserRouter in the
 * app, MemoryRouter in tests).
 */
export function AppProviders({ children, authProvider }: AppProvidersProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [mode, setModeState] = useState<ThemeMode>(readStoredThemeMode);
  const themeMode = useMemo(
    () => ({
      mode,
      setMode: (next: ThemeMode) => {
        storeThemeMode(next);
        setModeState(next);
      },
    }),
    [mode],
  );
  // Before paint, so a theme change never shows one frame of the old colours.
  useLayoutEffect(() => {
    applyThemeVariables(mode);
  }, [mode]);
  const antTheme = useMemo(() => createAdminTheme(reducedMotion, mode), [reducedMotion, mode]);

  return (
    <ThemeModeContext.Provider value={themeMode}>
      <ConfigProvider theme={antTheme} locale={enAU}>
        <AntdApp>
          <ErrorBoundary>
            <RefineRoot authProvider={authProvider}>
              <CapabilityProvider>{children}</CapabilityProvider>
            </RefineRoot>
          </ErrorBoundary>
        </AntdApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
