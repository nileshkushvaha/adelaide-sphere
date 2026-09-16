import Link from 'next/link';
import { Chip } from '@adelaide-sphere/ui';
import type { Chip as ChipData } from '@/lib/search-params';

export function FilterChips({ chips, resetHref }: { chips: ChipData[]; resetHref: string }) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Chip asChild>
            <Link href={chip.href} aria-label={`Remove filter ${chip.label}`}>
              {chip.label} <span aria-hidden="true">×</span>
            </Link>
          </Chip>
        </li>
      ))}
      <li>
        <Link href={resetHref} className="text-sm text-link underline-offset-2 as-text-link">
          Clear all
        </Link>
      </li>
    </ul>
  );
}
