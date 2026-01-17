import { ReactNode, useRef, useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  threshold?: number;
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  threshold = 80,
  className,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const startY = useRef(0);
  const currentY = useRef(0);

  const canPull = useCallback(() => {
    if (disabled || isRefreshing) return false;
    // Only allow pull when scrolled to top
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    return scrollTop <= 0;
  }, [disabled, isRefreshing]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!canPull()) return;
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, [canPull]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isRefreshing || disabled) return;

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    // Only activate if pulling down and at top of scroll
    if (delta > 0 && canPull()) {
      // Apply resistance
      const resistance = 0.5;
      const pull = Math.min(delta * resistance, 150);

      setIsPulling(true);
      setPullDistance(pull);

      // Prevent scroll while pulling
      if (pull > 10) {
        e.preventDefault();
      }
    }
  }, [isRefreshing, disabled, canPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || isRefreshing) return;

    if (pullDistance >= threshold) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(threshold);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
        setIsPulling(false);
      }
    } else {
      // Reset without refreshing
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isPulling, isRefreshing, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current || document.body;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const pullProgress = Math.min(pullDistance / threshold, 1);
  const shouldShowIndicator = pullDistance > 10 || isRefreshing;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Pull to refresh indicator */}
      <div
        className={cn(
          "pull-to-refresh-indicator",
          shouldShowIndicator ? "pulling" : "hidden"
        )}
        style={{
          transform: `translateY(${pullDistance - 64}px)`,
          opacity: pullProgress,
        }}
      >
        <div
          className={cn(
            "w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center shadow-lg",
          )}
        >
          <RefreshCw
            size={20}
            className={cn(
              "text-primary transition-transform",
              isRefreshing && "animate-spin"
            )}
            style={{
              transform: isRefreshing ? undefined : `rotate(${pullProgress * 360}deg)`,
            }}
          />
        </div>
      </div>

      {/* Content with pull transform */}
      <div
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : 'none',
          transition: isPulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default PullToRefresh;
