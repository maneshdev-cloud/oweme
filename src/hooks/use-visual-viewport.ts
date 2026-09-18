'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks the visual viewport on mobile devices when virtual keyboards open/close.
 * Returns the keyboard inset (in pixels) and the remaining visible height.
 */
export function useVisualViewport() {
  const [state, setState] = useState<{
    keyboardInset: number;
    visibleHeight: number;
    isKeyboardOpen: boolean;
  }>({
    keyboardInset: 0,
    visibleHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
    isKeyboardOpen: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleViewport() {
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      // On mobile, the keyboard reduces vv.height or adds an offset
      const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const isOpen = inset > 80;

      setState({
        keyboardInset: isOpen ? inset : 0,
        visibleHeight: vv.height,
        isKeyboardOpen: isOpen,
      });
    }

    handleViewport();
    window.visualViewport?.addEventListener('resize', handleViewport);
    window.visualViewport?.addEventListener('scroll', handleViewport);
    window.addEventListener('resize', handleViewport);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewport);
      window.visualViewport?.removeEventListener('scroll', handleViewport);
      window.removeEventListener('resize', handleViewport);
    };
  }, []);

  return state;
}
