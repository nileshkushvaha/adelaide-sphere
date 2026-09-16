import { useEffect, useState, type ReactNode } from 'react';
import { httpClient } from '@/api/http-client';

import { BrandingContext, type BrandingSettings as Settings } from './branding-context';

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      void httpClient.request<{ data: Settings }>('/site/settings', { signal: controller.signal })
        .then((response) => { if (!controller.signal.aborted) setSettings(response.data.data); })
        .catch(() => { /* Bundled branding remains available when the API is offline. */ });
    };
    refresh();
    window.addEventListener('as-branding-updated', refresh);
    return () => { controller.abort(); window.removeEventListener('as-branding-updated', refresh); };
  }, []);
  useEffect(() => {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.append(icon); }
    icon.href = settings?.branding.favicon?.url ?? `${import.meta.env.BASE_URL}brand-favicon.png`;
  }, [settings]);
  return <BrandingContext.Provider value={settings}>{children}</BrandingContext.Provider>;
}
