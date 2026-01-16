import { FC, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';

const Register: FC = () => {
  const { setupRequired, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If setup is required, redirect to login (which will show setup)
    if (!authLoading && setupRequired) {
      navigate('/login');
    }
  }, [setupRequired, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (setupRequired) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/20 mx-auto mb-6">
            <Film className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Collectarr</h1>
          <p className="text-muted-foreground tracking-wide uppercase text-sm font-medium">Your Personal Media Universe</p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl">Registration Disabled</CardTitle>
            <CardDescription>
              Public registration is not available
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-secondary/50 rounded-lg p-4 text-center text-sm border border-border/50">
              <p className="text-muted-foreground mb-2">
                This is a self-hosted instance. To create an account, please contact an administrator.
              </p>
              <p className="text-muted-foreground/70">
                Administrators can create new user accounts from the Settings page.
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-center border-t border-border/40 pt-6">
            <div className="text-sm text-muted-foreground">
              <span>Already have an account? </span>
              <Button asChild variant="link" className="p-0 h-auto font-normal text-primary">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Register;