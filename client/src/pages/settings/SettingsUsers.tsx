import { FC, useEffect, useState, FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { ConfirmationModal } from '../../components/ConfirmationModal';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Plus,
  Trash2,
  Shield,
  X,
  RefreshCw,
} from 'lucide-react';

interface AppUser {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddUserModalProps {
  onClose: () => void;
  onAdded: (user: AppUser) => void;
}

const SettingsUsers: FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showAddUser, setShowAddUser] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  useEffect(() => {
    if (user?.isAdmin) {
      loadUsers();
    }
  }, [user?.isAdmin]);

  const loadUsers = async (): Promise<void> => {
    try {
      const userList = await api.getUsers();
      setUsers(userList);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      addToast(`Failed to load users: ${err.message}`, 'error');
    }
  };

  const deleteUser = async (id: string): Promise<void> => {
    try {
      await api.deleteUser(id);
      setUsers(users.filter((u) => u.id !== id));
      addToast('User deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete user: ${err.message}`, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="animate-fade-in">
        <div className="bg-card border border-border/50 rounded-xl p-6">
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Users size={24} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Admin access required to view user management
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Users size={18} className="text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">User Management</h2>
              <p className="text-sm text-muted-foreground m-0">Manage user accounts</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowAddUser(true)}>
            <Plus size={14} className="mr-1" />
            Add User
          </Button>
        </div>

        <div className="space-y-3">
          {users.map((appUser) => (
            <div key={appUser.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{appUser.email}</span>
                  {appUser.isAdmin && (
                    <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-0 text-xs">
                      <Shield size={10} className="mr-1" />
                      Admin
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Joined {new Date(appUser.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2 items-center">
                {appUser.id !== user?.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget({ id: appUser.id, email: appUser.email })}
                    title="Delete user"
                    className="px-2 text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </Button>
                ) : (
                  <Badge variant="secondary" className="text-xs">You</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onAdded={(newUser) => {
            setUsers([...users, newUser]);
            setShowAddUser(false);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmationModal
          title="Delete User"
          message={`Are you sure you want to delete "${deleteTarget.email}"? This action cannot be undone.`}
          confirmText="Delete"
          isDangerous
          onConfirm={() => deleteUser(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

const AddUserModal: FC<AddUserModalProps> = ({ onClose, onAdded }) => {
  const { addToast } = useToast();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const newUser = await api.createUser(email, password, isAdmin);
      onAdded(newUser);
      addToast('User created successfully', 'success');
    } catch (err: any) {
      setError(err.message);
      addToast(`Failed to create user: ${err.message}`, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Users size={18} className="text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Add User</h2>
              <p className="text-sm text-muted-foreground m-0">Create a new account</p>
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
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Password must be at least 8 characters
              </p>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-secondary"
                />
                <span className="text-sm font-medium">Grant admin privileges</span>
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 ml-6">
                Admin users can manage other users and system settings
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsUsers;
