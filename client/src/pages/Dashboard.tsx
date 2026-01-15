import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderOpen,
  Film,
  Tv,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Server,
  ArrowRight,
} from 'lucide-react';

interface Collection {
  id: string;
  name: string;
  sourceType: string;
  itemCount: number;
  posterPath?: string;
  lastSyncAt?: string;
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
    // Only load data when user is authenticated
    if (!authLoading && user) {
      loadData();
    } else if (!authLoading && !user) {
      // User not authenticated, stop loading
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
      
      // Ensure we have an array
      const collections = Array.isArray(collectionsData) ? collectionsData : [];
      const logs = Array.isArray(logsData) ? logsData : [];
      
      console.log('Dashboard data loaded:', { 
        collectionsCount: collections.length, 
        logsCount: logs.length 
      });
      
      setCollections(collections);
      setSyncLogs(logs);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        response: err.response,
      });
      // Set empty arrays on error to prevent crashes
      setCollections([]);
      setSyncLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const totalItems = collections.reduce((sum, c) => {
    const count = typeof c.itemCount === 'number' ? c.itemCount : 0;
    return sum + count;
  }, 0);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your media collections and sync status</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid animate-stagger">
        <div className="stat-card">
          <div className="stat-label">Collections</div>
          <div className="stat-value text-primary">{collections.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Items</div>
          <div className="stat-value">{totalItems.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Trakt</div>
          <div className="mt-2">
            {user?.traktConnected ? (
              <span className="badge badge-success">
                <CheckCircle size={12} className="mr-1.5" />
                Connected
              </span>
            ) : (
              <span className="badge badge-warning">Not Connected</span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">MDBList</div>
          <div className="mt-2">
            {user?.mdblistConnected ? (
              <span className="badge badge-success">
                <CheckCircle size={12} className="mr-1.5" />
                Connected
              </span>
            ) : (
              <span className="badge badge-warning">Not Connected</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-6">
        <div className="card-header">
          <h2>Quick Actions</h2>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link to="/collections" className="btn btn-primary">
            <FolderOpen size={16} strokeWidth={1.5} />
            View Collections
          </Link>
          <Link to="/browse" className="btn btn-secondary">
            <Film size={16} strokeWidth={1.5} />
            Browse Sources
          </Link>
          <Link to="/settings" className="btn btn-secondary">
            <RefreshCw size={16} strokeWidth={1.5} />
            Configure Sync
          </Link>
        </div>
      </div>

      {/* Recent Collections */}
      <div className="card mb-6">
        <div className="card-header">
          <h2>Recent Collections</h2>
          <Link to="/collections" className="btn btn-ghost btn-sm">View All</Link>
        </div>
        {collections.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-xl bg-secondary/50 flex items-center justify-center mb-4">
              <FolderOpen size={28} className="text-muted-foreground" />
            </div>
            <h3>No collections yet</h3>
            <p>Create your first collection to get started</p>
            <Link to="/browse" className="btn btn-primary mt-4">
              Browse Sources
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {collections.slice(0, 4).map((collection) => (
              <Link
                key={collection.id}
                to={`/collections/${collection.id}`}
                className="group block rounded-xl overflow-hidden bg-secondary/30 border border-border/30 hover:border-primary/30 transition-all"
              >
                <div className="h-28 overflow-hidden bg-secondary">
                  {collection.posterPath ? (
                    <img
                      src={collection.posterPath}
                      alt={`${collection.name} poster`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No poster
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {collection.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span>{collection.itemCount} items</span>
                    <span className="opacity-50">·</span>
                    <span>{collection.sourceType}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Sync Activity */}
      <div className="card">
        <div className="card-header">
          <h2>Recent Sync Activity</h2>
          <Link to="/settings" className="btn btn-ghost btn-sm">View All</Link>
        </div>
        {syncLogs.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-xl bg-secondary/50 flex items-center justify-center mb-4">
              <RefreshCw size={28} className="text-muted-foreground" />
            </div>
            <h3>No sync activity</h3>
            <p>Sync logs will appear here once collections are synced</p>
          </div>
        ) : (
          <div className="space-y-3">
            {syncLogs.map((log) => {
              const matchRate = log.itemsTotal > 0 
                ? Math.round((log.itemsMatched / log.itemsTotal) * 100) 
                : 0;
              
              return (
                <div key={log.id} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border/30 bg-secondary/20 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 mt-0.5">
                      {log.status === 'SUCCESS' && <CheckCircle size={18} className="text-green-500" />}
                      {log.status === 'PARTIAL' && <Clock size={18} className="text-yellow-500" />}
                      {log.status === 'FAILED' && <XCircle size={18} className="text-red-500" />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm m-0 truncate">
                          {log.collectionName || 'Unknown Collection'}
                        </h3>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5 flex-wrap">
                        {log.embyServerName && (
                          <span className="flex items-center gap-1">
                            <Server size={12} />
                            {log.embyServerName}
                          </span>
                        )}
                        <span className="font-mono">
                          {log.itemsMatched}/{log.itemsTotal} items ({matchRate}%)
                        </span>
                        {log.itemsFailed > 0 && (
                          <span className="text-yellow-500">
                            {log.itemsFailed} failed
                          </span>
                        )}
                      </div>
                      
                      <span className="text-xs text-muted-foreground/60">
                        {new Date(log.startedAt).toLocaleString()}
                      </span>
                    </div>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
