import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const fieldClass = 'min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

/** Native select: fully keyboard/screen-reader accessible without client JavaScript. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(fieldClass, 'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27 fill=%27%234b5a73%27%3E%3Cpath d=%27M5.5 7.5l4.5 4.5 4.5-4.5%27 stroke=%27%234b5a73%27 stroke-width=%271.5%27 fill=%27none%27/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-1 block text-sm font-medium text-text', className)} {...props} />;
}
