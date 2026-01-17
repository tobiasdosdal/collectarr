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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your media collections and sync status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collections</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{collections.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            <Film className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trakt</CardTitle>
            <div className={`h-2 w-2 rounded-full ${user?.traktConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
          </CardHeader>
          <CardContent>
            {user?.traktConnected ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle size={12} />
                Connected
              </Badge>
            ) : (
              <Badge variant="warning" className="gap-1">
                Not Connected
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MDBList</CardTitle>
            <div className={`h-2 w-2 rounded-full ${user?.mdblistConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
          </CardHeader>
          <CardContent>
            {user?.mdblistConnected ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle size={12} />
                Connected
              </Badge>
            ) : (
              <Badge variant="warning" className="gap-1">
                Not Connected
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button asChild>
            <Link to="/collections">
              <FolderOpen className="mr-2 h-4 w-4" />
              View Collections
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/browse">
              <Film className="mr-2 h-4 w-4" />
              Browse Sources
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/settings">
              <RefreshCw className="mr-2 h-4 w-4" />
              Configure Sync
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent Collections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Recent Collections</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/collections">View All</Link>
          </Button>
        </div>
        
        {collections.length === 0 ? (
          <div className="space-y-6">
            <Card className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 rounded-full bg-secondary/50 mb-4">
                <FolderOpen size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No collections yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">Create your first collection or try a sample collection to explore features</p>
              <Button asChild>
                <Link to="/browse">Browse Sources</Link>
              </Button>
            </Card>
            <SampleCollectionsGrid onCollectionAdded={loadData} compact />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {collections.slice(0, 4).map((collection) => (
              <Link
                key={collection.id}
                to={`/collections/${collection.id}`}
                className="group block"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary mb-3 border border-border/50 group-hover:border-primary/50 transition-colors">
                  {collection.posterPath ? (
                    <img
                      src={collection.posterPath}
                      alt={`${collection.name} poster`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No poster
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                    {collection.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{collection.itemCount} items</span>
                    <span>•</span>
                    <span>{collection.sourceType}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Sync Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Sync Activity</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {syncLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 rounded-full bg-secondary/50 mb-3">
                <RefreshCw size={24} className="text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-1">No sync activity</h3>
              <p className="text-sm text-muted-foreground">Sync logs will appear here once collections are synced</p>
            </div>
          ) : (
            <div className="space-y-4">
              {syncLogs.map((log) => {
                const matchRate = log.itemsTotal > 0 
                  ? Math.round((log.itemsMatched / log.itemsTotal) * 100) 
                  : 0;
                
                return (
                  <div key={log.id} className="flex items-start justify-between gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {log.status === 'SUCCESS' && <CheckCircle size={18} className="text-green-500" />}
                        {log.status === 'PARTIAL' && <Clock size={18} className="text-yellow-500" />}
                        {log.status === 'FAILED' && <XCircle size={18} className="text-red-500" />}
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {log.collectionName || 'Unknown Collection'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5 flex-wrap">
                          {log.embyServerName && (
                            <span className="flex items-center gap-1">
                              <Server size={12} />
                              {log.embyServerName}
                            </span>
                          )}
                          <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded">
                            {log.itemsMatched}/{log.itemsTotal} items ({matchRate}%)
                          </span>
                          {log.itemsFailed > 0 && (
                            <span className="text-yellow-500 font-medium">
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
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link to={`/collections/${log.collectionId}`} title="View collection">
                          <ArrowRight size={14} />
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;