import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Removable filter chip; render as a link (`asChild`) so removal works without JavaScript. */
export function Chip({ className, asChild = false, ...props }: ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'a';
  return <Comp className={cn('inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-surface-muted px-3 text-sm text-text hover:bg-sky-100', className)} {...props} />;
}
