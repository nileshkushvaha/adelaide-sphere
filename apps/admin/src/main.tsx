import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Official Ant Design v5 compatibility patch for React 19 (https://u.ant.design/v5-for-19).
import '@ant-design/v5-patch-for-react-19';
import '@refinedev/antd/dist/reset.css';
import './styles/global.css';
import { App } from './app/App';
import { applyThemeVariables } from './config/theme';
import { readStoredThemeMode } from './theme/theme-mode';

// The colours every stylesheet rule and inline style refers to exist before the
// first render, so a dark-theme reader never sees a light first frame.
applyThemeVariables(readStoredThemeMode());

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The document's boot loader has done its job once React owns the page.
document.getElementById('app-boot')?.remove();
