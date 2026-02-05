import { FC, useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  Search,
  Database,
  TrendingUp,
  List,
  Heart,
  Plus,
  X,
  Film,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MDBListItem {
  id: string;
  name: string;
  description?: string;
  items: number;
  user_name?: string;
}

interface TraktList {
  id?: string;
  traktId?: string;
  slug?: string;
  name: string;
  description?: string;
  itemCount?: number;
  user?: string;
}

interface TraktItem {
  title: string;
  mediaType: string;
  year: string;
}

interface AddFromSourceModalProps {
  source: string;
  sourceId?: string | null;
  sourceName: string;
  onClose: () => void;
}

const Browse: FC = () => {
  const [activeTab, setActiveTab] = useState<'mdblist' | 'trakt'>('mdblist');

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Browse Sources</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import collections from MDBList or Trakt
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'mdblist'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
          }`}
          onClick={() => setActiveTab('mdblist')}
        >
          <Database size={16} />
          MDBList
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'trakt'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
          }`}
          onClick={() => setActiveTab('trakt')}
        >
          <TrendingUp size={16} />
          Trakt
        </button>
      </div>

      {activeTab === 'mdblist' && <MDBListBrowser />}
      {activeTab === 'trakt' && <TraktBrowser />}
    </div>
  );
};

