import { FC, useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { ConfirmationModal } from '../../components/ConfirmationModal';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users,
  Plus,
  Trash2,
  Shield,
  X,
} from 'lucide-react';
import { FormEvent } from 'react';

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
      <div className="card settings-section">
        <div className="py-8 text-center">
          <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            Admin access required to view user management
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card settings-section">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Users size={18} className="text-purple-500" />
            </div>
            <div>
              <h2 className="m-0">User Management</h2>
              <p className="text-sm text-muted-foreground m-0">Manage user accounts</p>
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddUser(true)}
          >
            <Plus size={14} />
            Add User
          </button>
        </div>

        <div className="mt-4">
          {users.map((appUser) => (
            <div key={appUser.id} className="settings-item">
              <div className="settings-item-info">
                <h3 className="flex items-center gap-2">
                  {appUser.email}
                  {appUser.isAdmin && (
                    <span className="badge badge-info text-xs flex items-center gap-1">
                      <Shield size={10} />
                      Admin
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <span>Joined {new Date(appUser.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {appUser.id !== user?.id && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDeleteTarget({ id: appUser.id, email: appUser.email })}
                    title="Delete user"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {appUser.id === user?.id && (
                  <span className="text-xs text-muted-foreground self-center">Current user</span>
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
    </>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add User</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message mb-4">{error}</div>}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Password must be at least 8 characters
            </p>
          </div>

          <div className="form-group">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Grant admin privileges</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Admin users can manage other users and system settings
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsUsers;
