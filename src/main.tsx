import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import LazyBookRoot from './book/LazyBookRoot.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/book/*" element={<LazyBookRoot />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </StrictMode>,
);
