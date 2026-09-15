import type { OutlineHeading } from '@/lib/headings';

/** Fewer sections than this and a contents list only repeats what is already on screen. */
export const TOC_MIN_HEADINGS = 3;

interface Section {
  heading: OutlineHeading;
  children: OutlineHeading[];
}

/** Subsections sit under the section before them; one before any section stands on its own. */
function group(headings: OutlineHeading[]): Section[] {
  const sections: Section[] = [];
  for (const heading of headings) {
    const parent = sections.at(-1);
    if (heading.level === 3 && parent) parent.children.push(heading);
    else sections.push({ heading, children: [] });
  }
  return sections;
}

function Links({ headings }: { headings: OutlineHeading[] }) {
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {group(headings).map(({ heading, children }) => (
        <li key={heading.id}>
          <a href={`#${heading.id}`} className="ms-toc-link">
            {heading.text}
          </a>
          {children.length > 0 && (
            <ol className="mt-1 flex flex-col gap-1 border-l border-border pl-3">
              {children.map((child) => (
                <li key={child.id}>
                  <a href={`#${child.id}`} className="ms-toc-link text-text-muted">
                    {child.text}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * An article's table of contents (SRS 1.10 BLOG 004): plain links to its
 * sections, so it works without JavaScript. Beside the article from `lg`, where
 * the sidebar keeps it in view; above the text on smaller screens, folded so it
 * does not push the article down. Only one of the two is ever displayed.
 */
export function ArticleToc({ headings, variant }: { headings: OutlineHeading[]; variant: 'sidebar' | 'inline' }) {
  if (headings.length < TOC_MIN_HEADINGS) return null;
  if (variant === 'inline') {
    return (
      <details data-track="toc_click" className="ms-toc rounded-card border border-border bg-surface-raised shadow-sm lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-semibold">In this article</summary>
        <nav aria-label="In this article" className="border-t border-border px-5 py-4">
          <Links headings={headings} />
        </nav>
      </details>
    );
  }
  return (
    <nav aria-labelledby="article-toc-heading" data-track="toc_click" className="ms-toc hidden rounded-card border border-border bg-surface-raised p-5 shadow-sm lg:block">
      <h2 id="article-toc-heading" className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sky-700">
        In this article
      </h2>
      <div className="mt-3 max-h-[45vh] overflow-y-auto pr-1">
        <Links headings={headings} />
      </div>
    </nav>
  );
}
