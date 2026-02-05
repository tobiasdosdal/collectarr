import { FC, useState, useEffect } from 'react';
import { useToast } from '../../components/Toast';
import { ConfirmationModal } from '../../components/ConfirmationModal';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  ExternalLink,
  Image,
} from 'lucide-react';

type ConfirmAction =
  | 'regenerateApiKey'
  | 'disconnectTrakt'
  | 'disconnectMdblist'
  | 'disconnectTmdb'
  | 'regeneratePosters'
  | null;

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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [includeCustomPosters, setIncludeCustomPosters] = useState<boolean>(false);

  const copyApiKey = async (): Promise<void> => {
    await navigator.clipboard.writeText(user?.apiKey || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateApiKey = async (): Promise<void> => {
    setLoading(prev => ({ ...prev, apiKey: true }));
    try {
      await api.regenerateApiKey();
      await refreshUser();
      addToast('API key regenerated successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to regenerate: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, apiKey: false }));
      setConfirmAction(null);
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
    setLoading(prev => ({ ...prev, trakt: true }));
    try {
      await api.disconnectTrakt();
      await refreshUser();
      addToast('Trakt disconnected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to disconnect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, trakt: false }));
      setConfirmAction(null);
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
    setLoading(prev => ({ ...prev, mdblist: true }));
    try {
      await api.disconnectMdblist();
      await refreshUser();
      addToast('MDBList disconnected successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to disconnect: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, mdblist: false }));
      setConfirmAction(null);
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
      setConfirmAction(null);
    }
  };

  const regeneratePosters = async (): Promise<void> => {
    setLoading(prev => ({ ...prev, posterRegen: true }));
    try {
      const result = await api.regenerateCollectionPosters(includeCustomPosters);
      if (result.success) {
        addToast(
          `Poster regeneration complete. Generated ${result.generated}, skipped ${result.skipped}, failed ${result.failed}.`,
          'success'
        );
      } else {
        addToast('Poster regeneration failed', 'error');
      }
    } catch (err: any) {
      addToast(`Poster regeneration failed: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, posterRegen: false }));
      setConfirmAction(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* API Key Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0">API Key</h2>
            <p className="text-sm text-muted-foreground m-0">Use this key to authenticate API requests</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={user?.apiKey || ''}
            readOnly
            className="flex-1 px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-foreground font-mono text-sm"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={copyApiKey}
            aria-label="Copy API key"
            className="px-3"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmAction('regenerateApiKey')}
            disabled={loading.apiKey}
            aria-label="Regenerate API key"
            className="px-3"
          >
            <RefreshCw size={16} className={loading.apiKey ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Connected Services Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <LinkIcon size={18} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0">Connected Services</h2>
            <p className="text-sm text-muted-foreground m-0">Link your accounts to import collections</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Trakt */}
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">Trakt</span>
                {user?.traktConnected && (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-0 text-xs">
                    <CheckCircle size={10} className="mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground m-0">
                {user?.traktConnected
                  ? 'Sync your watchlist, collections and lists'
                  : 'Connect to sync your Trakt watchlist and lists'}
              </p>
            </div>
            {user?.isAdmin ? (
              user?.traktConnected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('disconnectTrakt')}
                  disabled={loading.trakt}
                >
                  <Unlink size={14} className="mr-1" />
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={connectTrakt}
                  disabled={loading.trakt}
                >
                  <LinkIcon size={14} className="mr-1" />
                  Connect
                </Button>
              )
            ) : (
              !user?.traktConnected && (
                <span className="text-xs text-muted-foreground">Admin required</span>
              )
            )}
          </div>

          {/* MDBList */}
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">MDBList</span>
                {user?.mdblistConnected && (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-0 text-xs">
                    <CheckCircle size={10} className="mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground m-0">
                {user?.mdblistConnected
                  ? 'Browse and sync curated MDBList lists'
                  : 'Add your API key to browse MDBList'}
              </p>
            </div>
            {user?.isAdmin ? (
              user?.mdblistConnected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('disconnectMdblist')}
                  disabled={loading.mdblist}
                >
                  <Unlink size={14} className="mr-1" />
                  Disconnect
                </Button>
              ) : showMdblistInput ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={mdblistKey}
                    onChange={(e) => setMdblistKey(e.target.value)}
                    placeholder="API Key"
                    className="px-3 py-1.5 bg-secondary border border-border/50 rounded-lg text-foreground text-sm w-40"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={testMdblist}
                    disabled={loading.mdblistTest || loading.mdblist}
                  >
                    {loading.mdblistTest ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} className="mr-1" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    onClick={connectMdblist}
                    disabled={loading.mdblist || loading.mdblistTest}
                  >
                    {loading.mdblist ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowMdblistInput(false);
                      setMdblistKey('');
                    }}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowMdblistInput(true)}
                >
                  <Key size={14} className="mr-1" />
                  Add Key
                </Button>
              )
            ) : (
              !user?.mdblistConnected && (
                <span className="text-xs text-muted-foreground">Admin required</span>
              )
            )}
          </div>

          {/* TMDB */}
          <div className="flex items-start justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">TMDB</span>
                {user?.tmdbConnected && (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-0 text-xs">
                    <CheckCircle size={10} className="mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground m-0">
                {user?.tmdbConnected ? (
                  <>
                    Enhanced metadata and poster images
                    {tmdbApiKeyMasked && (
                      <span className="block font-mono text-xs mt-1">Key: {tmdbApiKeyMasked}</span>
                    )}
                  </>
                ) : (
                  <>
                    Add your API key for enhanced metadata.{' '}
                    <a
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Get API key <ExternalLink size={10} />
                    </a>
                    <span className="block text-xs mt-1">Use the v4 Read Access Token (starts with "eyJ")</span>
                  </>
                )}
              </p>
            </div>
            {user?.isAdmin ? (
              user?.tmdbConnected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmAction('disconnectTmdb')}
                  disabled={loading.tmdb}
                >
                  <Unlink size={14} className="mr-1" />
                  Disconnect
                </Button>
              ) : showTmdbInput ? (
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tmdbKey}
                      onChange={(e) => {
                        setTmdbKey(e.target.value);
                        setTmdbValidationError('');
                      }}
                      placeholder="eyJ... (v4 token)"
                      className={`px-3 py-1.5 bg-secondary border rounded-lg text-foreground text-sm w-48 ${
                        tmdbValidationError ? 'border-red-500' : 'border-border/50'
                      }`}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={testTmdb}
                      disabled={loading.tmdbTest || loading.tmdb}
                    >
                      {loading.tmdbTest ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} className="mr-1" />
                      )}
                      Test
                    </Button>
                    <Button
                      size="sm"
                      onClick={connectTmdb}
                      disabled={loading.tmdb || loading.tmdbTest}
                    >
                      {loading.tmdb ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowTmdbInput(false);
                        setTmdbKey('');
                        setTmdbValidationError('');
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  {tmdbValidationError && (
                    <span className="text-xs text-red-500">{tmdbValidationError}</span>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowTmdbInput(true)}
                >
                  <Key size={14} className="mr-1" />
                  Add Key
                </Button>
              )
            ) : (
              !user?.tmdbConnected && (
                <span className="text-xs text-muted-foreground">Admin required</span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Posters Section */}
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Image size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0">Posters</h2>
            <p className="text-sm text-muted-foreground m-0">Regenerate collection posters from TMDB</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeCustomPosters}
              onChange={(event) => setIncludeCustomPosters(event.target.checked)}
              className="rounded border-border/50"
            />
            Include collections with custom posters
          </label>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => setConfirmAction('regeneratePosters')}
              disabled={loading.posterRegen}
            >
              {loading.posterRegen ? (
                <RefreshCw size={14} className="animate-spin mr-1" />
              ) : (
                <RefreshCw size={14} className="mr-1" />
              )}
              Regenerate Posters
            </Button>
            <span className="text-xs text-muted-foreground">
              This will refresh generated posters for all collections.
            </span>
          </div>
        </div>
      </div>

      {confirmAction === 'regenerateApiKey' && (
        <ConfirmationModal
          title="Regenerate API Key"
          message="Are you sure you want to regenerate your API key? External integrations using this key will need to be updated."
          confirmText="Regenerate"
          isDangerous
          onConfirm={regenerateApiKey}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'disconnectTrakt' && (
        <ConfirmationModal
          title="Disconnect Trakt"
          message="Are you sure you want to disconnect Trakt? Your Trakt collections will stop syncing."
          confirmText="Disconnect"
          isDangerous
          onConfirm={disconnectTrakt}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'disconnectMdblist' && (
        <ConfirmationModal
          title="Disconnect MDBList"
          message="Are you sure you want to disconnect MDBList?"
          confirmText="Disconnect"
          isDangerous
          onConfirm={disconnectMdblist}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'disconnectTmdb' && (
        <ConfirmationModal
          title="Disconnect TMDB"
          message="Are you sure you want to disconnect TMDB?"
          confirmText="Disconnect"
          isDangerous
          onConfirm={disconnectTmdb}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'regeneratePosters' && (
        <ConfirmationModal
          title="Regenerate Posters"
          message={
            includeCustomPosters
              ? 'This will regenerate posters for all collections, including custom posters. Continue?'
              : 'This will regenerate posters for collections using generated posters. Continue?'
          }
          confirmText="Regenerate"
          isDangerous
          onConfirm={regeneratePosters}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
};

export default SettingsGeneral;
