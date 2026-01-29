import { FC, useEffect, useState, FormEvent } from 'react';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { ConfirmationModal } from '../../components/ConfirmationModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  X,
  Pencil,
  RefreshCw,
  Film,
  Tv,
} from 'lucide-react';

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

interface AddRadarrServerModalProps {
  onClose: () => void;
  onAdded: (server: RadarrServer) => void;
}

interface AddSonarrServerModalProps {
  onClose: () => void;
  onAdded: (server: SonarrServer) => void;
}

interface EditRadarrServerModalProps {
  server: RadarrServer;
  onClose: () => void;
  onUpdated: (server: RadarrServer) => void;
}

interface EditSonarrServerModalProps {
  server: SonarrServer;
  onClose: () => void;
  onUpdated: (server: SonarrServer) => void;
}

const SettingsDownloaders: FC = () => {
  const { user } = useAuth();
  const [radarrServers, setRadarrServers] = useState<RadarrServer[]>([]);
  const [showAddRadarr, setShowAddRadarr] = useState<boolean>(false);
  const [editRadarrServer, setEditRadarrServer] = useState<RadarrServer | null>(null);
  const [sonarrServers, setSonarrServers] = useState<SonarrServer[]>([]);
  const [showAddSonarr, setShowAddSonarr] = useState<boolean>(false);
  const [editSonarrServer, setEditSonarrServer] = useState<SonarrServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'radarr' | 'sonarr'; id: string; name: string } | null>(null);

  useEffect(() => {
    loadRadarrServers();
    loadSonarrServers();
  }, []);

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

  const deleteRadarrServer = async (id: string): Promise<void> => {
    try {
      await api.deleteRadarrServer(id);
      setRadarrServers(radarrServers.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error('Failed to delete Radarr server:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const deleteSonarrServer = async (id: string): Promise<void> => {
    try {
      await api.deleteSonarrServer(id);
      setSonarrServers(sonarrServers.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error('Failed to delete Sonarr server:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Radarr Servers Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Film size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Radarr Servers</h2>
              <p className="text-sm text-muted-foreground m-0">Add movies to your download manager</p>
            </div>
          </div>
          {user?.isAdmin && (
            <Button size="sm" onClick={() => setShowAddRadarr(true)}>
              <Plus size={14} className="mr-1" />
              Add Server
            </Button>
          )}
        </div>

        {radarrServers.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Film size={24} className="text-muted-foreground" />
            </div>
            <h4 className="text-sm font-medium mb-2">No Radarr Servers Connected</h4>
            <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
              Connect Radarr to automatically request movies from your collections.
            </p>
            {user?.isAdmin && (
              <Button size="sm" onClick={() => setShowAddRadarr(true)}>
                <Plus size={14} className="mr-1" />
                Add Radarr Server
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {radarrServers.map((server) => (
              <div key={server.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{server.name}</span>
                    {server.isDefault && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-0 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground m-0">{server.url}</p>
                  {server.rootFolderPath && (
                    <p className="text-xs text-muted-foreground/70 m-0 mt-0.5">Root: {server.rootFolderPath}</p>
                  )}
                </div>
                {user?.isAdmin && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditRadarrServer(server)}
                      title="Edit server"
                      className="px-2"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ type: 'radarr', id: server.id, name: server.name })}
                      title="Delete server"
                      className="px-2 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sonarr Servers Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Tv size={18} className="text-sky-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Sonarr Servers</h2>
              <p className="text-sm text-muted-foreground m-0">Add TV shows to your download manager</p>
            </div>
          </div>
          {user?.isAdmin && (
            <Button size="sm" onClick={() => setShowAddSonarr(true)}>
              <Plus size={14} className="mr-1" />
              Add Server
            </Button>
          )}
        </div>

        {sonarrServers.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <Tv size={24} className="text-muted-foreground" />
            </div>
            <h4 className="text-sm font-medium mb-2">No Sonarr Servers Connected</h4>
            <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
              Connect Sonarr to automatically request TV shows from your collections.
            </p>
            {user?.isAdmin && (
              <Button size="sm" onClick={() => setShowAddSonarr(true)}>
                <Plus size={14} className="mr-1" />
                Add Sonarr Server
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sonarrServers.map((server) => (
              <div key={server.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{server.name}</span>
                    {server.isDefault && (
                      <Badge variant="secondary" className="bg-sky-500/10 text-sky-500 border-0 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground m-0">{server.url}</p>
                  {server.rootFolderPath && (
                    <p className="text-xs text-muted-foreground/70 m-0 mt-0.5">Root: {server.rootFolderPath}</p>
                  )}
                </div>
                {user?.isAdmin && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditSonarrServer(server)}
                      title="Edit server"
                      className="px-2"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ type: 'sonarr', id: server.id, name: server.name })}
                      title="Delete server"
                      className="px-2 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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

      {editRadarrServer && (
        <EditRadarrServerModal
          server={editRadarrServer}
          onClose={() => setEditRadarrServer(null)}
          onUpdated={(updated) => {
            setRadarrServers(radarrServers.map((s) => s.id === updated.id ? updated : s));
            setEditRadarrServer(null);
          }}
        />
      )}

      {editSonarrServer && (
        <EditSonarrServerModal
          server={editSonarrServer}
          onClose={() => setEditSonarrServer(null)}
          onUpdated={(updated) => {
            setSonarrServers(sonarrServers.map((s) => s.id === updated.id ? updated : s));
            setEditSonarrServer(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmationModal
          title={`Delete ${deleteTarget.type === 'radarr' ? 'Radarr' : 'Sonarr'} Server`}
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmText="Delete"
          isDangerous
          onConfirm={() => deleteTarget.type === 'radarr' ? deleteRadarrServer(deleteTarget.id) : deleteSonarrServer(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
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
      const testResult = await api.testRadarrConnection(url, apiKey);
      if (!testResult.success) {
        setError(testResult.error || 'Connection failed');
        setLoading(false);
        return;
      }

      const server = await api.addRadarrServer({ name, url, apiKey });
      setTempServerId(server.id);

      const [profilesData, foldersData] = await Promise.all([
        api.getRadarrProfiles(server.id),
        api.getRadarrRootFolders(server.id),
      ]);
      setProfiles(profilesData);
      setRootFolders(foldersData);

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Film size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">{step === 'connect' ? 'Add Radarr Server' : 'Configure Defaults'}</h2>
              <p className="text-sm text-muted-foreground m-0">
                {step === 'connect' ? 'Connect to your movie manager' : 'Set default options'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
            <X size={18} />
          </Button>
        </div>

        {step === 'connect' ? (
          <form onSubmit={handleConnect} className="p-6">
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
                  placeholder="My Radarr Server"
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
                  placeholder="http://192.168.1.100:7878"
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
                  placeholder="Your Radarr API key"
                  required
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Find this in Radarr Settings → General → API Key
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
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfigure} className="p-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-4">
              Set defaults for adding movies. You can override these when adding individual items.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Quality Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Root Folder</label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a folder</option>
                  {rootFolders.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path} ({(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
              <Button type="button" variant="secondary" onClick={onClose}>
                Skip
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw size={14} className="mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
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
      const testResult = await api.testSonarrConnection(url, apiKey);
      if (!testResult.success) {
        setError(testResult.error || 'Connection failed');
        setLoading(false);
        return;
      }

      const server = await api.addSonarrServer({ name, url, apiKey });
      setTempServerId(server.id);

      const [profilesData, foldersData] = await Promise.all([
        api.getSonarrProfiles(server.id),
        api.getSonarrRootFolders(server.id),
      ]);
      setProfiles(profilesData);
      setRootFolders(foldersData);

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Tv size={18} className="text-sky-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">{step === 'connect' ? 'Add Sonarr Server' : 'Configure Defaults'}</h2>
              <p className="text-sm text-muted-foreground m-0">
                {step === 'connect' ? 'Connect to your TV show manager' : 'Set default options'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
            <X size={18} />
          </Button>
        </div>

        {step === 'connect' ? (
          <form onSubmit={handleConnect} className="p-6">
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
                  placeholder="My Sonarr Server"
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
                  placeholder="http://192.168.1.100:8989"
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
                  placeholder="Your Sonarr API key"
                  required
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Find this in Sonarr Settings → General → API Key
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
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfigure} className="p-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-4">
              Set defaults for adding TV shows. You can override these when adding individual items.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Quality Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Root Folder</label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a folder</option>
                  {rootFolders.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path} ({(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
              <Button type="button" variant="secondary" onClick={onClose}>
                Skip
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw size={14} className="mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const EditRadarrServerModal: FC<EditRadarrServerModalProps> = ({ server, onClose, onUpdated }) => {
  const [name, setName] = useState<string>(server.name);
  const [url, setUrl] = useState<string>(server.url);
  const [apiKey, setApiKey] = useState<string>('');
  const [isDefault, setIsDefault] = useState<boolean>(server.isDefault);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | ''>(server.qualityProfileId || '');
  const [selectedFolder, setSelectedFolder] = useState<string>(server.rootFolderPath || '');
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async (): Promise<void> => {
    try {
      const [profilesData, foldersData] = await Promise.all([
        api.getRadarrProfiles(server.id),
        api.getRadarrRootFolders(server.id),
      ]);
      setProfiles(profilesData);
      setRootFolders(foldersData);
    } catch (_err: any) {
      setError('Failed to load profiles and folders');
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // If URL or API key changed, test connection first
      if (url !== server.url || apiKey) {
        const testResult = await api.testRadarrConnection(url, apiKey || 'existing');
        if (!testResult.success && apiKey) {
          setError(testResult.error || 'Connection failed');
          setLoading(false);
          return;
        }
      }

      const updateData: Record<string, any> = {
        name,
        url,
        isDefault,
        qualityProfileId: selectedProfile || undefined,
        rootFolderPath: selectedFolder || undefined,
      };

      // Only include API key if changed
      if (apiKey) {
        updateData.apiKey = apiKey;
      }

      const updated = await api.updateRadarrServer(server.id, updateData);
      onUpdated(updated);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50 sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Film size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Edit Radarr Server</h2>
              <p className="text-sm text-muted-foreground m-0">Update server configuration</p>
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

          {/* Connection Settings */}
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Connection Settings</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Radarr Server"
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
                  placeholder="http://192.168.1.100:7878"
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
                  placeholder="Leave blank to keep current key"
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Only enter a new key if you want to change it
                </p>
              </div>
            </div>
          </div>

          {/* Default Settings */}
          <div className="mb-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-1 text-muted-foreground">Default Settings</h4>
            <p className="text-xs text-muted-foreground mb-3">
              These defaults are used when requesting movies from collections
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Quality Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value ? parseInt(e.target.value) : '')}
                  disabled={loadingOptions}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Select a profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Root Folder</label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  disabled={loadingOptions}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Select a folder</option>
                  {rootFolders.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path} ({(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-secondary"
                />
                <span className="text-sm">Set as default server</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingOptions}>
              {loading ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditSonarrServerModal: FC<EditSonarrServerModalProps> = ({ server, onClose, onUpdated }) => {
  const [name, setName] = useState<string>(server.name);
  const [url, setUrl] = useState<string>(server.url);
  const [apiKey, setApiKey] = useState<string>('');
  const [isDefault, setIsDefault] = useState<boolean>(server.isDefault);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | ''>(server.qualityProfileId || '');
  const [selectedFolder, setSelectedFolder] = useState<string>(server.rootFolderPath || '');
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async (): Promise<void> => {
    try {
      const [profilesData, foldersData] = await Promise.all([
        api.getSonarrProfiles(server.id),
        api.getSonarrRootFolders(server.id),
      ]);
      setProfiles(profilesData);
      setRootFolders(foldersData);
    } catch (_err: any) {
      setError('Failed to load profiles and folders');
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // If URL or API key changed, test connection first
      if (url !== server.url || apiKey) {
        const testResult = await api.testSonarrConnection(url, apiKey || 'existing');
        if (!testResult.success && apiKey) {
          setError(testResult.error || 'Connection failed');
          setLoading(false);
          return;
        }
      }

      const updateData: Record<string, any> = {
        name,
        url,
        isDefault,
        qualityProfileId: selectedProfile || undefined,
        rootFolderPath: selectedFolder || undefined,
      };

      // Only include API key if changed
      if (apiKey) {
        updateData.apiKey = apiKey;
      }

      const updated = await api.updateSonarrServer(server.id, updateData);
      onUpdated(updated);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border/50 sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Tv size={18} className="text-sky-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold m-0">Edit Sonarr Server</h2>
              <p className="text-sm text-muted-foreground m-0">Update server configuration</p>
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

          {/* Connection Settings */}
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Connection Settings</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Sonarr Server"
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
                  placeholder="http://192.168.1.100:8989"
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
                  placeholder="Leave blank to keep current key"
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Only enter a new key if you want to change it
                </p>
              </div>
            </div>
          </div>

          {/* Default Settings */}
          <div className="mb-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-1 text-muted-foreground">Default Settings</h4>
            <p className="text-xs text-muted-foreground mb-3">
              These defaults are used when requesting TV shows from collections
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Quality Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value ? parseInt(e.target.value) : '')}
                  disabled={loadingOptions}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Select a profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Root Folder</label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  disabled={loadingOptions}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Select a folder</option>
                  {rootFolders.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path} ({(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free)
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-secondary"
                />
                <span className="text-sm">Set as default server</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingOptions}>
              {loading ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsDownloaders;
