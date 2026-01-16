import { FC, useEffect, useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  Server,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent } from 'react';

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

const SettingsDownloaders: FC = () => {
  const { user } = useAuth();
  const [radarrServers, setRadarrServers] = useState<RadarrServer[]>([]);
  const [showAddRadarr, setShowAddRadarr] = useState<boolean>(false);
  const [sonarrServers, setSonarrServers] = useState<SonarrServer[]>([]);
  const [showAddSonarr, setShowAddSonarr] = useState<boolean>(false);

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

  const deleteRadarrServer = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete Radarr server "${name}"?`)) return;

    try {
      await api.deleteRadarrServer(id);
      setRadarrServers(radarrServers.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error('Failed to delete Radarr server:', err);
    }
  };

  const deleteSonarrServer = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Delete Sonarr server "${name}"?`)) return;

    try {
      await api.deleteSonarrServer(id);
      setSonarrServers(sonarrServers.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error('Failed to delete Sonarr server:', err);
    }
  };

  return (
    <>
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
    </>
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

export default SettingsDownloaders;
