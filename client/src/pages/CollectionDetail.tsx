import { FC, useEffect, useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Toast } from '../components/Toast';
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

interface Collection {
  id: string;
  name: string;
  sourceType: string;
  posterPath?: string;
  items: CollectionItem[];
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
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncLog, setLastSyncLog] = useState<SyncLog | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'inLibrary' | 'missing'>('all');
  const [sortBy, setSortBy] = useState<'addedAt' | 'title' | 'year' | 'rating'>('addedAt');
  const [stats, setStats] = useState<Stats | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState<boolean>(false);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const [radarrServers, setRadarrServers] = useState<RadarrServer[]>([]);
  const [sonarrServers, setSonarrServers] = useState<SonarrServer[]>([]);
  const [requestingItems, setRequestingItems] = useState<Record<string, boolean>>({});
  const [requestedItems, setRequestedItems] = useState<Record<string, 'success' | 'error'>>({});
  const [itemsInRadarr, setItemsInRadarr] = useState<Set<string>>(new Set());
  const [itemsInSonarr, setItemsInSonarr] = useState<Set<string>>(new Set());
  const [loadingDownloadStatus, setLoadingDownloadStatus] = useState<boolean>(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadCollection();
      loadStats();
      loadSyncLogs();
      loadDownloadServers();
    }
  }, [id]);

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
      await api.refreshCollection(id!);
      await Promise.all([
        loadCollection(),
        loadDownloadServers(), // Reload Radarr/Sonarr data too
      ]);
    } catch (err: any) {
      <Toast message={`Failed to refresh: ${err.message}`} type="error" />;
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
      <Toast message="Collection deleted successfully" type="success" />;
    } catch (err: any) {
      <Toast message={`Failed to delete: ${err.message}`} type="error" />;
    }
  };

  const handleRemoveItem = async (itemId: string): Promise<void> => {
    try {
      await api.removeCollectionItem(id!, itemId);
      setCollection({
        ...collection!,
        items: collection!.items.filter((i) => i.id !== itemId),
      });
      <Toast message="Item removed successfully" type="success" />;
    } catch (err: any) {
      <Toast message={`Failed to remove item: ${err.message}`} type="error" />;
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
      <Toast message="Poster uploaded successfully" type="success" />;
    } catch (err: any) {
      <Toast message={`Failed to upload poster: ${err.message}`} type="error" />;
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
      <Toast message="Poster removed successfully" type="success" />;
    } catch (err: any) {
      <Toast message={`Failed to delete poster: ${err.message}`} type="error" />;
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
      <Toast message={`"${item.title}" added to ${serverType === 'radarr' ? 'Radarr' : 'Sonarr'}`} type="success" />;
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
      <Toast message={errorMessage} type={isAlreadyExists ? 'info' : 'error'} />;
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
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {collection.sourceType === 'MANUAL' && (
            <button className="btn btn-secondary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} strokeWidth={1.5} />
              Add Item
            </button>
          )}
          {collection.sourceType !== 'MANUAL' && (
            <button
              className="btn btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} strokeWidth={1.5} />
              Refresh
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSyncToEmby}
            disabled={syncing}
            title="Sync this collection to all Emby servers"
          >
            <Upload size={16} className={syncing ? 'spinning' : ''} strokeWidth={1.5} />
            Sync to Emby
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            <Trash2 size={16} strokeWidth={1.5} />
            Delete
          </button>
        </div>
      </div>

      {(syncResult || lastSyncLog) && (
        <div className={`alert ${(syncResult?.success || lastSyncLog?.status !== 'FAILED') ? 'alert-success' : 'alert-error'} mb-6`}>
          {syncResult ? (
            <span>
              Synced to Emby: <span className="font-mono font-medium">{syncResult.matched}/{syncResult.total}</span> items matched
              {syncResult.status === 'PARTIAL' && ' (some items not found in library)'}
            </span>
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
          ) : (
            <span>{syncResult?.error || 'Sync failed'}</span>
          )}
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
    </div>
  );
};

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

export default CollectionDetail;
