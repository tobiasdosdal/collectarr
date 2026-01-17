import { useRef, useCallback, useEffect, useState } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // minimum pull distance to trigger refresh (default: 80px)
  maxPull?: number; // maximum pull distance (default: 150px)
  disabled?: boolean;
}

export interface PullToRefreshState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  pullProgress: number; // 0-1 representing progress to threshold
}

export function usePullToRefresh<T extends HTMLElement = HTMLElement>(
  options: PullToRefreshOptions
) {
  const {
    onRefresh,
    threshold = 80,
    maxPull = 150,
    disabled = false,
  } = options;

  const elementRef = useRef<T | null>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    pullProgress: 0,
  });

  const canPull = useCallback(() => {
    if (disabled) return false;
    // Only allow pull when scrolled to top
    const element = elementRef.current;
    if (!element) return false;

    // Check if we're at the top of the scroll container
    const scrollTop = element.scrollTop || window.scrollY || document.documentElement.scrollTop;
    return scrollTop <= 0;
  }, [disabled]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!canPull()) return;

    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, [canPull]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (state.isRefreshing || disabled) return;

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    // Only activate if pulling down and at top of scroll
    if (delta > 0 && canPull()) {
      const pullDistance = Math.min(delta * 0.5, maxPull); // Apply resistance
      const pullProgress = Math.min(pullDistance / threshold, 1);

      setState(prev => ({
        ...prev,
        isPulling: true,
        pullDistance,
        pullProgress,
      }));

      // Prevent scroll while pulling
      if (pullDistance > 10) {
        e.preventDefault();
      }
    }
  }, [state.isRefreshing, disabled, canPull, maxPull, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!state.isPulling || state.isRefreshing) return;

    if (state.pullProgress >= 1) {
      // Trigger refresh
      setState(prev => ({
        ...prev,
        isRefreshing: true,
        isPulling: false,
        pullDistance: threshold,
        pullProgress: 1,
      }));

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
          pullProgress: 0,
        });
      }
    } else {
      // Reset without refreshing
      setState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
        pullProgress: 0,
      });
    }
  }, [state.isPulling, state.isRefreshing, state.pullProgress, threshold, onRefresh]);

  useEffect(() => {
    const element = elementRef.current || document.body;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    ref: elementRef,
    ...state,
  };
}

export default usePullToRefresh;
