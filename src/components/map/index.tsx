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
    <div id="map-canvas-wrap" className="starfield-bg relative h-full w-full" data-marker-count="0" data-highlighted-count="0">
      <Skeleton rows={3} className="w-48" />
    </div>
  ),
});

export function MapView() {
  return <DeckMap />;
}

export default MapView;
