import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/collections', icon: FolderOpen, label: 'Collections' },
  { path: '/browse', icon: Search, label: 'Browse' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Main navigation">
      {navItems.map(({ path, icon: Icon, label }) => {
        const isActive = location.pathname === path ||
          (path !== '/' && location.pathname.startsWith(path));

        return (
          <Link
            key={path}
            to={path}
            className={cn(
              "mobile-bottom-nav-item",
              isActive && "active"
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              size={22}
              strokeWidth={isActive ? 2 : 1.5}
              className="mobile-bottom-nav-icon"
            />
            <span className="mobile-bottom-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileBottomNav;
