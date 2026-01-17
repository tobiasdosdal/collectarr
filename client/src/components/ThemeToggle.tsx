import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ThemeToggle({ className, showLabel = false, size = 'md' }: ThemeToggleProps) {
  const { themeMode, setThemeMode } = useTheme();

  const modes: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: 'light', icon: Sun, label: 'Light' },
    { mode: 'dark', icon: Moon, label: 'Dark' },
    { mode: 'system', icon: Monitor, label: 'System' },
  ];

  const sizeClasses = {
    sm: 'p-1.5 gap-0.5',
    md: 'p-1 gap-1',
    lg: 'p-1.5 gap-1.5',
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  return (
    <div
      className={cn(
        'flex items-center bg-secondary/50 rounded-lg',
        sizeClasses[size],
        className
      )}
    >
      {modes.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => setThemeMode(mode)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-all',
            themeMode === mode
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          title={label}
          aria-label={`Switch to ${label} mode`}
        >
          <Icon size={iconSizes[size]} />
          {showLabel && <span className="hidden sm:inline">{label}</span>}
        </button>
      ))}
    </div>
  );
}

// Simple icon button for quick toggling
interface QuickThemeToggleProps {
  className?: string;
}

export function QuickThemeToggle({ className }: QuickThemeToggleProps) {
  const { resolvedTheme, themeMode, setThemeMode } = useTheme();

  const handleClick = () => {
    // Cycle through: current -> opposite -> system
    if (themeMode === 'system') {
      setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
    } else if (themeMode === 'dark') {
      setThemeMode('light');
    } else {
      setThemeMode('dark');
    }
  };

  const Icon = resolvedTheme === 'dark' ? Moon : Sun;
  const label = resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
        className
      )}
      title={`Current: ${label}. Click to toggle.`}
      aria-label={`Toggle theme (currently ${label})`}
    >
      <Icon size={18} />
    </button>
  );
}

export default ThemeToggle;
