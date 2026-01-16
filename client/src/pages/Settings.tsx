import { FC, useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  Key,
  Link as LinkIcon,
  Unlink,
  Copy,
  Check,
  RefreshCw,
  Server,
  Plus,
  Trash2,
  X,
  ExternalLink,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Users,
  Shield,
} from 'lucide-react';

interface EmbyServer {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
}

interface RadarrServer {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

interface SonarrServer {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

interface QualityProfile {
  id: number;
  name: string;
}

interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

interface AppUser {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SyncLog {
  id: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  collectionId?: string;
  collectionName?: string;
  embyServerName?: string;
  itemsMatched: number;
  itemsTotal: number;
  itemsFailed: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

interface SyncResult {
  success: boolean;
  totalCollections?: number;
  totalServers?: number;
  error?: string;
}

interface AddServerModalProps {
  onClose: () => void;
  onAdded: (server: EmbyServer) => void;
}

interface AddRadarrServerModalProps {
  onClose: () => void;
  onAdded: (server: RadarrServer) => void;
}

interface AddSonarrServerModalProps {
  onClose: () => void;
  onAdded: (server: SonarrServer) => void;
}

interface AddUserModalProps {
  onClose: () => void;
  onAdded: (user: AppUser) => void;
}

const Settings: FC = () => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [copied, setCopied] = useState<boolean>(false);
  const [mdblistKey, setMdblistKey] = useState<string>('');
  const [showMdblistInput, setShowMdblistInput] = useState<boolean>(false);
  const [embyServers, setEmbyServers] = useState<EmbyServer[]>([]);
  const [showAddServer, setShowAddServer] = useState<boolean>(false);
  const [radarrServers, setRadarrServers] = useState<RadarrServer[]>([]);
  const [showAddRadarr, setShowAddRadarr] = useState<boolean>(false);
  const [sonarrServers, setSonarrServers] = useState<SonarrServer[]>([]);
  const [showAddSonarr, setShowAddSonarr] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showAddUser, setShowAddUser] = useState<boolean>(false);

  useEffect(() => {
    loadEmbyServers();
    loadRadarrServers();
    loadSonarrServers();
    loadSyncLogs();
    if (user?.isAdmin) {
      loadUsers();
    }
  }, [user?.isAdmin]);

  const loadEmbyServers = async (): Promise<void> => {
    try {
      const servers = await api.getEmbyServers();
      setEmbyServers(servers);
    } catch (err) {
      console.error('Failed to load Emby servers:', err);
    }
  };

  const loadRadarrServers = async (): Promise<void> => {
    try {
      const servers = await api.getRadarrServers();
      setRadarrServers(servers);
    } catch (err) {
      console.error('Failed to load Radarr servers:', err);
    }
  };

  const loadSonarrServers = async (): Promise<void> => {
    try {
      const servers = await api.getSonarrServers();
      setSonarrServers(servers);
    } catch (err) {
      console.error('Failed to load Sonarr servers:', err);
    }
  };

  const loadSyncLogs = async (): Promise<void> => {
    try {
      const logs = await api.getSyncLogs(10);
      setSyncLogs(logs);
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    }
  };

  const syncAllToEmby = async (): Promise<void> => {
    setLoading(prev => ({ ...prev, sync: true }));
    setSyncResult(null);
    try {
      const result = await api.syncToEmby();
      setSyncResult(result);
      if (result.success) {
        addToast(`Synced ${result.totalCollections} collection(s) to ${result.totalServers} server(s)`, 'success');
      } else {
        addToast(result.error || 'Sync failed', 'error');
      }
      loadSyncLogs();
    } catch (err: any) {
      const errorMessage = err.message || 'Sync failed';
      setSyncResult({ success: false, error: errorMessage });
      addToast(errorMessage, 'error');
    } finally {
      setLoading(prev => ({ ...prev, sync: false }));
    }
  };

