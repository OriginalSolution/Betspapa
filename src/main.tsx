import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { installCheerUnlock } from './lib/cheer';
import { registerServiceWorker } from './lib/notify';
import { StoreProvider } from './state/store';
import './styles.css';

registerServiceWorker();
installCheerUnlock();

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
