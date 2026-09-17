'use client';

import { useEffect, useRef } from 'react';
import { pushEscapeLayer } from '@/lib/client/shortcuts';

/**
 * While `active`, this overlay is on the Escape stack: the global handler
 * (useShortcuts) closes exactly one layer per key press, topmost first.
 */
export function useEscapeLayer(active: boolean, close: () => void, priority: number): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer(priority, () => closeRef.current());
  }, [active, priority]);
}
