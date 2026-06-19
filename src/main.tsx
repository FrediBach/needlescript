import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './monaco-setup.ts'; // must precede any Monaco component import
import './index.css';
import App from './App.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
