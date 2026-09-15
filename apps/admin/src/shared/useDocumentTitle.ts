import { useEffect } from 'react';
import { APP_NAME } from '@/config/app-config';

/** Sets the document title as "<page> · Adelaide Sphere Admin". */
export function useDocumentTitle(pageTitle: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = previous;
    };
  }, [pageTitle]);
}
