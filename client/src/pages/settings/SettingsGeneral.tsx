import { FC, useState, useEffect } from 'react';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  Key,
  Link as LinkIcon,
  Unlink,
  Copy,
  Check,
  RefreshCw,
  X,
  CheckCircle,
  Play,
} from 'lucide-react';

const SettingsGeneral: FC = () => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [copied, setCopied] = useState<boolean>(false);
  const [mdblistKey, setMdblistKey] = useState<string>('');
  const [showMdblistInput, setShowMdblistInput] = useState<boolean>(false);
  const [tmdbKey, setTmdbKey] = useState<string>('');
  const [showTmdbInput, setShowTmdbInput] = useState<boolean>(false);
  const [tmdbApiKeyMasked, setTmdbApiKeyMasked] = useState<string | null>(null);
  const [tmdbValidationError, setTmdbValidationError] = useState<string>('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});

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

  const testMdblist = async (): Promise<void> => {
    if (!mdblistKey.trim()) {
      addToast('Please enter your MDBList API key', 'error');
      return;
    }

    setLoading(prev => ({ ...prev, mdblistTest: true }));
    try {
      const result = await api.testMdblistConnection(mdblistKey);
      if (result.success) {
        addToast('MDBList API key is valid!', 'success');
      }
    } catch (err: any) {
      addToast(`Test failed: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, mdblistTest: false }));
    }
  };

  // Load settings to get masked TMDB key
  const loadSettings = async (): Promise<void> => {
    try {
      const settings = await api.getSettings();
      setTmdbApiKeyMasked(settings.tmdbApiKeyMasked);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Validate TMDB API key format (v4 tokens start with 'eyJ' and are fairly long)
  const validateTmdbKey = (key: string): string | null => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return 'Please enter your TMDB API key';
    }
    if (!trimmedKey.startsWith('eyJ')) {
      return 'Invalid format. TMDB API keys (v4 Read Access Token) should start with "eyJ"';
    }
    if (trimmedKey.length < 100) {
      return 'API key appears too short. Please use the full v4 Read Access Token from TMDB';
    }
    return null;
  };

  const testTmdb = async (): Promise<void> => {
    const validationError = validateTmdbKey(tmdbKey);
    if (validationError) {
      setTmdbValidationError(validationError);
      return;
    }
    setTmdbValidationError('');

    setLoading(prev => ({ ...prev, tmdbTest: true }));
    try {
      const result = await api.testTmdbConnection(tmdbKey);
      if (result.success) {
        addToast('TMDB API key is valid!', 'success');
      }
    } catch (err: any) {
      addToast(`Test failed: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, tmdbTest: false }));
    }
  };

  const connectTmdb = async (): Promise<void> => {
    const validationError = validateTmdbKey(tmdbKey);
    if (validationError) {
      setTmdbValidationError(validationError);
      return;
    }
    setTmdbValidationError('');

    setLoading(prev => ({ ...prev, tmdb: true }));
    try {
      await api.connectTmdb(tmdbKey);
      await refreshUser();
      await loadSettings();
      setShowTmdbInput(false);
      setTmdbKey('');
      addToast('TMDB connected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to connect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, tmdb: false }));
    }
  };

  const disconnectTmdb = async (): Promise<void> => {
    if (!confirm('Disconnect TMDB?')) return;

    setLoading(prev => ({ ...prev, tmdb: true }));
    try {
      await api.disconnectTmdb();
      await refreshUser();
      setTmdbApiKeyMasked(null);
      addToast('TMDB disconnected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to disconnect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, tmdb: false }));
    }
  };

  return (
    <>
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
                  className="btn btn-secondary btn-sm"
                  onClick={testMdblist}
                  disabled={loading.mdblistTest || loading.mdblist}
                  title="Test API key"
                >
                  {loading.mdblistTest ? (
                    <RefreshCw size={14} className="spinning" />
                  ) : (
                    <Play size={14} />
                  )}
                  Test
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={connectMdblist}
                  disabled={loading.mdblist || loading.mdblistTest}
                >
                  {loading.mdblist ? (
                    <RefreshCw size={14} className="spinning" />
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowMdblistInput(false);
                    setMdblistKey('');
                  }}
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

        {/* TMDB */}
        <div className="settings-item">
          <div className="settings-item-info">
            <h3 className="flex items-center gap-2">
              TMDB
              {user?.tmdbConnected && (
                <span className="badge badge-success text-xs">
                  <CheckCircle size={10} className="mr-1" />
                  Connected
                </span>
              )}
            </h3>
            <p>
              {user?.tmdbConnected
                ? (
                  <>
                    Enhanced metadata and poster images from TMDB
                    {tmdbApiKeyMasked && (
                      <span className="block font-mono text-xs text-muted-foreground mt-1">
                        Key: {tmdbApiKeyMasked}
                      </span>
                    )}
                  </>
                )
                : (
                  <>
                    Add your API key for enhanced metadata.{' '}
                    <a
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Get API key
                    </a>
                    <span className="block text-xs text-muted-foreground mt-1">
                      Use the v4 Read Access Token (starts with "eyJ")
                    </span>
                  </>
                )}
            </p>
          </div>
          {user?.isAdmin ? (
            user?.tmdbConnected ? (
              <button
                className="btn btn-danger btn-sm"
                onClick={disconnectTmdb}
                disabled={loading.tmdb}
              >
                <Unlink size={14} />
                Disconnect
              </button>
            ) : showTmdbInput ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tmdbKey}
                    onChange={(e) => {
                      setTmdbKey(e.target.value);
                      setTmdbValidationError('');
                    }}
                    placeholder="eyJ... (v4 Read Access Token)"
                    className={`px-3 py-2 bg-secondary/50 border rounded-lg text-foreground text-sm min-w-[200px] ${
                      tmdbValidationError ? 'border-red-500' : 'border-border/50'
                    }`}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={testTmdb}
                    disabled={loading.tmdbTest || loading.tmdb}
                    title="Test API key"
                  >
                    {loading.tmdbTest ? (
                      <RefreshCw size={14} className="spinning" />
                    ) : (
                      <Play size={14} />
                    )}
                    Test
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={connectTmdb}
                    disabled={loading.tmdb || loading.tmdbTest}
                  >
                    {loading.tmdb ? (
                      <RefreshCw size={14} className="spinning" />
                    ) : (
                      'Save'
                    )}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setShowTmdbInput(false);
                      setTmdbKey('');
                      setTmdbValidationError('');
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
                {tmdbValidationError && (
                  <span className="text-xs text-red-500">{tmdbValidationError}</span>
                )}
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowTmdbInput(true)}
              >
                <Key size={14} />
                Add Key
              </button>
            )
          ) : (
            !user?.tmdbConnected && (
              <span className="text-xs text-muted-foreground">Admin required to connect</span>
            )
          )}
        </div>
      </div>
    </>
  );
};

export default SettingsGeneral;
