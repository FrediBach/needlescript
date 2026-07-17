/**
 * src/book/BookRoot.tsx
 *
 * Top-level entry for the /book section.
 * Imports book.css, wraps everything in BookLayout, and sets up sub-routes.
 */
import '../monaco-setup.ts';
import { Routes, Route } from 'react-router-dom';
import './book.css';
import { BookErrorBoundary } from './BookErrorBoundary.tsx';
import BookLayout from './layout/BookLayout.tsx';
import BookHome from './BookHome.tsx';
import Chapter from './Chapter.tsx';

export default function BookRoot() {
  return (
    <BookErrorBoundary>
      <BookLayout>
        <Routes>
          <Route index element={<BookHome />} />
          <Route path=":id" element={<Chapter />} />
        </Routes>
      </BookLayout>
    </BookErrorBoundary>
  );
}
