import { FC, useState, FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Mail,
  Lock,
  Shield,
  Calendar,
  X,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
} from 'lucide-react';

interface ChangePasswordModalProps {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ChangePasswordModal: FC<ChangePasswordModalProps> = ({ userId, onClose, onSuccess }) => {
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordRequirements = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'Passwords match', met: newPassword.length > 0 && newPassword === confirmPassword },
  ];

  const allRequirementsMet = passwordRequirements.every(r => r.met);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');

    if (!allRequirementsMet) {
      setError('Please meet all password requirements');
      return;
    }

    setLoading(true);

    try {
      await api.changePassword(userId, currentPassword, newPassword);
      addToast('Password changed successfully', 'success');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyRound size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Change Password</h2>
              <p className="text-sm text-muted-foreground m-0">Update your account password</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
            <X size={18} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 pr-10 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="bg-secondary/30 rounded-lg p-3 mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Password Requirements</p>
            <div className="space-y-1.5">
              {passwordRequirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center transition-colors',
                    req.met ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'
                  )}>
                    {req.met ? <Check size={10} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                  </div>
                  <span className={cn(
                    'transition-colors',
                    req.met ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !currentPassword || !allRequirementsMet}
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SettingsAccount: FC = () => {
  const { user } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Get initials for avatar
  const getInitials = (email: string) => {
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Profile Card */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <User size={18} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0">Profile</h2>
            <p className="text-sm text-muted-foreground m-0">Your account information</p>
          </div>
        </div>

        {/* Profile Display */}
        <div className="flex items-center gap-4 p-4 bg-secondary/30 rounded-xl">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xl font-semibold shadow-lg">
            {user?.email ? getInitials(user.email) : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-lg truncate">{user?.email}</h4>
              {user?.isAdmin && (
                <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-0 text-xs">
                  <Shield size={10} className="mr-1" />
                  Admin
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Mail size={12} />
                {user?.email}
              </span>
              {user?.createdAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  Joined {formatDate(user.createdAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Card */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Lock size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0">Security</h2>
            <p className="text-sm text-muted-foreground m-0">Manage your account security</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={14} className="text-muted-foreground" />
              <span className="font-medium">Password</span>
            </div>
            <p className="text-sm text-muted-foreground m-0">
              Change your account password to keep your account secure
            </p>
          </div>
          <Button size="sm" onClick={() => setShowChangePassword(true)}>
            <Lock size={14} className="mr-1" />
            Change
          </Button>
        </div>
      </div>

      {showChangePassword && user && (
        <ChangePasswordModal
          userId={user.id}
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
};

export default SettingsAccount;
