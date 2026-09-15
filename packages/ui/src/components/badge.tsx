import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-sky-100 text-text',
      navy: 'border-transparent bg-navy-800 text-text-inverse',
      outline: 'border-border text-text',
      success: 'border-transparent bg-emerald-100 text-emerald-950',
      muted: 'border-transparent bg-surface-muted text-text-muted',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
