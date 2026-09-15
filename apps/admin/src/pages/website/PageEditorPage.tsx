import { Alert, Button } from 'antd';
import { Link, useParams } from 'react-router';
import { pagesApi } from '@/api/settings';
import { PageHeader, PageLoader, StatusTag } from '@/components/ui';
import { useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { PageEditor } from './editor/PageEditor';

/**
 * One information page on its own route (SRS CFG 002, change log 1.17). Editing
 * lives on a page rather than in a dialog so it can be linked to, reloaded and
 * read at the width long-form copy actually needs.
 */
export function PageEditorPage() {
  const { slug = '' } = useParams();
  const [state, reload] = useAsync((signal) => pagesApi().get(slug, signal), [slug]);
  useDocumentTitle(state.status === 'ready' ? state.data.title : 'Page');

  if (state.status === 'loading') return <PageLoader label="Loading this page…" />;
  if (state.status === 'error') {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Website' }, { label: 'Pages', href: '/website/pages' }]} title="Page" />
        <Alert type="error" showIcon message={state.message} description={state.reference} action={<Button onClick={reload}>Retry</Button>} />
      </div>
    );
  }

  const page = state.data;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'Pages', href: '/website/pages' }, { label: page.title }]}
        title={page.title}
        description={`Public address: /${page.slug}`}
        meta={<StatusTag status={page.status} />}
        actions={
          <Link to="/website/pages">
            <Button>All pages</Button>
          </Link>
        }
      />
      {/* A new version (after a save or a status change) starts a fresh editor from it. */}
      <PageEditor key={`${page.slug}:${page.version}`} page={page} onReload={reload} />
    </div>
  );
}
