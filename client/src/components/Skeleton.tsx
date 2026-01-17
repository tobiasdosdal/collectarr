import { FC } from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export const Skeleton: FC<SkeletonProps> = ({ className = '', width, height }) => {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`skeleton ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
};

export const SkeletonCard: FC = () => {
  return (
    <div className="collection-card skeleton-card">
      <div className="collection-poster">
        <Skeleton className="w-full h-full" />
      </div>
      <div className="collection-info">
        <Skeleton height={20} width="70%" className="mb-2" />
        <Skeleton height={14} width="40%" />
      </div>
    </div>
  );
};

export const SkeletonCollectionGrid: FC<{ count?: number }> = ({ count = 8 }) => {
  return (
    <div className="collections-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};

export const SkeletonText: FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = ''
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
};

export default Skeleton;
