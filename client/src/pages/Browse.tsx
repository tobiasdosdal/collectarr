import { FC, useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

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
    <div>
      <div className="page-header">
        <h1>Browse Sources</h1>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'mdblist' ? 'active' : ''}`}
          onClick={() => setActiveTab('mdblist')}
        >
          <Database size={16} style={{ marginRight: '8px' }} />
          MDBList
        </button>
        <button
          className={`tab ${activeTab === 'trakt' ? 'active' : ''}`}
          onClick={() => setActiveTab('trakt')}
        >
          <TrendingUp size={16} style={{ marginRight: '8px' }} />
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
      <div className="card">
        <div className="empty-state">
          <Database size={64} style={{ opacity: 0.3, marginBottom: '24px' }} />
          <h3>MDBList not connected</h3>
          <p style={{ marginBottom: '24px' }}>
            Connect your MDBList API key in settings to browse lists
          </p>
          <a href="/settings" className="btn btn-primary">
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSearch} className="search-box">
        <Search size={20} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search MDBList lists..."
        />
      </form>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : (
        <div className="source-list">
          {lists.map((list) => (
            <div
              key={list.id}
              className="source-item"
              onClick={() => setSelectedList(list)}
            >
              <div className="source-item-info">
                <h4>{list.name}</h4>
                <p>{list.description || 'No description'}</p>
              </div>
              <div className="source-item-meta">
                <div>{list.items} items</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  by {list.user_name || 'Unknown'}
                </div>
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
    </>
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
      <div className="card">
        <div className="empty-state">
          <TrendingUp size={64} style={{ opacity: 0.3, marginBottom: '24px' }} />
          <h3>Trakt not connected</h3>
          <p style={{ marginBottom: '24px' }}>
            Connect your Trakt account in settings to browse your lists
          </p>
          <a href="/settings" className="btn btn-primary">
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tabs" style={{ marginBottom: '24px' }}>
        <button
          className={`tab ${view === 'my-lists' ? 'active' : ''}`}
          onClick={() => setView('my-lists')}
        >
          <List size={16} style={{ marginRight: '8px' }} />
          My Lists
        </button>
        <button
          className={`tab ${view === 'watchlist' ? 'active' : ''}`}
          onClick={() => setView('watchlist')}
        >
          <Heart size={16} style={{ marginRight: '8px' }} />
          Watchlist
        </button>
        <button
          className={`tab ${view === 'popular' ? 'active' : ''}`}
          onClick={() => setView('popular')}
        >
          <TrendingUp size={16} style={{ marginRight: '8px' }} />
          Popular
        </button>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : view === 'watchlist' ? (
        <div className="card">
          <div className="card-header">
            <h3>Your Watchlist ({items.length} items)</h3>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setSelectedSource({ type: 'TRAKT_WATCHLIST', name: 'Trakt Watchlist' })}
            >
              <Plus size={16} />
              Add as Collection
            </button>
          </div>
          {items.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Your watchlist is empty</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 20).map((item, i) => (
                    <tr key={i}>
                      <td>{item.title}</td>
                      <td>{item.mediaType}</td>
                      <td>{item.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 20 && (
                <p style={{ padding: '16px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Showing 20 of {items.length} items
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="source-list">
          {lists.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <List size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                <h3>No lists found</h3>
              </div>
            </div>
          ) : (
            lists.map((list) => (
              <div
                key={list.id || list.traktId}
                className="source-item"
                onClick={() => setSelectedList(list)}
              >
                <div className="source-item-info">
                  <h4>{list.name}</h4>
                  <p>{list.description || 'No description'}</p>
                </div>
                <div className="source-item-meta">
                  <div>{list.itemCount || '?'} items</div>
                  {list.user && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      by {list.user}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
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
    </>
  );
};

const AddFromSourceModal: FC<AddFromSourceModalProps> = ({ source, sourceId, sourceName, onClose }) => {
  const [name, setName] = useState<string>(sourceName);
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
        refreshIntervalHours: 24,
        syncToEmbyOnRefresh: true,
        removeFromEmby: false,
        embyServerIds: [],
      };
      console.log('Creating collection with:', payload);
      const collection = await api.createCollection(payload);

      // Backend automatically triggers background refresh for non-MANUAL collections
      // Navigate to detail page where polling will show real-time updates
      navigate(`/collections/${collection.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Collection</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Source</div>
            <div style={{ fontWeight: 500 }}>{sourceName}</div>
            <div className="badge badge-info" style={{ marginTop: '8px' }}>{source}</div>
          </div>

          <div className="form-group">
            <label>Collection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Browse;