import { lazy, Suspense } from 'react';

const BookRoot = lazy(() => import('./BookRoot.tsx'));

export default function LazyBookRoot() {
  return (
    <Suspense fallback={null}>
      <BookRoot />
    </Suspense>
  );
}
