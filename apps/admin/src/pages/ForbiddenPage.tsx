import { Button, Result } from 'antd';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/**
 * Shown when an administrator navigates to a screen their permissions do not
 * cover (SRS RBAC 010). It states what happened and offers the way back rather
 * than pretending the page does not exist; the API refuses the same request with
 * 403 regardless of what is rendered here.
 */
export function ForbiddenPage({ detail }: { detail?: string }) {
  useDocumentTitle('Not permitted');
  return (
    <main id="main-content" tabIndex={-1} role="alert">
      <Result
        status="403"
        title={<h1 style={{ fontSize: 24, margin: 0 }}>You do not have permission to view this page</h1>}
        subTitle={detail ?? 'Your administrator account does not carry the permission this screen needs. Ask a Super Admin if you need access.'}
        extra={
          <Link to="/">
            <Button type="primary">Back to dashboard</Button>
          </Link>
        }
      />
    </main>
  );
}
