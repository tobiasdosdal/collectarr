import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';

interface User {
  id: string;
  email: string;
  apiKey: string;
  isAdmin?: boolean;
  traktConnected: boolean;
  mdblistConnected: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setupRequired: boolean;
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    // Check setup status first
    api.getSetupStatus()
      .then((status: any) => {
        setSetupRequired(status.setupRequired);
        
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
    <AuthContext.Provider value={{ user, loading, setupRequired, login, setup, register, logout, refreshUser }}>
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