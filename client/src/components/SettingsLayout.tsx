import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Settings as SettingsIcon,
  Key,
  Server,
  DownloadCloud,
  Users as UsersIcon,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsNavItem {
  path: string;
  icon: typeof SettingsIcon;
  label: string;
  adminOnly?: boolean;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    path: '/settings/general',
    icon: Key,
    label: 'General',
  },
  {
    path: '/settings/emby',
    icon: Server,
    label: 'Emby',
  },
  {
    path: '/settings/downloaders',
    icon: DownloadCloud,
    label: 'Downloaders',
  },
  {
    path: '/settings/users',
    icon: UsersIcon,
    label: 'Users',
    adminOnly: true,
  },
];

export function SettingsLayout() {
  const { user } = useAuth();
  const location = useLocation();

  if (location.pathname === '/settings') {
    return <Navigate to="/settings/general" replace />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure your integrations and sync options
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="w-56 flex-shrink-0 hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            {settingsNavItems.map(({ path, icon: Icon, label, adminOnly }) => {
              if (adminOnly && !user?.isAdmin) {
                return null;
              }

              const isActive = location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0)] ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon size={16} strokeWidth={isActive ? 2 : 1.5} className={cn(isActive && 'text-primary')} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} className="text-primary" />}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default SettingsLayout;
