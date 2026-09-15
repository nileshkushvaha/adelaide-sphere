import { useMemo } from 'react';
import { Typography } from 'antd';
import { diffWords } from 'diff';

/**
 * Word-by-word comparison: removed words struck through, added words
 * highlighted, and both labelled for screen readers, so colour is never the only
 * signal. Used by the version history of articles and pages.
 */
export function TextComparison({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const changed = parts.some((part) => part.added || part.removed);
  if (!changed) return <Typography.Text type="secondary">No differences.</Typography.Text>;
  return (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
      {parts.map((part, index) =>
        part.added ? (
          <ins key={index} className="ms-diff-added">
            <span className="sr-only">[added] </span>
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={index} className="ms-diff-removed">
            <span className="sr-only">[removed] </span>
            {part.value}
          </del>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </div>
  );
}
