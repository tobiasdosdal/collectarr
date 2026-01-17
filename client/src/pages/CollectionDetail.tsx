import { FC, useEffect, useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ConfirmationModal } from '../components/ConfirmationModal';
import api from '../api/client';
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Film,
  Tv,
  Plus,
  X,
  Upload,
  Check,
  AlertTriangle,
  Image,
  Download,
  Server,
  ChevronDown,
  Loader2,
  Settings,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CollectionItem {
  id: string;
  title: string;
  year?: number;
  mediaType: 'MOVIE' | 'SHOW';
  posterPath?: string;
  rating?: number;
  inEmby: boolean;
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
  addedAt: string;
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

interface EmbyServer {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
}

interface ScheduleInfo {
  cronExpression: string;
  lastRun: string | null;
  nextRun: string | null;
}

interface Collection {
  id: string;
  name: string;
  sourceType: string;
  posterPath?: string;
  items: CollectionItem[];
  refreshIntervalHours?: number;
  refreshTime?: string | null;
  syncToEmbyOnRefresh?: boolean;
  removeFromEmby?: boolean;
  deleteFromEmbyOnDelete?: boolean;
  embyServerIds?: string[];
  scheduleInfo?: ScheduleInfo | null;
}

interface CollectionSettingsModalProps {
  collection: Collection;
  embyServers: EmbyServer[];
  onClose: () => void;
  onSaved: (updated: Collection) => void;
}

interface Stats {
  total: number;
  inEmby: number;
  missing: number;
  percentInLibrary: number;
}

interface SyncResult {
  success: boolean;
  matched?: number;
  total?: number;
  status?: string;
  error?: string;
}

interface SyncLog {
  id: string;
  status: string;
  itemsMatched: number;
  itemsTotal: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

interface AddItemModalProps {
  collectionId: string;
  onClose: () => void;
  onAdded: (item: CollectionItem) => void;
}

const CollectionDetail: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncLog, setLastSyncLog] = useState<SyncLog | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'inLibrary' | 'missing'>('all');
  const [sortBy, setSortBy] = useState<'addedAt' | 'title' | 'year' | 'rating'>('addedAt');
  const [stats, setStats] = useState<Stats | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState<boolean>(false);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const [radarrServers, setRadarrServers] = useState<RadarrServer[]>([]);
  const [sonarrServers, setSonarrServers] = useState<SonarrServer[]>([]);
  const [embyServers, setEmbyServers] = useState<EmbyServer[]>([]);
  const [requestingItems, setRequestingItems] = useState<Record<string, boolean>>({});
  const [requestedItems, setRequestedItems] = useState<Record<string, 'success' | 'error'>>({});
  const [itemsInRadarr, setItemsInRadarr] = useState<Set<string>>(new Set());
  const [itemsInSonarr, setItemsInSonarr] = useState<Set<string>>(new Set());
  const [loadingDownloadStatus, setLoadingDownloadStatus] = useState<boolean>(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const hasAutoStartedPolling = useRef<boolean>(false);
  const [confirmAction, setConfirmAction] = useState<'deleteCollection' | 'deletePoster' | null>(null);

  // Start polling when refresh button is clicked
  const startPolling = () => {
    if (pollIntervalRef.current) return; // Already polling

    setIsPolling(true);
    let noChangeCount = 0;
    let lastItemCount = collection?.items?.length || 0;

    pollIntervalRef.current = setInterval(async () => {
      try {
        // Use the api client which includes auth token
        const updatedCollection = await api.getCollection(id!);
        setCollection(updatedCollection);

        const currentItemCount = updatedCollection.items?.length || 0;

        if (currentItemCount === lastItemCount) {
          noChangeCount++;
          // Stop polling after 5 seconds of no changes
          if (noChangeCount >= 5 && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
            setIsPolling(false);
          }
        } else {
          noChangeCount = 0; // Reset counter if items were added
          lastItemCount = currentItemCount;
        }
      } catch (err) {
        // Silently fail - this is just polling for updates
        console.warn('Polling error:', err);
      }
    }, 1000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (id) {
      // Reset auto-start flag when navigating to a new collection
      hasAutoStartedPolling.current = false;
      loadCollection();
      loadStats();
      loadSyncLogs();
      loadDownloadServers();
      loadEmbyServers();
    }
  }, [id]);

  // Auto-start polling for newly created collections (empty, non-manual) - only once
  useEffect(() => {
    if (
      collection &&
      !loading &&
      !hasAutoStartedPolling.current &&
      collection.sourceType !== 'MANUAL' &&
      (collection.items?.length || 0) === 0
    ) {
      hasAutoStartedPolling.current = true;
      startPolling();
    }
  }, [collection?.id, loading]);

  const loadEmbyServers = async (): Promise<void> => {
    try {
      const servers = await api.getEmbyServers();
      setEmbyServers(servers as EmbyServer[]);
    } catch (err) {
      console.error('Failed to load Emby servers:', err);
    }
  };

  const loadDownloadServers = async (): Promise<void> => {
    setLoadingDownloadStatus(true);
    try {
      const [radarr, sonarr] = await Promise.all([
        api.getRadarrServers(),
        api.getSonarrServers(),
      ]);
      setRadarrServers(radarr);
      setSonarrServers(sonarr);

      // Load movies/series from servers to check what's already there
      const radarrTmdbIds = new Set<string>();
      const sonarrTvdbIds = new Set<string>();

      // Load in parallel for speed
      const loadPromises: Promise<void>[] = [];

      for (const server of radarr) {
        loadPromises.push(
          api.getRadarrMovies(server.id)
            .then((movies: { tmdbId: number }[]) => {
              movies.forEach((m) => {
                if (m.tmdbId) radarrTmdbIds.add(String(m.tmdbId));
              });
            })
            .catch((err) => {
              console.error(`Failed to load movies from Radarr server ${server.name}:`, err);
            })
        );
      }

      for (const server of sonarr) {
        loadPromises.push(
          api.getSonarrSeries(server.id)
            .then((series: { tvdbId: number }[]) => {
              series.forEach((s) => {
                if (s.tvdbId) sonarrTvdbIds.add(String(s.tvdbId));
              });
            })
            .catch((err) => {
              console.error(`Failed to load series from Sonarr server ${server.name}:`, err);
            })
        );
      }

      await Promise.all(loadPromises);

      setItemsInRadarr(radarrTmdbIds);
      setItemsInSonarr(sonarrTvdbIds);
    } catch (err) {
      console.error('Failed to load download servers:', err);
    } finally {
      setLoadingDownloadStatus(false);
    }
  };

  const loadCollection = async (): Promise<void> => {
    try {
      const data = await api.getCollection(id!);
      setCollection(data);
    } catch (err) {
      console.error('Failed to load collection:', err);
      navigate('/collections');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async (): Promise<void> => {
    try {
      const data = await api.getCollectionStats(id!);
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadSyncLogs = async (): Promise<void> => {
    try {
      const logs = await api.getSyncLogs(1, id!);
      if (logs && logs.length > 0) {
        setLastSyncLog(logs[0]);
      }
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    }
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      // Start polling immediately to see items being added in real-time
      startPolling();
      await api.refreshCollection(id!);
      // Don't wait for loadCollection - polling handles updates
      loadDownloadServers(); // Reload Radarr/Sonarr data in background
    } catch (err: any) {
      addToast(`Failed to refresh: ${err.message}`, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncToEmby = async (): Promise<void> => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncCollectionToEmby(id!);
      if (result.results?.length > 0) {
        const res = result.results[0];
        setSyncResult({
          success: res.status !== 'FAILED',
          matched: res.itemsMatched,
          total: res.itemsTotal,
          status: res.status,
        });
      }
      await loadCollection();
      await loadStats();
      await loadSyncLogs();
    } catch (err: any) {
      setSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      await api.deleteCollection(id!);
      navigate('/collections');
      addToast("Collection deleted successfully", "success");
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, "error");
    } finally {
      setConfirmAction(null);
    }
  };

  const handleRemoveItem = async (itemId: string): Promise<void> => {
    try {
      await api.removeCollectionItem(id!, itemId);
      setCollection({
        ...collection!,
        items: collection!.items.filter((i) => i.id !== itemId),
      });
      addToast("Item removed successfully", "success");
    } catch (err: any) {
      addToast(`Failed to remove item: ${err.message}`, "error");
    }
  };

  const handlePosterUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPoster(true);
    try {
      const result = await api.uploadCollectionPoster(id!, file);
      setCollection({
        ...collection!,
        posterPath: result.posterPath + '?t=' + Date.now(),
      });
      addToast("Poster uploaded successfully", "success");
    } catch (err: any) {
      addToast(`Failed to upload poster: ${err.message}`, "error");
    } finally {
      setUploadingPoster(false);
      if (posterInputRef.current) {
        posterInputRef.current.value = '';
      }
    }
  };

  const handleDeletePoster = async (): Promise<void> => {
    try {
      await api.deleteCollectionPoster(id!);
      setCollection({
        ...collection!,
        posterPath: undefined,
      });
      addToast("Poster removed successfully", "success");
    } catch (err: any) {
      addToast(`Failed to delete poster: ${err.message}`, "error");
    } finally {
      setConfirmAction(null);
    }
  };

  const handleRequestItem = async (
    item: CollectionItem,
    serverId: string,
    serverType: 'radarr' | 'sonarr'
  ): Promise<void> => {
    const itemKey = item.id;
    setRequestingItems((prev) => ({ ...prev, [itemKey]: true }));
    setOpenDropdown(null);

    try {
      if (serverType === 'radarr') {
        if (!item.tmdbId) {
          throw new Error('TMDb ID required for Radarr');
        }
        await api.addToRadarr(serverId, {
          tmdbId: parseInt(item.tmdbId, 10),
          title: item.title,
          year: item.year || new Date().getFullYear(),
        });
      } else {
        if (!item.tvdbId) {
          throw new Error('TVDb ID required for Sonarr');
        }
        await api.addToSonarr(serverId, {
          tvdbId: parseInt(item.tvdbId, 10),
          title: item.title,
          year: item.year || new Date().getFullYear(),
        });
      }
      setRequestedItems((prev) => ({ ...prev, [itemKey]: 'success' }));
      // Add to the in-library set so it persists across refreshes
      if (serverType === 'radarr' && item.tmdbId) {
        setItemsInRadarr((prev) => new Set(prev).add(item.tmdbId!));
      } else if (serverType === 'sonarr' && item.tvdbId) {
        setItemsInSonarr((prev) => new Set(prev).add(item.tvdbId!));
      }
      addToast(`"${item.title}" added to ${serverType === 'radarr' ? 'Radarr' : 'Sonarr'}`, "success");
    } catch (err: any) {
      const isAlreadyExists = err.message?.includes('already exists');
      if (isAlreadyExists) {
        setRequestedItems((prev) => ({ ...prev, [itemKey]: 'success' }));
      } else {
        setRequestedItems((prev) => ({ ...prev, [itemKey]: 'error' }));
      }
      const errorMessage = isAlreadyExists
        ? `"${item.title}" is already in ${serverType === 'radarr' ? 'Radarr' : 'Sonarr'}`
        : `Failed to add: ${err.message}`;
      addToast(errorMessage, isAlreadyExists ? 'info' : 'error');
    } finally {
      setRequestingItems((prev) => ({ ...prev, [itemKey]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!collection) {
    return null;
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        {/* Poster and Info */}
        <div className="flex gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" asChild className="shrink-0 mt-1">
            <Link to="/collections">
              <ArrowLeft size={18} />
            </Link>
          </Button>

          <div
            className="group w-24 h-36 rounded-xl overflow-hidden bg-secondary border border-border relative shrink-0 cursor-pointer transition-all hover:border-primary/50"
            onClick={() => posterInputRef.current?.click()}
            title={collection.posterPath ? 'Change poster' : 'Upload poster'}
          >
            {collection.posterPath ? (
              <>
                <img
                  src={collection.posterPath}
                  alt={collection.name}
                  className="w-full h-full object-cover"
                />
                <button
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmAction('deletePoster');
                  }}
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-gradient-to-br from-secondary to-background">
                {uploadingPoster ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Image size={24} />
                    <span className="text-[10px] mt-1">Add Poster</span>
                  </>
                )}
              </div>
            )}
            <input
              ref={posterInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePosterUpload}
              className="hidden"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold truncate">{collection.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{collection.sourceType}</Badge>
              <span className="text-sm text-muted-foreground">
                {collection.items?.length || 0} items
              </span>
              {isPolling && (
                <span className="text-sm text-primary animate-pulse flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Updating...
                </span>
              )}
            </div>
            {collection.scheduleInfo?.nextRun && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock size={12} />
                Next refresh: {new Date(collection.scheduleInfo.nextRun).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {collection.sourceType === 'MANUAL' && (
            <Button variant="secondary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} className="mr-2" />
              Add Item
            </Button>
          )}
          {collection.sourceType !== 'MANUAL' && (
            <Button
              variant="secondary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowSettingsModal(true)}>
            <Settings size={16} className="mr-2" />
            Settings
          </Button>
          <Button onClick={handleSyncToEmby} disabled={syncing}>
            <Upload size={16} className={`mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync to Emby
          </Button>
          <Button variant="destructive" onClick={() => setConfirmAction('deleteCollection')}>
            <Trash2 size={16} className="mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Sync Result Alert */}
      {(syncResult || lastSyncLog) && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          (syncResult?.success || lastSyncLog?.status !== 'FAILED')
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {(syncResult?.success || lastSyncLog?.status !== 'FAILED') ? (
            <CheckCircle size={18} />
          ) : (
            <XCircle size={18} />
          )}
          {syncResult ? (
            syncResult.success ? (
              <span>
                Synced to Emby: <span className="font-mono font-medium">{syncResult.matched}/{syncResult.total}</span> items matched
                {syncResult.status === 'PARTIAL' && ' (some items not found in library)'}
              </span>
            ) : (
              <span>{syncResult.error || 'Sync failed'}</span>
            )
          ) : lastSyncLog ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                Last sync: <span className="font-mono font-medium">{lastSyncLog.itemsMatched}/{lastSyncLog.itemsTotal}</span> items matched
                {lastSyncLog.status === 'PARTIAL' && ' (some items not found)'}
              </span>
              {lastSyncLog.completedAt && (
                <span className="text-xs opacity-70">
                  {new Date(lastSyncLog.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Stats and Filters */}
      {stats && collection.items?.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-xl bg-secondary/30 border border-border">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.inEmby}<span className="text-muted-foreground font-normal">/{stats.total}</span></div>
              <div className="text-xs text-muted-foreground">in library</div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full transition-all ${stats.percentInLibrary === 100 ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${stats.percentInLibrary}%` }}
                />
              </div>
              <span className="text-sm font-medium">{stats.percentInLibrary}%</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-lg bg-secondary/50">
              <button
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                  filter === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilter('all')}
              >
                All ({stats.total})
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-1 ${
                  filter === 'inLibrary' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilter('inLibrary')}
              >
                <Check size={12} />
                In Library ({stats.inEmby})
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-1 ${
                  filter === 'missing' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilter('missing')}
              >
                <AlertTriangle size={12} />
                Missing ({stats.missing})
              </button>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-9 px-3 rounded-lg bg-secondary border border-border text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="addedAt">Recently Added</option>
              <option value="title">Title</option>
              <option value="year">Year</option>
              <option value="rating">Rating</option>
            </select>
          </div>
        </div>
      )}

      {collection.items?.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-secondary/30">
          <div className="inline-flex p-4 rounded-full bg-secondary mb-4">
            <Film size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No items in this collection</h3>
          <p className="text-muted-foreground mb-6">Add items manually or refresh from the source</p>
          {collection.sourceType === 'MANUAL' ? (
            <Button onClick={() => setShowAddModal(true)}>
              <Plus size={16} className="mr-2" />
              Add Item
            </Button>
          ) : (
            <Button onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh from Source
            </Button>
          )}
        </div>
      ) : (
        <div className="items-grid">
          {(collection.items || [])
            .filter((item) => {
              if (filter === 'inLibrary') return item.inEmby;
              if (filter === 'missing') return !item.inEmby;
              return true;
            })
            .sort((a, b) => {
              switch (sortBy) {
                case 'title':
                  return (a.title || '').localeCompare(b.title || '');
                case 'year':
                  return (b.year || 0) - (a.year || 0);
                case 'rating':
                  return (b.rating || 0) - (a.rating || 0);
                case 'addedAt':
                default:
                  return new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime();
              }
            })
            .map((item) => (
            <div key={item.id} className={`item-card ${item.inEmby ? 'in-library' : 'missing'}`}>
              <div className="item-poster">
                {item.posterPath ? (
                  <img src={item.posterPath} alt={item.title} loading="lazy" />
                ) : (
                  <div className="item-poster-placeholder">
                    {item.mediaType === 'MOVIE' ? <Film size={32} /> : <Tv size={32} />}
                  </div>
                )}
                {item.rating && (
                  <div className="item-rating">
                    ★ {item.rating.toFixed(1)}
                  </div>
                )}
                <div className={`item-status ${item.inEmby ? 'status-in-library' : 'status-missing'}`}>
                  {item.inEmby ? <Check size={12} /> : <AlertTriangle size={12} />}
                </div>
                <button
                  className="item-remove"
                  onClick={() => handleRemoveItem(item.id)}
                  title="Remove from collection"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="item-info">
                <h4 className="item-title">{item.title}</h4>
                <div className="item-meta">
                  <span>{item.year || 'N/A'}</span>
                  <span className="item-type">{item.mediaType === 'MOVIE' ? 'Movie' : 'TV'}</span>
                </div>
                <div className="item-links">
                  {item.imdbId && (
                    <a
                      href={`https://imdb.com/title/${item.imdbId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      IMDb
                    </a>
                  )}
                  {item.tmdbId && (
                    <a
                      href={`https://themoviedb.org/${item.mediaType === 'MOVIE' ? 'movie' : 'tv'}/${item.tmdbId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      TMDb
                    </a>
                  )}
                </div>
                {/* Request button for missing items */}
                {!item.inEmby && (
                  item.mediaType === 'MOVIE' ? (
                    radarrServers.length > 0 && item.tmdbId && (
                      <div className="item-request mt-2 relative">
                        {loadingDownloadStatus ? (
                          <div className="flex items-center justify-center gap-2 py-1.5 px-2 bg-secondary/50 text-muted-foreground rounded-lg text-xs">
                            <Loader2 size={12} className="animate-spin" />
                            Checking...
                          </div>
                        ) : (requestedItems[item.id] === 'success' || itemsInRadarr.has(item.tmdbId)) ? (
                          <div className="flex items-center justify-center gap-1 py-1.5 px-2 bg-amber-500/10 text-amber-500 rounded-lg text-xs font-medium">
                            <Check size={12} />
                            In Radarr
                          </div>
                        ) : requestingItems[item.id] ? (
                          <div className="flex items-center justify-center gap-2 py-1.5 px-2 bg-primary/10 text-primary rounded-lg text-xs font-medium">
                            <Loader2 size={12} className="animate-spin" />
                            Adding to Radarr...
                          </div>
                        ) : radarrServers.length === 1 ? (
                          <button
                            className="btn btn-sm btn-secondary w-full"
                            onClick={() => handleRequestItem(item, radarrServers[0].id, 'radarr')}
                          >
                            <Download size={12} className="mr-1" />
                            Add to Radarr
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm btn-secondary w-full"
                              onClick={() => setOpenDropdown(openDropdown === item.id ? null : item.id)}
                            >
                              <Download size={12} className="mr-1" />
                              Add to Radarr
                              <ChevronDown size={12} className="ml-auto" />
                            </button>
                            {openDropdown === item.id && (
                              <div className="dropdown-menu absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                                {radarrServers.map((server) => (
                                  <button
                                    key={server.id}
                                    className="dropdown-item w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2"
                                    onClick={() => handleRequestItem(item, server.id, 'radarr')}
                                  >
                                    <Server size={12} />
                                    {server.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  ) : (
                    sonarrServers.length > 0 && item.tvdbId && (
                      <div className="item-request mt-2 relative">
                        {loadingDownloadStatus ? (
                          <div className="flex items-center justify-center gap-2 py-1.5 px-2 bg-secondary/50 text-muted-foreground rounded-lg text-xs">
                            <Loader2 size={12} className="animate-spin" />
                            Checking...
                          </div>
                        ) : (requestedItems[item.id] === 'success' || itemsInSonarr.has(item.tvdbId)) ? (
                          <div className="flex items-center justify-center gap-1 py-1.5 px-2 bg-sky-500/10 text-sky-500 rounded-lg text-xs font-medium">
                            <Check size={12} />
                            In Sonarr
                          </div>
                        ) : requestingItems[item.id] ? (
                          <div className="flex items-center justify-center gap-2 py-1.5 px-2 bg-primary/10 text-primary rounded-lg text-xs font-medium">
                            <Loader2 size={12} className="animate-spin" />
                            Adding to Sonarr...
                          </div>
                        ) : sonarrServers.length === 1 ? (
                          <button
                            className="btn btn-sm btn-secondary w-full"
                            onClick={() => handleRequestItem(item, sonarrServers[0].id, 'sonarr')}
                          >
                            <Download size={12} className="mr-1" />
                            Add to Sonarr
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm btn-secondary w-full"
                              onClick={() => setOpenDropdown(openDropdown === item.id ? null : item.id)}
                            >
                              <Download size={12} className="mr-1" />
                              Add to Sonarr
                              <ChevronDown size={12} className="ml-auto" />
                            </button>
                            {openDropdown === item.id && (
                              <div className="dropdown-menu absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                                {sonarrServers.map((server) => (
                                  <button
                                    key={server.id}
                                    className="dropdown-item w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2"
                                    onClick={() => handleRequestItem(item, server.id, 'sonarr')}
                                  >
                                    <Server size={12} />
                                    {server.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddItemModal
          collectionId={id!}
          onClose={() => setShowAddModal(false)}
          onAdded={(item) => {
            setCollection({
              ...collection,
              items: [...collection.items, item],
            });
            setShowAddModal(false);
          }}
        />
      )}

      {showSettingsModal && collection && (
        <CollectionSettingsModal
          collection={collection}
          embyServers={embyServers}
          onClose={() => setShowSettingsModal(false)}
          onSaved={(updated) => {
            // Merge updated settings with existing collection, preserving items
            setCollection({ ...collection, ...updated, items: collection.items });
            setShowSettingsModal(false);
          }}
        />
      )}

      {confirmAction === 'deleteCollection' && (
        <ConfirmationModal
          title="Delete Collection"
          message={`Are you sure you want to delete "${collection?.name}"? This action cannot be undone.`}
          confirmText="Delete"
          isDangerous
          onConfirm={handleDelete}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'deletePoster' && (
        <ConfirmationModal
          title="Remove Poster"
          message="Are you sure you want to remove the collection poster?"
          confirmText="Remove"
          isDangerous
          onConfirm={handleDeletePoster}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
};

// ... existing modal components (AddItemModal, CollectionSettingsModal) ...
// But I need to include them in the Write operation to not lose them.
// Since I'm using Write tool which overwrites the whole file, I need to make sure I include EVERYTHING.
// I will just copy the rest of the file content from the previous read.

const AddItemModal: FC<AddItemModalProps> = ({ collectionId, onClose, onAdded }) => {
  const [mediaType, setMediaType] = useState<'MOVIE' | 'SHOW'>('MOVIE');
  const [title, setTitle] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [imdbId, setImdbId] = useState<string>('');
  const [tmdbId, setTmdbId] = useState<string>('');
  const [tvdbId, setTvdbId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const item = await api.addCollectionItem(collectionId, {
        mediaType,
        title,
        year: year ? parseInt(year, 10) : null,
        imdbId: imdbId || null,
        tmdbId: tmdbId || null,
        tvdbId: tvdbId || null,
      });
      onAdded(item);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Add Item</h2>
          <button className="p-2 rounded-lg hover:bg-secondary transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mediaType === 'MOVIE'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMediaType('MOVIE')}
              >
                <Film size={16} />
                Movie
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mediaType === 'SHOW'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMediaType('SHOW')}
              >
                <Tv size={16} />
                TV Show
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Movie or show title"
              required
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Year (optional)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2024"
              min="1900"
              max="2100"
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">IMDb ID (optional)</label>
            <input
              type="text"
              value={imdbId}
              onChange={(e) => setImdbId(e.target.value)}
              placeholder="tt1234567"
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">TMDb ID (optional)</label>
            <input
              type="text"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              placeholder="12345"
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          {mediaType === 'SHOW' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">TVDb ID (required for Sonarr)</label>
              <input
                type="text"
                value={tvdbId}
                onChange={(e) => setTvdbId(e.target.value)}
                placeholder="12345"
                className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Adding...' : 'Add Item'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CollectionSettingsModal: FC<CollectionSettingsModalProps> = ({ collection, embyServers, onClose, onSaved }) => {
  const [refreshIntervalValue, setRefreshIntervalValue] = useState<string>(
    collection.refreshIntervalHours ? String(
      collection.refreshIntervalHours >= 24 && collection.refreshIntervalHours % 24 === 0
        ? collection.refreshIntervalHours / 24
        : collection.refreshIntervalHours
    ) : '6'
  );
  const [refreshIntervalUnit, setRefreshIntervalUnit] = useState<'hours' | 'days'>(
    collection.refreshIntervalHours && collection.refreshIntervalHours >= 24 && collection.refreshIntervalHours % 24 === 0
      ? 'days'
      : 'hours'
  );
  const [refreshTime, setRefreshTime] = useState<string>(collection.refreshTime || '00:00');
  const [syncToEmbyOnRefresh, setSyncToEmbyOnRefresh] = useState<boolean>(collection.syncToEmbyOnRefresh ?? true);
  const [removeFromEmby, setRemoveFromEmby] = useState<boolean>(collection.removeFromEmby ?? false);
  const [deleteFromEmbyOnDelete, setDeleteFromEmbyOnDelete] = useState<boolean>(collection.deleteFromEmbyOnDelete ?? false);
  const [selectedEmbyServerIds, setSelectedEmbyServerIds] = useState<string[]>(
    collection.embyServerIds || embyServers.map(s => s.id)
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const refreshIntervalHours = refreshIntervalUnit === 'days'
        ? parseInt(refreshIntervalValue, 10) * 24
        : parseInt(refreshIntervalValue, 10);

      const updated = await api.updateCollection(collection.id, {
        refreshIntervalHours,
        refreshTime,
        syncToEmbyOnRefresh,
        removeFromEmby,
        deleteFromEmbyOnDelete,
        embyServerIds: selectedEmbyServerIds,
      });
      onSaved(updated as Collection);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleEmbyServer = (serverId: string): void => {
    if (selectedEmbyServerIds.includes(serverId)) {
      setSelectedEmbyServerIds(selectedEmbyServerIds.filter(id => id !== serverId));
    } else {
      setSelectedEmbyServerIds([...selectedEmbyServerIds, serverId]);
    }
  };

  const selectAllServers = (): void => {
    setSelectedEmbyServerIds(embyServers.map(s => s.id));
  };

  const deselectAllServers = (): void => {
    setSelectedEmbyServerIds([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-semibold">Collection Settings</h2>
          <button className="p-2 rounded-lg hover:bg-secondary transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Clock size={14} className="text-muted-foreground" />
              Refresh Interval
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              How often to refresh items from the source
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                value={refreshIntervalValue}
                onChange={(e) => setRefreshIntervalValue(e.target.value)}
                min="1"
                max={refreshIntervalUnit === 'hours' ? '720' : '30'}
                className="px-3 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                style={{ maxWidth: '100px' }}
              />
              <select
                value={refreshIntervalUnit}
                onChange={(e) => setRefreshIntervalUnit(e.target.value as 'hours' | 'days')}
                className="px-3 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-foreground text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Preferred refresh time (24-hour format)</label>
              <div className="time-input">
                <input
                  type="number"
                  value={refreshTime.split(':')[0]}
                  onChange={(e) => {
                    const hours = Math.max(0, Math.min(23, parseInt(e.target.value) || 0)).toString().padStart(2, '0');
                    setRefreshTime(`${hours}:${refreshTime.split(':')[1]}`);
                  }}
                  min="0"
                  max="23"
                  className="px-3 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-16"
                  placeholder="00"
                />
                <span className="text-muted-foreground font-medium">:</span>
                <input
                  type="number"
                  value={refreshTime.split(':')[1]}
                  onChange={(e) => {
                    const minutes = Math.max(0, Math.min(59, parseInt(e.target.value) || 0)).toString().padStart(2, '0');
                    setRefreshTime(`${refreshTime.split(':')[0]}:${minutes}`);
                  }}
                  min="0"
                  max="59"
                  className="px-3 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-16"
                  placeholder="00"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">e.g., 14:30 = 2:30 PM, 00:00 = Midnight</p>
            </div>
          </div>

          <div className="form-group mt-5">
            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={syncToEmbyOnRefresh}
                onChange={(e) => setSyncToEmbyOnRefresh(e.target.checked)}
                className="w-5 h-5 rounded border-border accent-primary cursor-pointer"
              />
              <div>
                <span className="font-medium">Auto sync to Emby on refresh</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically sync collection to Emby after items are refreshed
                </p>
              </div>
            </label>
          </div>

          <div className="form-group mt-3">
            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={removeFromEmby}
                onChange={(e) => setRemoveFromEmby(e.target.checked)}
                className="w-5 h-5 rounded border-border accent-primary cursor-pointer"
              />
              <div>
                <span className="font-medium">Remove items from Emby collection</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Remove items that are no longer in the source list from the Emby collection
                </p>
              </div>
            </label>
          </div>

          <div className="form-group mt-3">
            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={deleteFromEmbyOnDelete}
                onChange={(e) => setDeleteFromEmbyOnDelete(e.target.checked)}
                className="w-5 h-5 rounded border-border accent-primary cursor-pointer"
              />
              <div>
                <span className="font-medium">Delete from Emby when collection is deleted</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Also delete the collection from Emby when you delete it from Collectarr
                </p>
              </div>
            </label>
          </div>

          {embyServers.length > 0 && (
            <div className="form-group mt-5">
              <label className="flex items-center gap-2">
                <Server size={14} className="text-muted-foreground" />
                Sync to Emby Servers
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Select which Emby servers to sync this collection to
              </p>
              
              {embyServers.length > 1 && (
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={selectAllServers}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={deselectAllServers}
                  >
                    Deselect All
                  </button>
                </div>
              )}
              
              <div className="space-y-2">
                {embyServers.map((server) => (
                  <label
                    key={server.id}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-secondary/30"
                    style={{
                      background: selectedEmbyServerIds.includes(server.id)
                        ? 'hsl(var(--primary) / 0.1)'
                        : 'hsl(var(--secondary) / 0.3)',
                      border: selectedEmbyServerIds.includes(server.id)
                        ? '1px solid hsl(var(--primary) / 0.3)'
                        : '1px solid hsl(var(--border) / 0.3)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmbyServerIds.includes(server.id)}
                      onChange={() => toggleEmbyServer(server.id)}
                      className="w-5 h-5 rounded border-border accent-primary cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{server.name}</span>
                        {server.isDefault && (
                          <span className="badge badge-info text-xs px-2 py-0.5">Default</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                        {server.url}
                      </p>
                    </div>
                    {selectedEmbyServerIds.includes(server.id) && (
                      <Check size={16} className="text-primary flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
              
              {selectedEmbyServerIds.length === 0 && (
                <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  No servers selected. Collection will not sync to any Emby server.
                </p>
              )}
            </div>
          )}

          {embyServers.length === 0 && (
            <div className="mt-5 p-4 rounded-lg bg-secondary/30 border border-border/30">
              <p className="text-sm text-muted-foreground">
                No Emby servers configured. <a href="/settings" className="text-primary hover:underline">Add a server</a> to enable sync.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CollectionDetail;