const MDBListBrowser: FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lists, setLists] = useState<MDBListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedList, setSelectedList] = useState<MDBListItem | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    loadTopLists();
  }, []);

  const loadTopLists = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await api.getTopMdblistLists();
      setLists(data.lists || []);
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadTopLists();
      return;
    }

    setLoading(true);
    try {
      const data = await api.searchMdblistLists(searchQuery);
      setLists(data.lists || []);
    } catch (err) {
      console.error('Failed to search:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user?.mdblistConnected) {
    return (
      <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-secondary/30">
        <div className="inline-flex p-4 rounded-full bg-secondary mb-4">
          <Database size={32} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">MDBList not connected</h3>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          Connect your MDBList API key in settings to browse and import lists
        </p>
        <Button asChild>
          <Link to="/settings">
            <Settings size={16} className="mr-2" />
            Go to Settings
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch}>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search MDBList lists..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No lists found
        </div>
      ) : (
        <div className="grid gap-3">
          {lists.map((list) => (
            <div
              key={list.id}
              className="group flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/50 hover:bg-secondary transition-all cursor-pointer"
              onClick={() => setSelectedList(list)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium truncate group-hover:text-primary transition-colors">
                    {list.name}
                  </h4>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {list.description || 'No description'}
                </p>
              </div>
              <div className="flex items-center gap-4 ml-4 shrink-0">
                <div className="text-right min-w-[80px]">
                  <div className="text-sm font-medium">{list.items} items</div>
                  <div className="text-xs text-muted-foreground">by {list.user_name || 'Unknown'}</div>
                </div>
                <Button size="sm" variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedList && (
        <AddFromSourceModal
          source="MDBLIST"
          sourceId={String(selectedList.id)}
          sourceName={selectedList.name}
          onClose={() => setSelectedList(null)}
        />
      )}
    </div>
  );
};

const TraktBrowser: FC = () => {
  const [view, setView] = useState<'my-lists' | 'watchlist' | 'popular'>('my-lists');
  const [lists, setLists] = useState<TraktList[]>([]);
  const [items, setItems] = useState<TraktItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedList, setSelectedList] = useState<TraktList | null>(null);
  const [selectedSource, setSelectedSource] = useState<{ type: string; name: string } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.traktConnected) {
      loadContent();
    }
  }, [view, user?.traktConnected]);

  const loadContent = async (): Promise<void> => {
    setLoading(true);
    setLists([]);
    setItems([]);

    try {
      switch (view) {
        case 'my-lists':
          const myLists = await api.getTraktLists();
          setLists(myLists.lists || []);
          break;
        case 'watchlist':
          const watchlist = await api.getTraktWatchlist();
          setItems(watchlist.items || []);
          break;
        case 'popular':
          const popular = await api.getPopularTraktLists();
          setLists(popular.lists || []);
          break;
      }
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user?.traktConnected) {
    return (
      <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-secondary/30">
        <div className="inline-flex p-4 rounded-full bg-secondary mb-4">
          <TrendingUp size={32} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Trakt not connected</h3>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          Connect your Trakt account in settings to browse your lists
        </p>
        <Button asChild>
          <Link to="/settings">
            <Settings size={16} className="mr-2" />
            Go to Settings
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 p-1 rounded-lg bg-secondary/50 w-fit">
        <button
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
            view === 'my-lists'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setView('my-lists')}
        >
          <List size={14} />
          My Lists
        </button>
        <button
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
            view === 'watchlist'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setView('watchlist')}
        >
          <Heart size={14} />
          Watchlist
        </button>
        <button
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
            view === 'popular'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setView('popular')}
        >
          <TrendingUp size={14} />
          Popular
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'watchlist' ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between p-4 bg-secondary/50 border-b border-border">
            <div className="flex items-center gap-2">
              <Heart size={18} className="text-primary" />
              <h3 className="font-medium">Your Watchlist</h3>
              <Badge variant="secondary">{items.length} items</Badge>
            </div>
            <Button
              size="sm"
              onClick={() => setSelectedSource({ type: 'TRAKT_WATCHLIST', name: 'Trakt Watchlist' })}
            >
              <Plus size={14} className="mr-1" />
              Add as Collection
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Your watchlist is empty
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.slice(0, 20).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <Film size={14} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.year}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">{item.mediaType}</Badge>
                </div>
              ))}
              {items.length > 20 && (
                <div className="px-4 py-3 text-center text-sm text-muted-foreground bg-secondary/30">
                  Showing 20 of {items.length} items
                </div>
              )}
            </div>
          )}
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-border bg-secondary/30">
          <List size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No lists found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {lists.map((list) => (
            <div
              key={list.id || list.traktId}
              className="group flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/50 hover:bg-secondary transition-all cursor-pointer"
              onClick={() => setSelectedList(list)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium truncate group-hover:text-primary transition-colors">
                    {list.name}
                  </h4>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {list.description || 'No description'}
                </p>
              </div>
              <div className="flex items-center gap-4 ml-4 shrink-0">
                <div className="text-right min-w-[80px]">
                  <div className="text-sm font-medium">{list.itemCount || '?'} items</div>
                  {list.user && (
                    <div className="text-xs text-muted-foreground">by {list.user}</div>
                  )}
                </div>
                <Button size="sm" variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedList && (
        <AddFromSourceModal
          source="TRAKT_LIST"
          sourceId={String(selectedList.id || selectedList.traktId || selectedList.slug)}
          sourceName={selectedList.name}
          onClose={() => setSelectedList(null)}
        />
      )}

      {selectedSource && (
        <AddFromSourceModal
          source={selectedSource.type}
          sourceId={null}
          sourceName={selectedSource.name}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
};

const AddFromSourceModal: FC<AddFromSourceModalProps> = ({ source, sourceId, sourceName, onClose }) => {
  const [name, setName] = useState<string>(sourceName);
  const [autoDownload, setAutoDownload] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        name,
        sourceType: source,
        sourceId: sourceId || undefined,
        autoDownload,
      };
      const collection = await api.createCollection(payload);
      navigate(`/collections/${collection.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Add Collection</h2>
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

          <div className="p-4 rounded-xl bg-secondary/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                {source.includes('TRAKT') ? (
                  <TrendingUp size={18} className="text-primary" />
                ) : (
                  <Database size={18} className="text-primary" />
                )}
              </div>
              <div>
                <p className="font-medium">{sourceName}</p>
                <Badge variant="secondary" className="mt-1 text-xs">{source}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Collection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              required
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoDownload}
              onChange={(event) => setAutoDownload(event.target.checked)}
              className="rounded border-border/50"
            />
            Auto-download missing items to Radarr/Sonarr
          </label>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Creating...' : 'Create Collection'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Browse;
