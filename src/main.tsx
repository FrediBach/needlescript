import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './monaco-setup.ts'; // must precede any Monaco component import
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
