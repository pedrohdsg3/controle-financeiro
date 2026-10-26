import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorGuard } from './ui/Guards';
import './styles.css';

registerSW({ immediate: true });

// Pede ao navegador para não apagar os dados locais quando faltar espaço.
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorGuard>
      <App />
    </ErrorGuard>
  </StrictMode>,
);
