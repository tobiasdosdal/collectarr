import { FC, useEffect, useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
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
  ArrowUpDown,
  Download,
  Server,
  ChevronDown,
  Loader2,
  Settings,
  Clock,
} from 'lucide-react';

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

interface Collection {
  id: string;
  name: string;
  sourceType: string;
  posterPath?: string;
  items: CollectionItem[];
  refreshIntervalHours?: number;
  syncToEmbyOnRefresh?: boolean;
  removeFromEmby?: boolean;
  embyServerIds?: string[];
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

  // Start polling when refresh button is clicked
  const startPolling = () => {
    if (pollIntervalRef.current) return; // Already polling

    setIsPolling(true);
    let noChangeCount = 0;
    let lastItemCount = collection?.items?.length || 0;
    const pollStartTime = Date.now();
    const minPollDuration = 120000; // Keep polling for at least 2 minutes

    pollIntervalRef.current = setInterval(async () => {
      try {
        // Use the api client which includes auth token
        const updatedCollection = await api.getCollection(id!);
        setCollection(updatedCollection);

        const currentItemCount = updatedCollection.items?.length || 0;
        const elapsedTime = Date.now() - pollStartTime;

        if (currentItemCount === lastItemCount) {
          noChangeCount++;
          // Stop polling only if:
          // 1. Minimum poll duration has passed AND
          // 2. No new items for 15+ seconds (15 consecutive polls)
          if (elapsedTime >= minPollDuration && noChangeCount >= 15 && pollIntervalRef.current) {
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
      loadCollection().then(() => {
        // Auto-start polling if collection is empty and not manual (newly created)
        // This ensures real-time updates when navigating to a new collection
      });
      loadStats();
      loadSyncLogs();
      loadDownloadServers();
      loadEmbyServers();
    }
  }, [id]);

  // Auto-start polling for newly created collections (empty, non-manual)
  useEffect(() => {
    if (collection && !loading && collection.sourceType !== 'MANUAL' && collection.items?.length === 0) {
      startPolling();
    }
  }, [collection?.id, collection?.items?.length, loading]);

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
    if (!confirm(`Delete collection "${collection?.name}"?`)) return;

    try {
      await api.deleteCollection(id!);
      navigate('/collections');
      addToast("Collection deleted successfully", "success");
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, "error");
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
    if (!confirm('Remove: collection poster?')) return;
    try {
      await api.deleteCollectionPoster(id!);
      setCollection({
        ...collection!,
        posterPath: undefined,
      });
      addToast("Poster removed successfully", "success");
    } catch (err: any) {
      addToast(`Failed to delete poster: ${err.message}`, "error");
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
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!collection) {
    return null;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link to="/collections" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} />
          </Link>
          <div
            className="collection-poster-wrapper group w-20 h-28 rounded-xl overflow-hidden bg-secondary border border-border/50 relative shrink-0 cursor-pointer transition-all hover:border-primary/50"
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
                  className="poster-remove-btn absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive/90 border-none text-white flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePoster();
                  }}
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                {uploadingPoster ? (
                  <div className="spinner w-5 h-5" />
                ) : (
                  <>
                    <Image size={20} />
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
          <div>
            <h1>{collection.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {collection.sourceType} • {collection.items?.length || 0} items
              {isPolling && (
                <span className="ml-2 text-primary animate-pulse">• Updating...</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {collection.sourceType === 'MANUAL' && (
            <button className="btn btn-secondary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} strokeWidth={1.5} />
              Add Item
            </button>
          )}
          {collection.sourceType !== 'MANUAL' && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh collection from source"
            >
              <RefreshCw size={14} className={refreshing ? 'spinning' : ''} strokeWidth={1.5} />
              Refresh
            </button>
          )}
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            title="Collection settings"
          >
            <Settings size={14} strokeWidth={1.5} />
            Settings
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSyncToEmby}
            disabled={syncing}
            title="Sync this collection to all Emby servers"
          >
            <Upload size={14} className={syncing ? 'spinning' : ''} strokeWidth={1.5} />
            Sync to Emby
          </button>
          <button className="btn btn-sm btn-danger" onClick={handleDelete} title="Delete this collection">
            <Trash2 size={14} strokeWidth={1.5} />
            Delete
          </button>
        </div>
      </div>

      {(syncResult || lastSyncLog) && (
        <div className={`alert ${(syncResult?.success || lastSyncLog?.status !== 'FAILED') ? 'alert-success' : 'alert-error'} mb-6`}>
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
            <span className="flex items-center gap-2 flex-wrap">
              <span>
                Last sync: <span className="font-mono font-medium">{lastSyncLog.itemsMatched}/{lastSyncLog.itemsTotal}</span> items matched
                {lastSyncLog.status === 'PARTIAL' && ' (some items not found in library)'}
              </span>
              {lastSyncLog.completedAt && (
                <span className="text-muted-foreground text-xs">
                  {new Date(lastSyncLog.completedAt).toLocaleDateString()} {new Date(lastSyncLog.completedAt).toLocaleTimeString()}
                </span>
              )}
            </span>
          ) : null}
        </div>
      )}

      {/* Stats and Filter Tabs */}
      {stats && collection.items?.length > 0 && (
        <div className="card mb-6 p-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-2xl font-bold text-primary">
                  {stats.inEmby}
                </span>
                <span className="text-muted-foreground ml-1">
                  / {stats.total} in library
                </span>
              </div>
              <div className="bg-secondary/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <div className="progress-bar w-24">
                  <div
                    className={`progress-bar-fill ${stats.percentInLibrary === 100 ? 'complete' : ''}`}
                    style={{ width: `${stats.percentInLibrary}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{stats.percentInLibrary}%</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="tabs mb-0">
                <button
                  className={`tab ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All ({stats.total})
                </button>
                <button
                  className={`tab ${filter === 'inLibrary' ? 'active' : ''}`}
                  onClick={() => setFilter('inLibrary')}
                >
                  <Check size={12} className="mr-1" />
                  In Library ({stats.inEmby})
                </button>
                <button
                  className={`tab ${filter === 'missing' ? 'active' : ''}`}
                  onClick={() => setFilter('missing')}
                >
                  <AlertTriangle size={12} className="mr-1" />
                  Missing ({stats.missing})
                </button>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown size={14} className="text-muted-foreground" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm cursor-pointer"
                >
                  <option value="addedAt">Recently Added</option>
                  <option value="title">Title</option>
                  <option value="year">Year</option>
                  <option value="rating">Rating</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {collection.items?.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6">
              <Film size={36} className="text-muted-foreground" />
            </div>
            <h3>No items in this collection</h3>
            <p>Add items manually or refresh from the source</p>
            {collection.sourceType === 'MANUAL' ? (
              <button className="btn btn-primary mt-4" onClick={() => setShowAddModal(true)}>
                Add Item
              </button>
            ) : (
              <button className="btn btn-primary mt-4" onClick={handleRefresh}>
                Refresh from Source
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="items-grid">
          {collection.items
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
            setCollection(updated);
            setShowSettingsModal(false);
          }}
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
      });
      onAdded(item);
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
          <h2>Add Item</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message mb-4">{error}</div>}

          <div className="form-group">
            <label>Type</label>
            <div className="tabs mb-0">
              <button
                type="button"
                className={`tab ${mediaType === 'MOVIE' ? 'active' : ''}`}
                onClick={() => setMediaType('MOVIE')}
              >
                <Film size={14} className="mr-2" />
                Movie
              </button>
              <button
                type="button"
                className={`tab ${mediaType === 'SHOW' ? 'active' : ''}`}
                onClick={() => setMediaType('SHOW')}
              >
                <Tv size={14} className="mr-2" />
                TV Show
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Movie or show title"
              required
            />
          </div>

          <div className="form-group">
            <label>Year (optional)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2024"
              min="1900"
              max="2100"
            />
          </div>

          <div className="form-group">
            <label>IMDb ID (optional)</label>
            <input
              type="text"
              value={imdbId}
              onChange={(e) => setImdbId(e.target.value)}
              placeholder="tt1234567"
            />
          </div>

          <div className="form-group">
            <label>TMDb ID (optional)</label>
            <input
              type="text"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              placeholder="12345"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Item'}
            </button>
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
  const [refreshTime, setRefreshTime] = useState<string>('00:00');
  const [syncToEmbyOnRefresh, setSyncToEmbyOnRefresh] = useState<boolean>(collection.syncToEmbyOnRefresh ?? true);
  const [removeFromEmby, setRemoveFromEmby] = useState<boolean>(collection.removeFromEmby ?? false);
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
        syncToEmbyOnRefresh,
        removeFromEmby,
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Collection Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message mb-4">{error}</div>}

          <div className="form-group">
            <label className="flex items-center gap-2">
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

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CollectionDetail;