'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Renders its children except on the given address prefixes (e.g. private previews, which carry a token). */
export function HideOnPaths({ prefixes, children }: { prefixes: string[]; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  return prefixes.some((prefix) => pathname.startsWith(prefix)) ? null : <>{children}</>;
}
