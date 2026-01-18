import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';

interface User {
  id: string;
  email: string;
  apiKey: string;
  isAdmin?: boolean;
  traktConnected: boolean;
  mdblistConnected: boolean;
  tmdbConnected: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setupRequired: boolean;
  authDisabled: boolean;
  login: (email: string, password: string) => Promise<any>;
  setup: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string) => Promise<any>;
  logout: () => void;
  refreshUser: () => Promise<User>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

// Default user when auth is disabled (e.g., when using Authelia)
const AUTH_DISABLED_USER: User = {
  id: 'auth-disabled-user',
  email: 'admin@localhost',
  apiKey: '',
  isAdmin: true,
  traktConnected: false,
  mdblistConnected: false,
  tmdbConnected: false,
  createdAt: new Date().toISOString(),
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [authDisabled, setAuthDisabled] = useState(false);

  useEffect(() => {
    // Check setup status first
    api.getSetupStatus()
      .then((status: any) => {
        setSetupRequired(status.setupRequired);
        setAuthDisabled(status.authDisabled || false);

        // If auth is disabled, set the default user and skip login
        if (status.authDisabled) {
          // Fetch actual user data from /me endpoint (works without token when auth disabled)
          return api.getMe()
            .then((userData: any) => setUser(userData))
            .catch(() => {
              // Fallback to default user if /me fails
              setUser(AUTH_DISABLED_USER);
            });
        }

        // Only try to load user if setup is complete
        if (!status.setupRequired) {
          const token = localStorage.getItem('token');
          if (token) {
            return api.getMe()
              .then((user: any) => setUser(user))
              .catch(() => {
                localStorage.removeItem('token');
              });
          }
        }
      })
      .catch(() => {
        // If we can't check setup status, assume setup is not required
        const token = localStorage.getItem('token');
        if (token) {
          api.getMe()
            .then((user: any) => setUser(user))
            .catch(() => {
              localStorage.removeItem('token');
            });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data;
  };

  const setup = async (email: string, password: string) => {
    const data = await api.setupAdmin(email, password);
    setUser(data.user);
    setSetupRequired(false);
    return data;
  };

  const register = async (email: string, password: string) => {
    const data = await api.register(email, password);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    const userData = await api.getMe();
    setUser(userData);
    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, loading, setupRequired, authDisabled, login, setup, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;