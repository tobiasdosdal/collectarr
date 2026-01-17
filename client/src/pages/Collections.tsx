import { FC, useEffect, useState, useMemo, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import EmptyCollectionsState from '../components/EmptyCollectionsState';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import {
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  Clock,
  X,
  Search,
  Filter,
  ChevronDown,
} from 'lucide-react';

interface Collection {
  id: string;
  name: string;
  description?: string;
  sourceType: string;
  itemCount: number;
  lastSyncAt?: string;
  posterPath?: string;
  embyServerIds?: string[];
}

interface CollectionStats {
  total: number;
  inEmby: number;
  missing: number;
  percentInLibrary: number;
}

interface CreateCollectionModalProps {
  onClose: () => void;
  onCreated: (collection: Collection) => void;
}

const SOURCE_TYPES = ['MANUAL', 'MDBLIST', 'TRAKT'];

const SYNC_STATUS_OPTIONS = [
  { value: 'synced', label: 'Synced' },
  { value: 'never', label: 'Never Synced' },
];

const getRelativeTime = (dateString: string | undefined): string => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const Collections: FC = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionStats, setCollectionStats] = useState<Record<string, CollectionStats>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const { addToast } = useToast();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceTypeFilters, setSourceTypeFilters] = useState<string[]>([]);
  const [syncStatusFilters, setSyncStatusFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'synced' | 'completion'>('name');
  const [showSourceDropdown, setShowSourceDropdown] = useState<boolean>(false);
  const [showSyncDropdown, setShowSyncDropdown] = useState<boolean>(false);
  const [showSortDropdown, setShowSortDropdown] = useState<boolean>(false);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const filteredCollections = useMemo(() => {
    let filtered = collections.filter((collection) => {
      const searchLower = debouncedSearchQuery.toLowerCase().trim();
      if (searchLower) {
        const nameMatch = collection.name.toLowerCase().includes(searchLower);
        const descMatch = collection.description?.toLowerCase().includes(searchLower) || false;
        if (!nameMatch && !descMatch) {
          return false;
        }
      }

      if (sourceTypeFilters.length > 0) {
        if (!sourceTypeFilters.includes(collection.sourceType)) {
          return false;
        }
      }

      if (syncStatusFilters.length > 0) {
        const hasSynced = collection.lastSyncAt !== null;
        const matchesSynced = syncStatusFilters.includes('synced') && hasSynced;
        const matchesNever = syncStatusFilters.includes('never') && !hasSynced;
        if (!matchesSynced && !matchesNever) {
          return false;
        }
      }

      return true;
    });

    // Sort collections
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return (b.itemCount || 0) - (a.itemCount || 0);
        case 'synced':
          return new Date(b.lastSyncAt || 0).getTime() - new Date(a.lastSyncAt || 0).getTime();
        case 'completion':
          const statsA = collectionStats[a.id];
          const statsB = collectionStats[b.id];
          const completionA = statsA?.percentInLibrary || 0;
          const completionB = statsB?.percentInLibrary || 0;
          return completionB - completionA;
        default:
          return 0;
      }
    });

    return filtered;
  }, [collections, debouncedSearchQuery, sourceTypeFilters, syncStatusFilters, sortBy, collectionStats]);

  const toggleFilter = (filterArray: string[], setFilterArray: (arr: string[]) => void, value: string): void => {
    if (filterArray.includes(value)) {
      setFilterArray(filterArray.filter((v) => v !== value));
    } else {
      setFilterArray([...filterArray, value]);
    }
  };

  const clearFilters = (): void => {
    setSearchQuery('');
    setSourceTypeFilters([]);
    setSyncStatusFilters([]);
  };

  const hasActiveFilters = searchQuery || sourceTypeFilters.length > 0 || syncStatusFilters.length > 0;

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async (): Promise<void> => {
    try {
      const data = await api.getCollections();
      setCollections(data);

      // Load stats for each collection
      const stats: Record<string, CollectionStats> = {};
      for (const collection of data) {
        try {
          const collStats = await api.getCollectionStats(collection.id);
          stats[collection.id] = collStats;
        } catch (err) {
          console.warn(`Failed to load stats for ${collection.name}:`, err);
        }
      }
      setCollectionStats(stats);
    } catch (err) {
      console.error('Failed to load collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (collectionId: string): Promise<void> => {
    setRefreshing(collectionId);
    try {
      await api.refreshCollection(collectionId);
      await loadCollections();
    } catch (err: any) {
      addToast(`Failed to refresh: ${err.message}`, 'error');
    } finally {
      setRefreshing(null);
    }
  };

  const handleDelete = async (collectionId: string, name: string): Promise<void> => {
    if (!confirm(`Delete collection "${name}"?`)) return;

    try {
      await api.deleteCollection(collectionId);
      setCollections(collections.filter((c) => c.id !== collectionId));
      addToast("Collection deleted successfully", "success");
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, "error");
    }
  };

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
          <h1>Collections</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your media collections and sync them to Emby</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-secondary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} strokeWidth={1.5} />
            Create Manual
          </button>
          <Link to="/browse" className="btn btn-primary">
            <Plus size={16} strokeWidth={1.5} />
            Add from Source
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="collections-filters">
        <div className="search-box" style={{ marginBottom: 0, flex: 1 }}>
          <Search size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections by name or description..."
            data-testid="collections-search"
          />
        </div>

        <div className="filter-dropdowns">
          {/* Sort Dropdown */}
          <div className="filter-dropdown">
            <button
              className="filter-dropdown-trigger"
              onClick={() => {
                setShowSortDropdown(!showSortDropdown);
                setShowSourceDropdown(false);
                setShowSyncDropdown(false);
              }}
            >
              <Filter size={16} />
              Sort: <strong style={{ marginLeft: '4px' }}>
                {sortBy === 'name' && 'Name'}
                {sortBy === 'size' && 'Size'}
                {sortBy === 'synced' && 'Last Synced'}
                {sortBy === 'completion' && 'Completion'}
              </strong>
              <ChevronDown size={16} />
            </button>
            {showSortDropdown && (
              <div className="filter-dropdown-menu">
                {[
                  { value: 'name' as const, label: 'Name' },
                  { value: 'size' as const, label: 'Size (largest first)' },
                  { value: 'synced' as const, label: 'Last Synced' },
                  { value: 'completion' as const, label: 'Completion %' },
                ].map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="radio"
                      checked={sortBy === option.value}
                      onChange={() => {
                        setSortBy(option.value);
                        setShowSortDropdown(false);
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Source Type Filter */}
          <div className="filter-dropdown">
            <button
              className={`filter-dropdown-trigger ${sourceTypeFilters.length > 0 ? 'active' : ''}`}
              onClick={() => {
                setShowSourceDropdown(!showSourceDropdown);
                setShowSyncDropdown(false);
              }}
              data-testid="source-type-filter"
            >
              <Filter size={16} />
              Source Type
              {sourceTypeFilters.length > 0 && (
                <span className="filter-count">{sourceTypeFilters.length}</span>
              )}
              <ChevronDown size={16} />
            </button>
            {showSourceDropdown && (
              <div className="filter-dropdown-menu" data-testid="source-type-menu">
                {SOURCE_TYPES.map((type) => (
                  <label key={type} className="filter-option">
                    <input
                      type="checkbox"
                      checked={sourceTypeFilters.includes(type)}
                      onChange={() => toggleFilter(sourceTypeFilters, setSourceTypeFilters, type)}
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sync Status Filter */}
          <div className="filter-dropdown">
            <button
              className={`filter-dropdown-trigger ${syncStatusFilters.length > 0 ? 'active' : ''}`}
              onClick={() => {
                setShowSyncDropdown(!showSyncDropdown);
                setShowSourceDropdown(false);
              }}
              data-testid="sync-status-filter"
            >
              <Clock size={16} />
              Sync Status
              {syncStatusFilters.length > 0 && (
                <span className="filter-count">{syncStatusFilters.length}</span>
              )}
              <ChevronDown size={16} />
            </button>
            {showSyncDropdown && (
              <div className="filter-dropdown-menu" data-testid="sync-status-menu">
                {SYNC_STATUS_OPTIONS.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={syncStatusFilters.includes(option.value)}
                      onChange={() => toggleFilter(syncStatusFilters, setSyncStatusFilters, option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearFilters}
              data-testid="clear-filters"
            >
              <X size={16} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results count when filtering */}
      {hasActiveFilters && (
        <div className="filter-results-count" data-testid="filter-results">
          Showing {filteredCollections.length} of {collections.length} collections
        </div>
      )}

      {collections.length === 0 ? (
        <EmptyCollectionsState
          onCreateManual={() => setShowCreateModal(true)}
          onCollectionAdded={loadCollections}
        />
      ) : filteredCollections.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6">
              <Search size={36} className="text-muted-foreground" />
            </div>
            <h3>No collections match your filters</h3>
            <p>
              Try adjusting your search or filter criteria
            </p>
            <button className="btn btn-secondary" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        </div>
      ) : (
        <div className="collections-grid animate-stagger" data-testid="collections-grid">
          {filteredCollections.map((collection) => {
            const stats = collectionStats[collection.id];
            return (
              <div key={collection.id} className="collection-card">
                {/* Poster Image */}
                {collection.posterPath && (
                  <div className="w-full h-36 rounded-t-xl overflow-hidden bg-secondary">
                    <img
                      src={collection.posterPath}
                      alt={collection.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="p-5">
                  {/* Header */}
                  <div className="mb-3">
                    <Link to={`/collections/${collection.id}`} className="group">
                      <h3 className="text-base font-semibold mb-1.5 group-hover:text-primary transition-colors line-clamp-2">
                        {collection.name}
                      </h3>
                    </Link>
                    <span className="collection-source">
                      {collection.sourceType}
                    </span>
                  </div>

                  {/* Description */}
                  {collection.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {collection.description}
                    </p>
                  )}

                  {/* Stats */}
                  {stats ? (
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-medium">In Library</span>
                        <span className="text-xs text-muted-foreground">
                          {stats.inEmby}/{stats.total}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className={`progress-bar-fill ${stats.percentInLibrary === 100 ? 'complete' : ''}`}
                          style={{ width: `${stats.percentInLibrary}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {stats.percentInLibrary}% complete
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 text-sm text-muted-foreground">
                      {collection.itemCount} items
                    </div>
                  )}

                  {/* Sync Info */}
                  <div className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
                    <Clock size={12} />
                    Synced {getRelativeTime(collection.lastSyncAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t border-border/30">
                    <Link to={`/collections/${collection.id}`} className="btn btn-secondary btn-sm flex-1">
                      View
                    </Link>
                    {collection.sourceType !== 'MANUAL' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRefresh(collection.id)}
                        disabled={refreshing === collection.id}
                        aria-label={`Refresh collection ${collection.name}`}
                        aria-busy={refreshing === collection.id}
                        title="Refresh from source"
                      >
                        <RefreshCw size={14} className={refreshing === collection.id ? 'spinning' : ''} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(collection.id, collection.name)}
                      aria-label={`Delete collection ${collection.name}`}
                      title="Delete collection"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateCollectionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(collection) => {
            setCollections([collection, ...collections]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
};

const CreateCollectionModal: FC<CreateCollectionModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const collection = await api.createCollection({
        name,
        description,
        sourceType: 'MANUAL',
        refreshIntervalHours: 24,
        syncToEmbyOnRefresh: true,
        removeFromEmby: false,
        embyServerIds: [],
      });
      onCreated(collection);
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
          <h2>Create Manual Collection</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Collection"
              required
            />
          </div>

          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Collection description"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Collections;