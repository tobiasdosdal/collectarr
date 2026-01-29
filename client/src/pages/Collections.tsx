import { FC, useEffect, useState, useMemo, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { SkeletonCollectionGrid } from '../components/Skeleton';
import EmptyCollectionsState from '../components/EmptyCollectionsState';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import {
  Plus,
  RefreshCw,
  Trash2,
  Clock,
  X,
  Search,
  SlidersHorizontal,
  ChevronDown,
  Film,
  MoreVertical,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Collection {
  id: string;
  name: string;
  description?: string;
  sourceType: string;
  itemCount: number;
  lastSyncAt?: string;
  lastItemAddedAt?: string;
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const { addToast } = useToast();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceTypeFilters, setSourceTypeFilters] = useState<string[]>([]);
  const [syncStatusFilters, setSyncStatusFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'synced' | 'completion' | 'recentlyUpdated'>('recentlyUpdated');
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
        case 'recentlyUpdated':
          return new Date(b.lastItemAddedAt || b.lastSyncAt || 0).getTime() - new Date(a.lastItemAddedAt || a.lastSyncAt || 0).getTime();
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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeMenu]);

  const loadCollections = async (): Promise<void> => {
    try {
      const data = await api.getCollections();
      setCollections(data);

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
    setActiveMenu(null);
    try {
      await api.refreshCollection(collectionId);
      await loadCollections();
      addToast('Collection refreshed', 'success');
    } catch (err: any) {
      addToast(`Failed to refresh: ${err.message}`, 'error');
    } finally {
      setRefreshing(null);
    }
  };

  const handleDelete = async (collectionId: string): Promise<void> => {
    try {
      await api.deleteCollection(collectionId);
      setCollections(collections.filter((c) => c.id !== collectionId));
      addToast('Collection deleted successfully', 'success');
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Collections</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your media collections</p>
          </div>
        </div>
        <SkeletonCollectionGrid count={8} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Collections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {collections.length} collection{collections.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} className="mr-2" />
            Create Manual
          </Button>
          <Button asChild>
            <Link to="/browse">
              <Plus size={16} className="mr-2" />
              Add from Source
            </Link>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            data-testid="collections-search"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Sort Dropdown */}
          <div className="relative">
            <button
              className="h-10 px-3 rounded-lg bg-secondary border border-border hover:border-primary/50 flex items-center gap-2 text-sm transition-colors"
              onClick={() => {
                setShowSortDropdown(!showSortDropdown);
                setShowSourceDropdown(false);
                setShowSyncDropdown(false);
              }}
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Sort:</span>
              <span className="font-medium">
                {sortBy === 'name' && 'Name'}
                {sortBy === 'size' && 'Size'}
                {sortBy === 'synced' && 'Synced'}
                {sortBy === 'completion' && 'Completion'}
                {sortBy === 'recentlyUpdated' && 'Recently Updated'}
              </span>
              <ChevronDown size={14} />
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 py-1 rounded-lg bg-popover border border-border shadow-lg z-50">
                {[
                  { value: 'recentlyUpdated' as const, label: 'Recently Updated' },
                  { value: 'name' as const, label: 'Name' },
                  { value: 'size' as const, label: 'Size (largest)' },
                  { value: 'synced' as const, label: 'Last Synced' },
                  { value: 'completion' as const, label: 'Completion %' },
                ].map((option) => (
                  <button
                    key={option.value}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors ${
                      sortBy === option.value ? 'text-primary font-medium' : ''
                    }`}
                    onClick={() => {
                      setSortBy(option.value);
                      setShowSortDropdown(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source Type Filter */}
          <div className="relative">
            <button
              className={`h-10 px-3 rounded-lg border flex items-center gap-2 text-sm transition-colors ${
                sourceTypeFilters.length > 0
                  ? 'bg-primary/10 border-primary/50 text-primary'
                  : 'bg-secondary border-border hover:border-primary/50'
              }`}
              onClick={() => {
                setShowSourceDropdown(!showSourceDropdown);
                setShowSyncDropdown(false);
                setShowSortDropdown(false);
              }}
              data-testid="source-type-filter"
            >
              Source
              {sourceTypeFilters.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{sourceTypeFilters.length}</Badge>
              )}
              <ChevronDown size={14} />
            </button>
            {showSourceDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg bg-popover border border-border shadow-lg z-50" data-testid="source-type-menu">
                {SOURCE_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceTypeFilters.includes(type)}
                      onChange={() => toggleFilter(sourceTypeFilters, setSourceTypeFilters, type)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{type}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sync Status Filter */}
          <div className="relative">
            <button
              className={`h-10 px-3 rounded-lg border flex items-center gap-2 text-sm transition-colors ${
                syncStatusFilters.length > 0
                  ? 'bg-primary/10 border-primary/50 text-primary'
                  : 'bg-secondary border-border hover:border-primary/50'
              }`}
              onClick={() => {
                setShowSyncDropdown(!showSyncDropdown);
                setShowSourceDropdown(false);
                setShowSortDropdown(false);
              }}
              data-testid="sync-status-filter"
            >
              <Clock size={14} />
              Status
              {syncStatusFilters.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{syncStatusFilters.length}</Badge>
              )}
              <ChevronDown size={14} />
            </button>
            {showSyncDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg bg-popover border border-border shadow-lg z-50" data-testid="sync-status-menu">
                {SYNC_STATUS_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncStatusFilters.includes(option.value)}
                      onChange={() => toggleFilter(syncStatusFilters, setSyncStatusFilters, option.value)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10" data-testid="clear-filters">
              <X size={14} className="mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground" data-testid="filter-results">
          Showing {filteredCollections.length} of {collections.length} collections
        </p>
      )}

      {/* Content */}
      {collections.length === 0 ? (
        <EmptyCollectionsState
          onCreateManual={() => setShowCreateModal(true)}
          onCollectionAdded={loadCollections}
        />
      ) : filteredCollections.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-secondary/30">
          <div className="inline-flex p-4 rounded-full bg-secondary mb-4">
            <Search size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No matches found</h3>
          <p className="text-muted-foreground mb-4">Try adjusting your search or filters</p>
          <Button variant="secondary" onClick={clearFilters}>
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" data-testid="collections-grid">
          {filteredCollections.map((collection) => {
            const isRefreshing = refreshing === collection.id;

            return (
              <div key={collection.id} className="group relative">
                <Link to={`/collections/${collection.id}`} className="block">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary border border-border group-hover:border-primary/50 transition-all shadow-md group-hover:shadow-xl">
                    {collection.posterPath ? (
                      <img
                        src={collection.posterPath}
                        alt={collection.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-secondary to-background">
                        <Film size={40} className="text-muted-foreground" />
                      </div>
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                    {/* Info at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="text-sm font-semibold text-white truncate mb-1">
                        {collection.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-white/70">
                        <span>{collection.itemCount} items</span>
                        <span>•</span>
                        <span>{collection.sourceType}</span>
                      </div>
                    </div>

                    {/* Hover overlay with actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="sm" variant="secondary" className="gap-1.5" asChild>
                        <span>
                          <Eye size={14} />
                          View
                        </span>
                      </Button>
                    </div>
                  </div>
                </Link>

                {/* Menu button */}
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-1.5 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveMenu(activeMenu === collection.id ? null : collection.id);
                    }}
                  >
                    <MoreVertical size={16} className="text-white" />
                  </button>

                  {activeMenu === collection.id && (
                    <div
                      className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg bg-popover border border-border shadow-lg z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        to={`/collections/${collection.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
                      >
                        <Eye size={14} />
                        View
                      </Link>
                      {collection.sourceType !== 'MANUAL' && (
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors disabled:opacity-50"
                          onClick={() => handleRefresh(collection.id)}
                          disabled={isRefreshing}
                        >
                          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                          {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                      )}
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-secondary transition-colors"
                        onClick={() => {
                          setDeleteTarget({ id: collection.id, name: collection.name });
                          setActiveMenu(null);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Synced time below card */}
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={10} />
                  <span>{getRelativeTime(collection.lastSyncAt)}</span>
                </div>
              </div>
            );
          })}

          {/* Add new card */}
          <Link
            to="/browse"
            className="group flex flex-col items-center justify-center aspect-[2/3] rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/50 transition-all"
          >
            <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors mb-3">
              <Plus size={24} className="text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
              Add Collection
            </span>
          </Link>
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

      {deleteTarget && (
        <ConfirmationModal
          title="Delete Collection"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmText="Delete"
          isDangerous
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
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
      });
      onCreated(collection);
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
          <h2 className="text-lg font-semibold">Create Manual Collection</h2>
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
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Collection"
              required
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Collection description"
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Collections;
