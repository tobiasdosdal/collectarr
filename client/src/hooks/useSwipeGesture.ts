import { useRef, useCallback, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipe?: (direction: SwipeDirection) => void;
  threshold?: number; // minimum distance for a swipe (default: 50px)
  velocityThreshold?: number; // minimum velocity for a swipe (default: 0.3 px/ms)
  preventDefault?: boolean;
}

export interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  isSwiping: boolean;
}

export function useSwipeGesture<T extends HTMLElement = HTMLElement>(
  options: SwipeGestureOptions = {}
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipe,
    threshold = 50,
    velocityThreshold = 0.3,
    preventDefault = false,
  } = options;

  const elementRef = useRef<T | null>(null);
  const swipeState = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    currentX: 0,
    currentY: 0,
    isSwiping: false,
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    swipeState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      currentY: touch.clientY,
      isSwiping: true,
    };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!swipeState.current.isSwiping) return;

    const touch = e.touches[0];
    swipeState.current.currentX = touch.clientX;
    swipeState.current.currentY = touch.clientY;

    if (preventDefault) {
      e.preventDefault();
    }
  }, [preventDefault]);

  const handleTouchEnd = useCallback(() => {
    if (!swipeState.current.isSwiping) return;

    const { startX, startY, startTime, currentX, currentY } = swipeState.current;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const deltaTime = Date.now() - startTime;

    // Calculate velocity
    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;

    // Determine if it's a valid swipe
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Determine swipe direction (horizontal vs vertical)
    const isHorizontal = absX > absY;

    if (isHorizontal && absX >= threshold && velocityX >= velocityThreshold) {
      const direction: SwipeDirection = deltaX > 0 ? 'right' : 'left';
      if (direction === 'left' && onSwipeLeft) {
        onSwipeLeft();
      } else if (direction === 'right' && onSwipeRight) {
        onSwipeRight();
      }
      onSwipe?.(direction);
    } else if (!isHorizontal && absY >= threshold && velocityY >= velocityThreshold) {
      const direction: SwipeDirection = deltaY > 0 ? 'down' : 'up';
      if (direction === 'up' && onSwipeUp) {
        onSwipeUp();
      } else if (direction === 'down' && onSwipeDown) {
        onSwipeDown();
      }
      onSwipe?.(direction);
    }

    // Reset state
    swipeState.current.isSwiping = false;
  }, [threshold, velocityThreshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onSwipe]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, preventDefault]);

  return elementRef;
}

export default useSwipeGesture;
