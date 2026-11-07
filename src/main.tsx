import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/literata';
import '@fontsource-variable/literata/wght-italic.css';
import { App } from './app/App';
import { initialTheme } from './app/look';
import './app/styles.css';
import './app/theme.css';
import './app/ui.css';

// The saved theme before the first paint, so the window never flashes another.
document.documentElement.dataset.theme = initialTheme();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
