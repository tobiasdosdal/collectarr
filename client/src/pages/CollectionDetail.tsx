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
  backdropPath?: string;
  rating?: number;
  ratingCount?: number;
  inEmby: boolean;
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
  addedAt: string;
  enrichmentStatus?: 'PENDING' | 'ENRICHED' | 'FAILED';
  enrichmentAttempts?: number;
  lastEnrichmentError?: string;
  enrichedAt?: string;
}

interface EnrichmentProgress {
  pending: number;
  enriched: number;
  failed: number;
  total: number;
  percentComplete: number;
}

interface ItemEnrichedEvent {
  itemId: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  ratingCount: number | null;
}

interface ItemFailedEvent {
  itemId: string;
  error: string | undefined;
  attempts: number;
}

interface ProgressEvent {
  collectionId: string;
  pending: number;
  enriched: number;
  failed: number;
  total: number;
  percentComplete: number;
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
  scheduleInfo?: ScheduleInfo | null;
  autoDownload?: boolean;
  lastSyncAt?: string | null;
}



interface Stats {
  total: number;
  inEmby: number;
  missing: number;
  percentInLibrary: number;
  lastSyncAt?: string | null;
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
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [savingAutoDownload, setSavingAutoDownload] = useState<boolean>(false);
   const pollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
   const hasAutoStartedPolling = useRef<boolean>(false);
   const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const [confirmAction, setConfirmAction] = useState<'deleteCollection' | 'deletePoster' | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgress>({
    pending: 0,
    enriched: 0,
    failed: 0,
    total: 0,
    percentComplete: 100,
  });
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const POLL_INTERVAL_MS = 1500;
  const MAX_IDLE_POLLS = 12;

