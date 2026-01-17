import { Sun, Moon, Monitor, Check, Palette } from 'lucide-react';
import { useTheme, ThemeMode, ACCENT_COLORS } from '../../contexts/ThemeContext';
import { cn } from '@/lib/utils';

export default function SettingsAppearance() {
  const { themeMode, setThemeMode, accentColor, setAccentColor, resolvedTheme } = useTheme();

  const themeModes: { mode: ThemeMode; icon: typeof Sun; label: string; description: string }[] = [
    {
      mode: 'light',
      icon: Sun,
      label: 'Light',
      description: 'A bright theme for well-lit environments'
    },
    {
      mode: 'dark',
      icon: Moon,
      label: 'Dark',
      description: 'Easy on the eyes, perfect for low-light settings'
    },
    {
      mode: 'system',
      icon: Monitor,
      label: 'System',
      description: 'Automatically match your system preferences'
    },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Theme Mode Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Sun size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Theme Mode</h2>
              <p className="text-sm text-muted-foreground m-0">Currently: {resolvedTheme === 'dark' ? 'Dark' : 'Light'}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how Collectarr looks to you. Select a theme or let it follow your system settings.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeModes.map(({ mode, icon: Icon, label, description }) => (
            <button
              key={mode}
              onClick={() => setThemeMode(mode)}
              className={cn(
                'relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 transition-all text-left',
                themeMode === mode
                  ? 'border-primary bg-primary/5'
                  : 'border-border/50 hover:border-primary/30 hover:bg-secondary/30'
              )}
            >
              {themeMode === mode && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check size={12} className="text-primary-foreground" />
                </div>
              )}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  themeMode === mode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                )}
              >
                <Icon size={20} />
              </div>
              <div>
                <h4 className="font-medium">{label}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
              <Palette size={18} className="text-pink-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Accent Color</h2>
              <p className="text-sm text-muted-foreground m-0">Current: {accentColor.name}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Personalize your experience with your favorite accent color.
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.name}
              onClick={() => setAccentColor(color)}
              className={cn(
                'relative group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                accentColor.name === color.name
                  ? 'border-foreground/50 bg-secondary/50'
                  : 'border-transparent hover:border-border/50 hover:bg-secondary/30'
              )}
              title={color.name}
            >
              <div
                className={cn(
                  'w-8 h-8 sm:w-10 sm:h-10 rounded-full transition-transform group-hover:scale-110',
                  accentColor.name === color.name && 'ring-2 ring-offset-2 ring-offset-background ring-foreground/30'
                )}
                style={{ backgroundColor: `hsl(${color.value})` }}
              >
                {accentColor.name === color.name && (
                  <div className="w-full h-full flex items-center justify-center">
                    <Check size={16} style={{ color: `hsl(${color.foreground})` }} />
                  </div>
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate w-full text-center">
                {color.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Monitor size={18} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0">Preview</h2>
            <p className="text-sm text-muted-foreground m-0">See your theme choices in action</p>
          </div>
        </div>
        <div className="space-y-6">
          {/* Buttons Preview */}
          <div>
            <h4 className="text-sm font-medium mb-3">Buttons</h4>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary">Primary</button>
              <button className="btn btn-secondary">Secondary</button>
              <button className="btn btn-ghost">Ghost</button>
              <button className="btn btn-danger">Danger</button>
            </div>
          </div>

          {/* Badges Preview */}
          <div>
            <h4 className="text-sm font-medium mb-3">Badges</h4>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-success">Success</span>
              <span className="badge badge-info">Info</span>
              <span className="badge badge-warning">Warning</span>
              <span className="badge badge-error">Error</span>
            </div>
          </div>

          {/* Form Elements Preview */}
          <div>
            <h4 className="text-sm font-medium mb-3">Form Elements</h4>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Text input..."
                className="px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm max-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex items-center gap-2">
                <div className={cn('toggle', 'active')} />
                <span className="text-sm">Toggle</span>
              </div>
            </div>
          </div>

          {/* Progress Bar Preview */}
          <div>
            <h4 className="text-sm font-medium mb-3">Progress</h4>
            <div className="progress-bar max-w-xs">
              <div className="progress-bar-fill" style={{ width: '65%' }} />
            </div>
          </div>

          {/* Cards Preview */}
          <div>
            <h4 className="text-sm font-medium mb-3">Cards</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <div className="p-4 bg-secondary/30 border border-border/50 rounded-xl">
                <div className="text-sm font-medium">Card Title</div>
                <div className="text-xs text-muted-foreground mt-1">Card description text</div>
              </div>
              <div className="p-4 bg-secondary/30 border border-primary/30 rounded-xl">
                <div className="text-sm font-medium text-primary">Highlighted Card</div>
                <div className="text-xs text-muted-foreground mt-1">With accent border</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
