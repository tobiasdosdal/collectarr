import { FC, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

const Login: FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const { login, setup, setupRequired, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (setupRequired) {
        // Create first admin account
        await setup(email, password);
        navigate('/');
      } else {
        // Normal login
        await login(email, password);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || (setupRequired ? 'Failed to create admin account' : 'Failed to login'));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="auth-container">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Animated background elements */}
      <div className="login-bg-effects">
        <div className="spotlight spotlight-1" />
        <div className="spotlight spotlight-2" />
        <div className="film-grain" />
        <div className="vignette" />
      </div>

      {/* Film strip decoration */}
      <div className="film-strip film-strip-left">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="film-frame" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="film-strip film-strip-right">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="film-frame" style={{ animationDelay: `${i * 0.1 + 0.5}s` }} />
        ))}
      </div>

      <div className="login-content">
        {/* Hero branding */}
        <div className="login-hero">
          <div className="logo-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
              <circle cx="24" cy="24" r="8" fill="currentColor" />
              <path d="M24 4V12M24 36V44M4 24H12M36 24H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
          </div>
          <h1 className="brand-name">Collectarr</h1>
          <p className="brand-tagline">Your personal media universe</p>
        </div>

        {/* Login form card */}
        <div className="login-card">
          <div className="login-card-inner">
            <div className="login-header">
              {setupRequired ? (
                <>
                  <h2>Welcome to Collectarr</h2>
                  <p>Create your admin account to get started</p>
                </>
              ) : (
                <>
                  <h2>Welcome back</h2>
                  <p>Sign in to continue to your collections</p>
                </>
              )}
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              {error && (
                <div className="login-error">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 4.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <div className="login-field">
                <label htmlFor="email">Email</label>
                <div className="input-wrapper">
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>{setupRequired ? 'Creating admin account...' : 'Signing in...'}</span>
                  </>
                ) : (
                  <span>{setupRequired ? 'Create Admin Account' : 'Sign In'}</span>
                )}
              </button>
            </form>

            {!setupRequired && (
              <div className="login-footer">
                <span>Don't have an account?</span>
                <span className="text-muted-foreground text-sm">Contact an administrator</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom accent */}
        <div className="login-accent-line" />
      </div>
    </div>
  );
};

export default Login;
