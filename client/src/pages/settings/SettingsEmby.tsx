import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  Server,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { FormEvent } from 'react';

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

  return (
    <>
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

      {showAddServer && (
        <AddServerModal
          onClose={() => setShowAddServer(false)}
          onAdded={(server) => {
            setEmbyServers([...embyServers, server]);
            setShowAddServer(false);
          }}
        />
      )}
    </>
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
            <Server size={18} />
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

export default SettingsEmby;
