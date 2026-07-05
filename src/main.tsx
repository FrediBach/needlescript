import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './monaco-setup.ts'; // must precede any Monaco component import
import './index.css';
import App from './App.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import BookRoot from './book/BookRoot.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/book/*" element={<BookRoot />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </StrictMode>,
);
