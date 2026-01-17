import { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from './Toast';
import api from '../api/client';
import {
  Film,
  Plus,
  Loader2,
  Sparkles,
  CheckCircle,
} from 'lucide-react';

interface SampleCollection {
  id: string;
  name: string;
  description: string;
  posterPath: string;
  itemCount: number;
}

interface SampleCollectionsGridProps {
  onCollectionAdded?: () => void;
  compact?: boolean;
}

const SampleCollectionsGrid: FC<SampleCollectionsGridProps> = ({
  onCollectionAdded,
  compact = false
}) => {
  const [samples, setSamples] = useState<SampleCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadSamples();
  }, []);

  const loadSamples = async () => {
    try {
      const data = await api.getSampleCollections();
      setSamples(data);
    } catch (err) {
      console.error('Failed to load sample collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSample = async (sampleId: string) => {
    if (addingId || addedIds.has(sampleId)) return;

    setAddingId(sampleId);
    try {
      const collection = await api.applySampleCollection(sampleId);
      addToast(`"${collection.name}" added successfully!`, 'success');
      setAddedIds(prev => new Set(prev).add(sampleId));
      if (onCollectionAdded) {
        onCollectionAdded();
      }
      // Navigate to the new collection after a brief delay
      setTimeout(() => {
        navigate(`/collections/${collection.id}`);
      }, 500);
    } catch (err: any) {
      if (err.message?.includes('already been added')) {
        addToast('This sample collection has already been added', 'info');
        setAddedIds(prev => new Set(prev).add(sampleId));
      } else {
        addToast(`Failed to add collection: ${err.message}`, 'error');
      }
    } finally {
      setAddingId(null);
    }
  };

  if (loading) {
    return (
      <div className="sample-collections-loading">
        <Loader2 className="animate-spin" size={24} />
        <span>Loading sample collections...</span>
      </div>
    );
  }

  if (samples.length === 0) {
    return null;
  }

  return (
    <div className={`sample-collections-section ${compact ? 'compact' : ''}`}>
      <div className="sample-collections-header">
        <div className="sample-collections-badge">
          <Sparkles size={14} />
          Quick Start
        </div>
        <h3>Try Sample Collections</h3>
        <p>
          Add pre-configured collections to explore features instantly with real movie data
        </p>
      </div>

      <div className="sample-collections-grid" data-testid="sample-collections-grid">
        {samples.map((sample) => {
          const isAdding = addingId === sample.id;
          const isAdded = addedIds.has(sample.id);

          return (
            <div
              key={sample.id}
              className={`sample-collection-card ${isAdded ? 'added' : ''}`}
              data-testid={`sample-card-${sample.id}`}
            >
              <div className="sample-collection-poster">
                {sample.posterPath ? (
                  <img
                    src={sample.posterPath}
                    alt={sample.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="sample-collection-poster-placeholder">
                    <Film size={32} />
                  </div>
                )}
                <div className="sample-collection-overlay">
                  <span className="sample-collection-count">
                    {sample.itemCount} items
                  </span>
                </div>
              </div>

              <div className="sample-collection-content">
                <h4>{sample.name}</h4>
                <p>{sample.description}</p>

                <button
                  className={`btn ${isAdded ? 'btn-success' : 'btn-primary'} btn-sm sample-add-btn`}
                  onClick={() => handleAddSample(sample.id)}
                  disabled={isAdding || isAdded}
                  data-testid={`add-sample-${sample.id}`}
                >
                  {isAdding ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Adding...
                    </>
                  ) : isAdded ? (
                    <>
                      <CheckCircle size={14} />
                      Added
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Add Collection
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SampleCollectionsGrid;
