import { FC, useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { ConfirmationModal } from '../../components/ConfirmationModal';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Server,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  X,
  RefreshCw,
} from 'lucide-react';

interface EmbyServer {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
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

const SettingsEmby: FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [embyServers, setEmbyServers] = useState<EmbyServer[]>([]);
  const [showAddServer, setShowAddServer] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadEmbyServers();
    loadSyncLogs();
  }, []);

  const loadEmbyServers = async (): Promise<void> => {
    try {
      const servers = await api.getEmbyServers();
      setEmbyServers(servers);
    } catch (err) {
      console.error('Failed to load Emby servers:', err);
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

  const deleteEmbyServer = async (id: string): Promise<void> => {
    try {
      await api.deleteEmbyServer(id);
      setEmbyServers(embyServers.filter((s) => s.id !== id));
      addToast('Emby server deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Emby Servers Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Server size={18} className="text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Emby Servers</h2>
              <p className="text-sm text-muted-foreground m-0">Manage your connected Emby servers</p>
            </div>
          </div>
          <div className="flex gap-2">
            {embyServers.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={syncAllToEmby}
                disabled={loading.sync}
              >
                <Play size={14} className={loading.sync ? 'animate-spin' : ''} />
                Sync All
              </Button>
            )}
            {user?.isAdmin && (
              <Button
                size="sm"
                onClick={() => setShowAddServer(true)}
              >
                <Plus size={14} className="mr-1" />
                Add Server
              </Button>
            )}
          </div>
        </div>

        {syncResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
            syncResult.success
              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
              : 'bg-red-500/10 text-red-500 border border-red-500/20'
          }`}>
            {syncResult.success ? (
              <>
                <CheckCircle size={16} />
                <span className="text-sm">
                  Synced {syncResult.totalCollections} collection(s) to {syncResult.totalServers} server(s)
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                <span className="text-sm">{syncResult.error}</span>
              </>
            )}
          </div>
        )}

        {embyServers.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Server size={24} className="text-muted-foreground" />
            </div>
            <h4 className="text-sm font-medium mb-2">No Emby Servers Connected</h4>
            <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
              Connect your Emby server to sync collections directly to your library. Your collections will appear as Emby collections.
            </p>
            {user?.isAdmin && (
              <Button
                size="sm"
                onClick={() => setShowAddServer(true)}
              >
                <Plus size={14} className="mr-1" />
                Add Your First Server
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {embyServers.map((server) => (
              <div key={server.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{server.name}</span>
                    {server.isDefault && (
                      <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-0 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground m-0">{server.url}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => syncServerToEmby(server.id)}
                    disabled={loading[`sync-${server.id}`]}
                    title="Sync to this server"
                    className="px-3"
                  >
                    <Play size={14} className={loading[`sync-${server.id}`] ? 'animate-spin' : ''} />
                  </Button>
                  {user?.isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ id: server.id, name: server.name })}
                      title="Delete server"
                      className="px-3 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync Activity Section */}
      {syncLogs.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Recent Sync Activity</h2>
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
                <div key={log.id} className="p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {log.status === 'SUCCESS' && <CheckCircle size={16} className="text-green-500 flex-shrink-0" />}
                        {log.status === 'PARTIAL' && <AlertCircle size={16} className="text-yellow-500 flex-shrink-0" />}
                        {log.status === 'FAILED' && <AlertCircle size={16} className="text-red-500 flex-shrink-0" />}
                        <span className="font-medium text-sm truncate">
                          {log.collectionName || 'Unknown Collection'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Server size={12} />
                          {log.embyServerName || 'Unknown Server'}
                        </span>
                        <span className="font-mono">
                          {log.itemsMatched}/{log.itemsTotal} matched ({matchRate}%)
                        </span>
                        {log.itemsFailed > 0 && (
                          <span className="text-yellow-500">
                            {log.itemsFailed} failed
                          </span>
                        )}
                      </div>

                      {hasErrors && log.errorMessage && (
                        <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-2">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="flex-shrink-0 px-3"
                      >
                        <Link to={`/collections/${log.collectionId}`} title="View collection">
                          <ArrowRight size={14} />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAddServer && (
        <AddServerModal
          onClose={() => setShowAddServer(false)}
          onAdded={(server) => {
            setEmbyServers([...embyServers, server]);
            setShowAddServer(false);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmationModal
          title="Delete Emby Server"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmText="Delete"
          isDangerous
          onConfirm={() => deleteEmbyServer(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

const AddServerModal: FC<AddServerModalProps> = ({ onClose, onAdded }) => {
  const { addToast } = useToast();
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleTest = async (): Promise<void> => {
    if (!url || !apiKey) {
      setError('URL and API key are required to test connection');
      return;
    }
    setError('');
    setTesting(true);

    try {
      const testResult = await api.testEmbyConnection(url, apiKey);
      if (testResult.success) {
        addToast('Connection successful!', 'success');
      } else {
        setError(testResult.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Test connection first
      const testResult = await api.testEmbyConnection(url, apiKey);
      if (!testResult.success) {
        setError(testResult.error || 'Connection failed');
        setLoading(false);
        return;
      }

      const server = await api.addEmbyServer({ name, url, apiKey });
      onAdded(server);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Server size={18} className="text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Add Emby Server</h2>
              <p className="text-sm text-muted-foreground m-0">Connect to your media server</p>
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
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Emby Server"
                required
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:8096"
                required
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Emby API key"
                required
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Find this in Emby Dashboard → API Keys
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              disabled={testing || loading || !url || !apiKey}
            >
              {testing ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play size={14} className="mr-1" />
                  Test
                </>
              )}
            </Button>
            <Button type="submit" disabled={loading || testing}>
              {loading ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Server'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsEmby;
