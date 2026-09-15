import { Suspense, lazy } from 'react';
import { Skeleton } from 'antd';

/**
 * The editor pulls in ProseMirror, which is large and only needed on the two
 * screens that write rich content. Loading it on demand keeps the rest of the
 * admin bundle small (SRS NFR 005).
 */
const RichTextEditor = lazy(() => import('./RichTextEditor').then((module) => ({ default: module.RichTextEditor })));

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  minHeight?: number;
  /** Change to replace the editor's content with `value` (e.g. after discarding changes). */
  resetKey?: number;
}

export function RichTextEditorLazy(props: Props) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 16 }}>
          <p role="status">Loading the editor…</p>
          {/* Decorative placeholder: the status message above is what assistive technology announces. */}
          <div aria-hidden="true">
            <Skeleton active title={false} paragraph={{ rows: 6 }} />
          </div>
        </div>
      }
    >
      <RichTextEditor {...props} />
    </Suspense>
  );
}
