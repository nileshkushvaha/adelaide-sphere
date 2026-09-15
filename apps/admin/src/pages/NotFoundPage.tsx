import { Button, Result } from 'antd';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <Result
      status="404"
      title={<h1 style={{ fontSize: 24, margin: 0 }}>Page not found</h1>}
      subTitle="There is no admin page at this address."
      extra={
        <Link to="/">
          <Button type="primary">Back to dashboard</Button>
        </Link>
      }
    />
  );
}