  const syncServerToEmby = async (serverId: string): Promise<void> => {
    setLoading(prev => ({ ...prev, [`sync-${serverId}`]: true }));
    try {
      const result = await api.syncToEmbyServer(serverId);
      if (result.success) {
        addToast(`Synced ${result.totalCollections} collection(s) successfully`, 'success');
      } else {
        addToast(result.error || 'Sync failed', 'error');
      }
      loadSyncLogs();
    } catch (err: any) {
      addToast(`Sync failed: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, [`sync-${serverId}`]: false }));
    }
  };

  const copyApiKey = async (): Promise<void> => {
    await navigator.clipboard.writeText(user?.apiKey || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateApiKey = async (): Promise<void> => {
    if (!confirm('Regenerate API key? External integrations using this key will need to be updated.')) return;

    setLoading(prev => ({ ...prev, apiKey: true }));
    try {
      await api.regenerateApiKey();
      await refreshUser();
      addToast('API key regenerated successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to regenerate: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, apiKey: false }));
    }
  };

  const connectTrakt = async (): Promise<void> => {
    setLoading(prev => ({ ...prev, trakt: true }));
    try {
      const { authUrl } = await api.getTraktAuthUrl();
      window.location.href = authUrl;
      // Note: page will redirect, so no need to reset loading
    } catch (err: any) {
      addToast(`Failed to connect: ${err.message}`, 'error');
      setLoading(prev => ({ ...prev, trakt: false }));
    }
  };

  const disconnectTrakt = async (): Promise<void> => {
    if (!confirm('Disconnect Trakt? Your Trakt collections will stop syncing.')) return;

    setLoading(prev => ({ ...prev, trakt: true }));
    try {
      await api.disconnectTrakt();
      await refreshUser();
      addToast('Trakt disconnected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to disconnect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, trakt: false }));
    }
  };

  const connectMdblist = async (): Promise<void> => {
    if (!mdblistKey.trim()) {
      addToast('Please enter your MDBList API key', 'error');
      return;
    }

    setLoading(prev => ({ ...prev, mdblist: true }));
    try {
      await api.connectMdblist(mdblistKey);
      await refreshUser();
      setShowMdblistInput(false);
      setMdblistKey('');
      addToast('MDBList connected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to connect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, mdblist: false }));
    }
  };

  const disconnectMdblist = async (): Promise<void> => {
    if (!confirm('Disconnect MDBList?')) return;

    setLoading(prev => ({ ...prev, mdblist: true }));
    try {
      await api.disconnectMdblist();
      await refreshUser();
      addToast('MDBList disconnected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to disconnect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, mdblist: false }));
    }
  };

  const deleteEmbyServer = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete Emby server "${name}"?`)) return;

    try {
      await api.deleteEmbyServer(id);
      setEmbyServers(embyServers.filter((s) => s.id !== id));
      addToast('Emby server deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  const deleteRadarrServer = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete Radarr server "${name}"?`)) return;

    try {
      await api.deleteRadarrServer(id);
      setRadarrServers(radarrServers.filter((s) => s.id !== id));
      addToast('Radarr server deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  const deleteSonarrServer = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete Sonarr server "${name}"?`)) return;

    try {
      await api.deleteSonarrServer(id);
      setSonarrServers(sonarrServers.filter((s) => s.id !== id));
      addToast('Sonarr server deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  const loadUsers = async (): Promise<void> => {
    try {
      const userList = await api.getUsers();
      setUsers(userList);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      addToast(`Failed to load users: ${err.message}`, 'error');
    }
  };

  const deleteUser = async (id: string, email: string): Promise<void> => {
    if (!confirm(`Delete user "${email}"? This action cannot be undone.`)) return;

    try {
      await api.deleteUser(id);
      setUsers(users.filter((u) => u.id !== id));
      addToast('User deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete user: ${err.message}`, 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure your integrations and sync options</p>
        </div>
      </div>

      {/* API Key */}
      <div className="card settings-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="m-0">API Key</h2>
            <p className="text-sm text-muted-foreground m-0">Use this key to authenticate API requests</p>
          </div>
        </div>

        <div className="copy-field">
          <input
            type="text"
            value={user?.apiKey || ''}
            readOnly
          />
          <button
            className="btn btn-secondary"
            onClick={copyApiKey}
            aria-label="Copy API key"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button
            className="btn btn-secondary"
            onClick={regenerateApiKey}
            disabled={loading.apiKey}
            aria-label="Regenerate API key"
            aria-busy={loading.apiKey}
          >
            <RefreshCw size={16} className={loading.apiKey ? 'spinning' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Connected Services */}
      <div className="card settings-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LinkIcon size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="m-0">Connected Services</h2>
            <p className="text-sm text-muted-foreground m-0">Link your accounts to import collections</p>
          </div>
        </div>

        {/* Trakt */}
        <div className="settings-item">
          <div className="settings-item-info">
            <h3 className="flex items-center gap-2">
              Trakt
              {user?.traktConnected && (
                <span className="badge badge-success text-xs">
                  <CheckCircle size={10} className="mr-1" />
                  Connected
                </span>
              )}
            </h3>
            <p>
              {user?.traktConnected
                ? 'Sync your watchlist, collections and lists'
                : 'Connect to sync your Trakt watchlist and lists'}
            </p>
          </div>
          {user?.isAdmin ? (
            user?.traktConnected ? (
              <button
                className="btn btn-danger btn-sm"
                onClick={disconnectTrakt}
                disabled={loading.trakt}
              >
                <Unlink size={14} />
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={connectTrakt}
                disabled={loading.trakt}
              >
                <LinkIcon size={14} />
                Connect
              </button>
            )
          ) : (
            !user?.traktConnected && (
              <span className="text-xs text-muted-foreground">Admin required to connect</span>
            )
          )}
        </div>

        {/* MDBList */}
        <div className="settings-item">
          <div className="settings-item-info">
            <h3 className="flex items-center gap-2">
              MDBList
              {user?.mdblistConnected && (
                <span className="badge badge-success text-xs">
                  <CheckCircle size={10} className="mr-1" />
                  Connected
                </span>
              )}
            </h3>
            <p>
              {user?.mdblistConnected
                ? 'Browse and sync curated MDBList lists'
                : 'Add your API key to browse MDBList'}
            </p>
          </div>
          {user?.isAdmin ? (
            user?.mdblistConnected ? (
              <button
                className="btn btn-danger btn-sm"
                onClick={disconnectMdblist}
                disabled={loading.mdblist}
              >
                <Unlink size={14} />
                Disconnect
              </button>
            ) : showMdblistInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mdblistKey}
                  onChange={(e) => setMdblistKey(e.target.value)}
                  placeholder="API Key"
                  className="px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground text-sm"
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={connectMdblist}
                  disabled={loading.mdblist}
                >
                  Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowMdblistInput(false)}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowMdblistInput(true)}
              >
                <Key size={14} />
                Add Key
              </button>
            )
          ) : (
            !user?.mdblistConnected && (
              <span className="text-xs text-muted-foreground">Admin required to connect</span>
            )
          )}
        </div>
      </div>

      {/* Emby Servers */}
      <div className="card settings-section">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Server size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="m-0">Emby Servers</h2>
              <p className="text-sm text-muted-foreground m-0">Manage your connected Emby servers</p>
            </div>
          </div>
          <div className="flex gap-2">
            {embyServers.length > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={syncAllToEmby}
                disabled={loading.sync}
              >
                <Play size={14} className={loading.sync ? 'spinning' : ''} />
                Sync All
              </button>
            )}
            {user?.isAdmin && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddServer(true)}
              >
                <Plus size={14} />
                Add Server
              </button>
            )}
          </div>
        </div>

        {syncResult && (
          <div className={`alert ${syncResult.success ? 'alert-success' : 'alert-error'} mt-4`}>
            {syncResult.success ? (
              <>
                <CheckCircle size={16} />
                <span>
                  Synced {syncResult.totalCollections} collection(s) to {syncResult.totalServers} server(s)
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                <span>{syncResult.error}</span>
              </>
            )}
          </div>
        )}

        {embyServers.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Server size={24} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No Emby servers configured. Add a server to start syncing collections.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            {embyServers.map((server) => (
              <div key={server.id} className="settings-item">
                <div className="settings-item-info">
                  <h3 className="flex items-center gap-2">
                    {server.name}
                    {server.isDefault && (
                      <span className="badge badge-info text-xs">Default</span>
                    )}
                  </h3>
                  <p className="font-mono text-xs">{server.url}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => syncServerToEmby(server.id)}
                    disabled={loading[`sync-${server.id}`]}
                    title="Sync to this server"
                  >
                    <Play size={14} className={loading[`sync-${server.id}`] ? 'spinning' : ''} />
                  </button>
                  {user?.isAdmin && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => deleteEmbyServer(server.id, server.name)}
                      title="Delete server"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Radarr Servers */}
      <div className="card settings-section">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Server size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="m-0">Radarr Servers</h2>
              <p className="text-sm text-muted-foreground m-0">Add movies to your download manager</p>
            </div>
          </div>
          {user?.isAdmin && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddRadarr(true)}
            >
              <Plus size={14} />
              Add Server
            </button>
          )}
        </div>

        {radarrServers.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Server size={24} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No Radarr servers configured. Add a server to request movies.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            {radarrServers.map((server) => (
              <div key={server.id} className="settings-item">
                <div className="settings-item-info">
                  <h3 className="flex items-center gap-2">
                    {server.name}
                    {server.isDefault && (
                      <span className="badge badge-info text-xs">Default</span>
                    )}
                  </h3>
                  <p className="font-mono text-xs">{server.url}</p>
                  {server.rootFolderPath && (
                    <p className="text-xs text-muted-foreground">Root: {server.rootFolderPath}</p>
                  )}
                </div>
                {user?.isAdmin && (
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => deleteRadarrServer(server.id, server.name)}
                      title="Delete server"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sonarr Servers */}
      <div className="card settings-section">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Server size={18} className="text-sky-500" />
            </div>
            <div>
              <h2 className="m-0">Sonarr Servers</h2>
              <p className="text-sm text-muted-foreground m-0">Add TV shows to your download manager</p>
            </div>
          </div>
          {user?.isAdmin && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddSonarr(true)}
            >
              <Plus size={14} />
              Add Server
            </button>
          )}
        </div>

        {sonarrServers.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Server size={24} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No Sonarr servers configured. Add a server to request TV shows.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            {sonarrServers.map((server) => (
              <div key={server.id} className="settings-item">
                <div className="settings-item-info">
                  <h3 className="flex items-center gap-2">
                    {server.name}
                    {server.isDefault && (
                      <span className="badge badge-info text-xs">Default</span>
                    )}
                  </h3>
                  <p className="font-mono text-xs">{server.url}</p>
                  {server.rootFolderPath && (
                    <p className="text-xs text-muted-foreground">Root: {server.rootFolderPath}</p>
                  )}
                </div>
                {user?.isAdmin && (
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => deleteSonarrServer(server.id, server.name)}
                      title="Delete server"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Management - Admin Only */}
      {user?.isAdmin && (
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
                      onClick={() => deleteUser(appUser.id, appUser.email)}
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
      )}

      {/* Sync History */}
      {syncLogs.length > 0 && (
        <div className="card settings-section">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="m-0">Recent Sync Activity</h2>
              <p className="text-sm text-muted-foreground m-0">History of your collection syncs</p>
            </div>
          </div>
          <div className="space-y-3">
            {syncLogs.map((log) => {
              const matchRate = log.itemsTotal > 0 
                ? Math.round((log.itemsMatched / log.itemsTotal) * 100) 
                : 0;
              const hasErrors = log.status === 'PARTIAL' || log.status === 'FAILED';
              
              return (
                <div key={log.id} className="settings-item py-4 border border-border/30 rounded-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {log.status === 'SUCCESS' && <CheckCircle size={16} className="text-green-500 flex-shrink-0" />}
                        {log.status === 'PARTIAL' && <AlertCircle size={16} className="text-yellow-500 flex-shrink-0" />}
                        {log.status === 'FAILED' && <AlertCircle size={16} className="text-red-500 flex-shrink-0" />}
                        <h3 className="font-semibold text-sm m-0 truncate">
                          {log.collectionName || 'Unknown Collection'}
                        </h3>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Server size={12} />
                          {log.embyServerName || 'Unknown Server'}
                        </span>
                        <span className="font-mono">
                          {log.itemsMatched}/{log.itemsTotal} items matched ({matchRate}%)
                        </span>
                        {log.itemsFailed > 0 && (
                          <span className="text-yellow-500">
                            {log.itemsFailed} failed
                          </span>
                        )}
                      </div>
                      
                      {hasErrors && log.errorMessage && (
                        <p className="text-xs text-muted-foreground/70 line-clamp-2">
                          {log.errorMessage.length > 100 
                            ? `${log.errorMessage.substring(0, 100)}...` 
                            : log.errorMessage}
                        </p>
                      )}
                      
                      <span className="text-xs text-muted-foreground/60">
                        {new Date(log.startedAt).toLocaleString()}
                      </span>
                    </div>
                    
                    {log.collectionId && (
                      <Link
                        to={`/collections/${log.collectionId}`}
                        className="btn btn-ghost btn-sm flex-shrink-0"
                        title="View collection"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="card settings-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ExternalLink size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="m-0">How It Works</h2>
            <p className="text-sm text-muted-foreground m-0">Quick guide to get started</p>
          </div>
        </div>
        <div className="bg-secondary/30 rounded-xl p-5">
          <ol className="text-muted-foreground pl-5 space-y-3 text-sm">
            <li>Add your Emby server above with its URL and API key</li>
            <li>Create collections from MDBList, Trakt, or manually</li>
            <li>Click "Sync All" to push collections to Emby</li>
            <li>Collections sync automatically every 6 hours</li>
          </ol>
          <p className="text-xs text-muted-foreground/70 mt-4 pt-4 border-t border-border/30">
            To get your Emby API key: Emby Dashboard → API Keys → New API Key
          </p>
        </div>
      </div>

      {showAddServer && (
        <AddServerModal
          onClose={() => setShowAddServer(false)}
          onAdded={(server) => {
            setEmbyServers([...embyServers, server]);
            setShowAddServer(false);
          }}
        />
      )}

      {showAddRadarr && (
        <AddRadarrServerModal
          onClose={() => setShowAddRadarr(false)}
          onAdded={(server) => {
            setRadarrServers([...radarrServers, server]);
            setShowAddRadarr(false);
          }}
        />
      )}

      {showAddSonarr && (
        <AddSonarrServerModal
          onClose={() => setShowAddSonarr(false)}
          onAdded={(server) => {
            setSonarrServers([...sonarrServers, server]);
            setShowAddSonarr(false);
          }}
        />
      )}

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onAdded={(newUser) => {
            setUsers([...users, newUser]);
            setShowAddUser(false);
          }}
        />
      )}
    </div>
  );
};

const AddServerModal: FC<AddServerModalProps> = ({ onClose, onAdded }) => {
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const server = await api.addEmbyServer({ name, url, apiKey });
      onAdded(server);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Emby Server</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message mb-4">{error}</div>}

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Emby Server"
              required
            />
          </div>

          <div className="form-group">
            <label>URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:8096"
              required
            />
          </div>

          <div className="form-group">
            <label>Emby API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your Emby API key"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Find this in Emby Dashboard → API Keys
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddRadarrServerModal: FC<AddRadarrServerModalProps> = ({ onClose, onAdded }) => {
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'connect' | 'configure'>('connect');
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | ''>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [tempServerId, setTempServerId] = useState<string>('');

  const handleConnect = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Test connection first
      const testResult = await api.testRadarrConnection(url, apiKey);
      if (!testResult.success) {
        setError(testResult.error || 'Connection failed');
        setLoading(false);
        return;
      }

      // Add server without defaults first
      const server = await api.addRadarrServer({ name, url, apiKey });
      setTempServerId(server.id);

      // Load profiles and root folders
      const [profilesData, foldersData] = await Promise.all([
        api.getRadarrProfiles(server.id),
        api.getRadarrRootFolders(server.id),
      ]);
      setProfiles(profilesData);
      setRootFolders(foldersData);

      // Auto-select first options
      if (profilesData.length > 0) setSelectedProfile(profilesData[0].id);
      if (foldersData.length > 0) setSelectedFolder(foldersData[0].path);

      setStep('configure');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigure = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);

    try {
      const updated = await api.updateRadarrServer(tempServerId, {
        qualityProfileId: selectedProfile || undefined,
        rootFolderPath: selectedFolder || undefined,
        isDefault: true,
      });
      onAdded(updated);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{step === 'connect' ? 'Add Radarr Server' : 'Configure Defaults'}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {step === 'connect' ? (
          <form onSubmit={handleConnect}>
            {error && <div className="error-message mb-4">{error}</div>}

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Radarr Server"
                required
              />
            </div>

            <div className="form-group">
              <label>URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:7878"
                required
              />
            </div>

            <div className="form-group">
              <label>API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Radarr API key"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find this in Radarr Settings → General → API Key
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfigure}>
            {error && <div className="error-message mb-4">{error}</div>}

            <p className="text-sm text-muted-foreground mb-4">
              Set defaults for adding movies. You can override these when adding individual items.
            </p>

            <div className="form-group">
              <label>Quality Profile</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">Select a profile</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Root Folder</label>
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
              >
                <option value="">Select a folder</option>
                {rootFolders.map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path} ({(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Skip
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const AddSonarrServerModal: FC<AddSonarrServerModalProps> = ({ onClose, onAdded }) => {
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'connect' | 'configure'>('connect');
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | ''>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [tempServerId, setTempServerId] = useState<string>('');

  const handleConnect = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Test connection first
      const testResult = await api.testSonarrConnection(url, apiKey);
      if (!testResult.success) {
        setError(testResult.error || 'Connection failed');
        setLoading(false);
        return;
      }

      // Add server without defaults first
      const server = await api.addSonarrServer({ name, url, apiKey });
      setTempServerId(server.id);

      // Load profiles and root folders
      const [profilesData, foldersData] = await Promise.all([
        api.getSonarrProfiles(server.id),
        api.getSonarrRootFolders(server.id),
      ]);
      setProfiles(profilesData);
      setRootFolders(foldersData);

      // Auto-select first options
      if (profilesData.length > 0) setSelectedProfile(profilesData[0].id);
      if (foldersData.length > 0) setSelectedFolder(foldersData[0].path);

      setStep('configure');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigure = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);

    try {
      const updated = await api.updateSonarrServer(tempServerId, {
        qualityProfileId: selectedProfile || undefined,
        rootFolderPath: selectedFolder || undefined,
        isDefault: true,
      });
      onAdded(updated);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{step === 'connect' ? 'Add Sonarr Server' : 'Configure Defaults'}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {step === 'connect' ? (
          <form onSubmit={handleConnect}>
            {error && <div className="error-message mb-4">{error}</div>}

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Sonarr Server"
                required
              />
            </div>

            <div className="form-group">
              <label>URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:8989"
                required
              />
            </div>

            <div className="form-group">
              <label>API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Sonarr API key"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find this in Sonarr Settings → General → API Key
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfigure}>
            {error && <div className="error-message mb-4">{error}</div>}

            <p className="text-sm text-muted-foreground mb-4">
              Set defaults for adding TV shows. You can override these when adding individual items.
            </p>

            <div className="form-group">
              <label>Quality Profile</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">Select a profile</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Root Folder</label>
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
              >
                <option value="">Select a folder</option>
                {rootFolders.map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path} ({(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Skip
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
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

export default Settings;
