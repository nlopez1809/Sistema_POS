import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initMonitoring } from './lib/monitoring';

// Inicializar Sentry si VITE_SENTRY_DSN está configurado
initMonitoring().catch(console.error);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
