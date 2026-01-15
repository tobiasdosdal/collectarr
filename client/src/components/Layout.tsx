import { Link, useLocation, useNavigate, ReactNode } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  LogOut,
  Film,
  User,
  LucideIcon,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems: NavItem[] = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/collections', icon: FolderOpen, label: 'Collections' },
    { path: '/browse', icon: Search, label: 'Browse Sources' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Film size={22} className="text-primary-foreground" />
          </div>
          <div>
            <span className="sidebar-title">Collectarr</span>
            <p className="text-xs text-muted-foreground mt-0.5">Collection Manager</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="text-xs uppercase tracking-wider text-muted-foreground/50 px-4 mb-2 font-semibold">
            Main Menu
          </div>
          {navItems.map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              className={`nav-item ${location.pathname === path ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.5} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User size={14} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="user-email block">{user?.email}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} strokeWidth={1.5} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

export default Layout;