  const startPolling = () => {
    if (!id || pollIntervalRef.current) return;

    setIsPolling(true);
    let noChangeCount = 0;
    let lastItemCount = collection?.items?.length || 0;
    const initialLastSyncAt = collection?.lastSyncAt || null;
    let pollInFlight = false;

    pollIntervalRef.current = setInterval(async () => {
      if (pollInFlight) return;
      pollInFlight = true;

      try {
        const latestStats = await api.getCollectionStats(id);
        setStats(latestStats);

        const currentItemCount = latestStats?.total || 0;
        const syncCompleted = Boolean(
          latestStats?.lastSyncAt && latestStats.lastSyncAt !== initialLastSyncAt
        );
        const itemCountChanged = currentItemCount !== lastItemCount;

        if (itemCountChanged || syncCompleted) {
          const updatedCollection = await api.getCollection(id);
          setCollection(updatedCollection);
          lastItemCount = updatedCollection.items?.length || currentItemCount;
          noChangeCount = 0;
        } else {
          noChangeCount++;
        }

        if (syncCompleted || noChangeCount >= MAX_IDLE_POLLS) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
          }
          setIsPolling(false);
          setRefreshing(false);
          loadStats();
        }
      } catch (err) {
        console.warn('Polling error:', err);
      } finally {
        pollInFlight = false;
      }
    }, POLL_INTERVAL_MS);
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

  useEffect(() => {
    if (!id) return;

    const connectSSE = () => {
      const eventSource = new EventSource(`/api/v1/collections/${id}/progress`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.addEventListener('item:enriched', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as ItemEnrichedEvent;
        setCollection((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === data.itemId
                ? {
                    ...item,
                    posterPath: data.posterPath || item.posterPath,
                    backdropPath: data.backdropPath || item.backdropPath,
                    rating: data.rating ?? item.rating,
                    ratingCount: data.ratingCount ?? item.ratingCount,
                    enrichmentStatus: 'ENRICHED' as const,
                    enrichedAt: new Date().toISOString(),
                  }
                : item
            ),
          };
        });
      });

      eventSource.addEventListener('item:failed', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as ItemFailedEvent;
        setCollection((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === data.itemId
                ? {
                    ...item,
                    enrichmentStatus: 'FAILED' as const,
                    enrichmentAttempts: data.attempts,
                    lastEnrichmentError: data.error,
                  }
                : item
            ),
          };
        });
      });

      eventSource.addEventListener('progress', (event: MessageEvent) => {
        const data = JSON.parse(event.data) as ProgressEvent;
        setEnrichmentProgress({
          pending: data.pending,
          enriched: data.enriched,
          failed: data.failed,
          total: data.total,
          percentComplete: data.percentComplete,
        });
      });

       eventSource.onerror = () => {
         setSseConnected(false);
         eventSource.close();
         eventSourceRef.current = null;
         reconnectTimeoutRef.current = setTimeout(connectSSE, 5000);
       };
    };

    connectSSE();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setSseConnected(false);
    };
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
      startPolling();
      loadDownloadServers();
    } catch (err: any) {
      addToast(`Failed to refresh: ${err.message}`, 'error');
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

  const handleAutoDownloadToggle = async (enabled: boolean): Promise<void> => {
    if (!collection) return;
    setSavingAutoDownload(true);
    try {
      await api.updateCollection(collection.id, { autoDownload: enabled });
      setCollection({ ...collection, autoDownload: enabled });
      addToast(
        enabled
          ? 'Auto-download enabled for this collection'
          : 'Auto-download disabled for this collection',
        'success'
      );
    } catch (err: any) {
      addToast(`Failed to update auto-download: ${err.message}`, 'error');
    } finally {
      setSavingAutoDownload(false);
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
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(collection.autoDownload)}
                  onChange={(event) => handleAutoDownloadToggle(event.target.checked)}
                  disabled={savingAutoDownload}
                  className="rounded border-border/50"
                />
                Auto-download missing items to Radarr/Sonarr
              </label>
              {savingAutoDownload && <Loader2 size={12} className="animate-spin" />}
            </div>
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
            {refreshing ? (
              <RefreshCw size={32} className="text-primary animate-spin" />
            ) : (
              <Film size={32} className="text-muted-foreground" />
            )}
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {refreshing ? 'Refreshing collection...' : 'No items in this collection'}
          </h3>
          <p className="text-muted-foreground mb-6">
            {refreshing ? 'Items will appear shortly' : 'Add items manually or refresh from the source'}
          </p>
          {!refreshing && (
            collection.sourceType === 'MANUAL' ? (
              <Button onClick={() => setShowAddModal(true)}>
                <Plus size={16} className="mr-2" />
                Add Item
              </Button>
            ) : (
              <Button onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw size={16} className="mr-2" />
                Refresh from Source
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          {enrichmentProgress.pending > 0 && enrichmentProgress.percentComplete < 100 && (
            <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex justify-between text-sm mb-2">
                <span className="flex items-center gap-2">
                  {sseConnected && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                  Enriching collection...
                </span>
                <span className="font-mono">{enrichmentProgress.enriched}/{enrichmentProgress.total}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${enrichmentProgress.percentComplete}%` }}
                />
              </div>
              {enrichmentProgress.failed > 0 && (
                <div className="mt-2 text-xs text-amber-500 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {enrichmentProgress.failed} items failed to enrich
                </div>
              )}
            </div>
          )}
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
                ) : item.enrichmentStatus === 'PENDING' ? (
                  <div className="item-poster-placeholder animate-pulse flex flex-col items-center justify-center">
                    <Loader2 size={32} className="animate-spin text-primary" />
                    <span className="text-xs mt-2 text-muted-foreground">Loading...</span>
                  </div>
                ) : item.enrichmentStatus === 'FAILED' ? (
                  <div className="item-poster-placeholder flex flex-col items-center justify-center bg-red-500/10">
                    <XCircle size={32} className="text-red-400" />
                    <span className="text-xs mt-2 text-red-400">Failed</span>
                    {item.enrichmentAttempts && (
                      <span className="text-[10px] text-red-400/70">
                        {item.enrichmentAttempts} attempts
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="item-poster-placeholder">
                    {item.mediaType === 'MOVIE' ? <Film size={32} /> : <Tv size={32} />}
                  </div>
                )}
                {item.enrichmentStatus === 'PENDING' && !item.posterPath && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/80 text-primary-foreground">
                    Enriching...
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
        </>
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

export default CollectionDetail;
