import { useState, useRef, useCallback, ReactNode } from 'react';
import { Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftActionLabel?: string;
  rightActionLabel?: string;
  leftActionIcon?: ReactNode;
  rightActionIcon?: ReactNode;
  threshold?: number;
  className?: string;
  disabled?: boolean;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftActionLabel = 'Delete',
  rightActionLabel = 'Confirm',
  leftActionIcon = <Trash2 size={20} />,
  rightActionIcon = <Check size={20} />,
  threshold = 80,
  className,
  disabled = false,
}: SwipeableCardProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;
    setIsDragging(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || disabled) return;

    currentX.current = e.touches[0].clientX;
    const deltaX = currentX.current - startX.current;

    // Limit swipe distance with resistance
    const maxSwipe = 120;
    let limitedDelta = deltaX;

    if (Math.abs(deltaX) > maxSwipe) {
      const excess = Math.abs(deltaX) - maxSwipe;
      const resistance = 0.3;
      limitedDelta = Math.sign(deltaX) * (maxSwipe + excess * resistance);
    }

    // Only allow swipe in directions where actions are defined
    if (deltaX < 0 && !onSwipeLeft) return;
    if (deltaX > 0 && !onSwipeRight) return;

    setTranslateX(limitedDelta);
  }, [isDragging, disabled, onSwipeLeft, onSwipeRight]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);

    if (Math.abs(translateX) >= threshold) {
      if (translateX < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (translateX > 0 && onSwipeRight) {
        onSwipeRight();
      }
    }

    // Reset position
    setTranslateX(0);
  }, [isDragging, translateX, threshold, onSwipeLeft, onSwipeRight]);

  const leftOpacity = Math.min(1, Math.abs(translateX) / threshold);
  const rightOpacity = Math.min(1, Math.abs(translateX) / threshold);

  return (
    <div
      ref={containerRef}
      className={cn("swipeable-card", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Left action (revealed when swiping right) */}
      {onSwipeRight && (
        <div
          className="swipeable-card-action swipeable-card-action-right"
          style={{ opacity: rightOpacity, width: Math.abs(translateX) }}
        >
          <div className="flex flex-col items-center gap-1">
            {rightActionIcon}
            <span className="text-xs font-medium">{rightActionLabel}</span>
          </div>
        </div>
      )}

      {/* Right action (revealed when swiping left) */}
      {onSwipeLeft && (
        <div
          className="swipeable-card-action swipeable-card-action-left"
          style={{
            opacity: leftOpacity,
            width: Math.abs(translateX),
            left: 'auto',
            right: 0,
          }}
        >
          <div className="flex flex-col items-center gap-1">
            {leftActionIcon}
            <span className="text-xs font-medium">{leftActionLabel}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className="swipeable-card-content"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default SwipeableCard;
