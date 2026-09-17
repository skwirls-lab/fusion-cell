'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/lib/client/chips';

/**
 * deck.gl reads `window` at import time, so the real map is client-only. The
 * wrapper keeps the same container id/classes during the load so the pane
 * never flashes a different shape.
 */
const DeckMap = dynamic(() => import('./DeckMap'), {
  ssr: false,
  loading: () => (
    <div id="map-canvas-wrap" tabIndex={-1} className="starfield-bg relative h-full w-full outline-none" data-marker-count="0" data-highlighted-count="0">
      <Skeleton rows={3} className="w-48" testId="map-loading" />
    </div>
  ),
});

export function MapView() {
  return <DeckMap />;
}

export default MapView;
