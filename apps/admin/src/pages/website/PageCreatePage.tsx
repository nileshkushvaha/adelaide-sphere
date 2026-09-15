import { Button } from 'antd';
import { Link } from 'react-router';
import { PageHeader } from '@/components/ui';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { PageEditor } from './editor/PageEditor';

/**
 * A new page (SRS CFG 002 as amended in 1.7 and change log 1.17). The editor
 * starts from a template, suggests the address from the title, and creates the
 * page as a draft; the server validates the address and refuses reserved or
 * taken ones on the address field.
 */
export function PageCreatePage() {
  useDocumentTitle('New page');
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'Pages', href: '/website/pages' }, { label: 'New page' }]}
        title="New page"
        description="Choose a starting point, give it a title, then fill in the sections. It stays a draft until you publish it."
        actions={
          <Link to="/website/pages">
            <Button>All pages</Button>
          </Link>
        }
      />
      <PageEditor page={null} />
    </div>
  );
}
