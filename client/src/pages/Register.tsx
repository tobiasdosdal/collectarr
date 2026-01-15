import { FC, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Register: FC = () => {
  const { setupRequired, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If setup is required, redirect to login (which will show setup)
    // If setup is not required, show message that registration is disabled
    if (!authLoading && setupRequired) {
      navigate('/login');
    }
  }, [setupRequired, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="auth-container">
        <div className="spinner" />
      </div>
    );
  }

  if (setupRequired) {
    // Redirecting to login for setup
    return null;
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

        {/* Register form card */}
        <div className="login-card">
          <div className="login-card-inner">
            <div className="login-header">
              <h2>Registration Disabled</h2>
              <p>Public registration is not available</p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-6 text-center">
              <p className="text-muted-foreground mb-4">
                This is a self-hosted instance. To create an account, please contact an administrator.
              </p>
              <p className="text-sm text-muted-foreground/70">
                Administrators can create new user accounts from the Settings page.
              </p>
            </div>

            <div className="login-footer">
              <span>Already have an account?</span>
              <Link to="/login">Sign in</Link>
            </div>
          </div>
        </div>

        {/* Bottom accent */}
        <div className="login-accent-line" />
      </div>
    </div>
  );
};

export default Register;
