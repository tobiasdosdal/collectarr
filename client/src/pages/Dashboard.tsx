import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderOpen,
  Film,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Server,
  ArrowRight,
  Sparkles,
  Play,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SampleCollectionsGrid from '../components/SampleCollectionsGrid';

interface Collection {
  id: string;
  name: string;
  sourceType: string;
  itemCount: number;
  posterPath?: string;
  lastSyncAt?: string;
  embyServerIds?: string[];
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
  startedAt: string;
  completedAt?: string;
}

const Dashboard: FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!authLoading && user) {
      loadData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [collectionsData, logsData] = await Promise.all([
        api.getCollections(),
        api.getSyncLogs(5),
      ]);

      const collections = Array.isArray(collectionsData) ? collectionsData : [];
      const logs = Array.isArray(logsData) ? logsData : [];

      setCollections(collections);
      setSyncLogs(logs);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setCollections([]);
      setSyncLogs([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8 pb-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-secondary to-secondary border border-primary/20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative px-6 py-8 md:px-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles size={18} />
                <span className="text-sm font-medium">Welcome back</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Your Media Hub
              </h1>
              <p className="text-muted-foreground max-w-md">
                Manage your collections and keep your media library in sync
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/browse">
                  <Plus size={18} />
                  Add Collection
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="gap-2">
                <Link to="/collections">
                  <Play size={18} />
                  View All
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Collections Section */}
      {collections.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-secondary/30">
            <div className="inline-flex p-4 rounded-full bg-primary/10 mb-4">
              <FolderOpen size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Start Your Collection</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Import from Trakt, MDBList, or IMDB to create your first collection
            </p>
            <Button asChild size="lg">
              <Link to="/browse">
                <Plus size={18} className="mr-2" />
                Browse Sources
              </Link>
            </Button>
          </div>
          <SampleCollectionsGrid onCollectionAdded={loadData} compact />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your Collections</h2>
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/collections">
                View All
                <ArrowRight size={14} />
              </Link>
            </Button>
          </div>

          {/* Collections Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {collections.slice(0, 4).map((collection, index) => (
              <Link
                key={collection.id}
                to={`/collections/${collection.id}`}
                className="group block"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary border border-border group-hover:border-primary/50 transition-all shadow-lg">
                  {collection.posterPath ? (
                    <img
                      src={collection.posterPath}
                      alt={collection.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-secondary to-background">
                      <Film size={32} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  {index === 0 && (
                    <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-[10px]">
                      Latest
                    </Badge>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                      {collection.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-white/70">
                      <span>{collection.itemCount} items</span>
                      <span>•</span>
                      <span className="capitalize">{collection.sourceType}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            <Link
              to="/browse"
              className="group flex flex-col items-center justify-center aspect-[2/3] rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/50 transition-all"
            >
              <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors mb-3">
                <Plus size={24} className="text-primary" />
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                Add New
              </span>
            </Link>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Activity</h2>
          {syncLogs.length > 0 && (
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/settings">
                View All
                <ArrowRight size={14} />
              </Link>
            </Button>
          )}
        </div>

        {syncLogs.length === 0 ? (
          <div className="flex items-center gap-4 p-6 rounded-xl bg-secondary/30 border border-border">
            <div className="p-3 rounded-full bg-secondary">
              <RefreshCw size={20} className="text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No sync activity yet</p>
              <p className="text-sm text-muted-foreground">
                Sync logs will appear here once you sync a collection to Emby
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {syncLogs.map((log, index) => {
              const matchRate = log.itemsTotal > 0
                ? Math.round((log.itemsMatched / log.itemsTotal) * 100)
                : 0;

              return (
                <div
                  key={log.id}
                  className={`flex items-center justify-between gap-4 p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors ${
                    index !== syncLogs.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-full ${
                      log.status === 'SUCCESS' ? 'bg-green-500/20' :
                      log.status === 'PARTIAL' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                    }`}>
                      {log.status === 'SUCCESS' && <CheckCircle size={16} className="text-green-500" />}
                      {log.status === 'PARTIAL' && <Clock size={16} className="text-yellow-500" />}
                      {log.status === 'FAILED' && <XCircle size={16} className="text-red-500" />}
                    </div>

                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {log.collectionName || 'Unknown Collection'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {log.embyServerName && (
                          <>
                            <Server size={10} />
                            <span className="truncate">{log.embyServerName}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>{new Date(log.startedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">{matchRate}%</p>
                      <p className="text-xs text-muted-foreground">
                        {log.itemsMatched}/{log.itemsTotal}
                      </p>
                    </div>
                    {log.collectionId && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <Link to={`/collections/${log.collectionId}`}>
                          <ArrowRight size={14} />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
