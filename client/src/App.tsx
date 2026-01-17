import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { SettingsLayout } from './components/SettingsLayout';
import { OnboardingChecklist, OnboardingFloatingButton } from './components/OnboardingChecklist';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import Browse from './pages/Browse';
import SettingsGeneral from './pages/settings/SettingsGeneral';
import SettingsAccount from './pages/settings/SettingsAccount';
import SettingsEmby from './pages/settings/SettingsEmby';
import SettingsDownloaders from './pages/settings/SettingsDownloaders';
import SettingsUsers from './pages/settings/SettingsUsers';
import SettingsAppearance from './pages/settings/SettingsAppearance';
import './styles/main.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface PrivateRouteProps {
  children: ReactNode;
}

function PrivateRoute({ children }: PrivateRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <Layout>{children}</Layout>;
}

interface PublicRouteProps {
  children: ReactNode;
}

function PublicRoute({ children }: PublicRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-container">
        <div className="spinner" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* Private routes */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/collections"
        element={
          <PrivateRoute>
            <Collections />
          </PrivateRoute>
        }
      />
      <Route
        path="/collections/:id"
        element={
          <PrivateRoute>
            <CollectionDetail />
          </PrivateRoute>
        }
      />
      <Route
        path="/browse"
        element={
          <PrivateRoute>
            <Browse />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings/*"
        element={
          <PrivateRoute>
            <SettingsLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/settings/general" replace />} />
        <Route path="general" element={<SettingsGeneral />} />
        <Route path="account" element={<SettingsAccount />} />
        <Route path="appearance" element={<SettingsAppearance />} />
        <Route path="emby" element={<SettingsEmby />} />
        <Route path="downloaders" element={<SettingsDownloaders />} />
        <Route path="users" element={<SettingsUsers />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <ToastProvider>
              <AuthProvider>
                <OnboardingProvider>
                  <AppRoutes />
                  <OnboardingChecklist />
                  <OnboardingFloatingButton />
                </OnboardingProvider>
              </AuthProvider>
            </ToastProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
