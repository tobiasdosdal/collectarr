import { FC } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FolderPlus,
  TrendingUp,
  Database,
  Server,
  RefreshCw,
  CheckCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import SampleCollectionsGrid from './SampleCollectionsGrid';

interface QuickStartStepProps {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  isComplete?: boolean;
  action?: {
    label: string;
    href: string;
  };
}

const QuickStartStep: FC<QuickStartStepProps> = ({
  number,
  title,
  description,
  icon,
  isComplete,
  action,
}) => {
  return (
    <div className={`quick-start-step ${isComplete ? 'completed' : ''}`}>
      <div className="quick-start-step-number">
        {isComplete ? (
          <CheckCircle size={20} className="text-green-500" />
        ) : (
          <span>{number}</span>
        )}
      </div>
      <div className="quick-start-step-icon">{icon}</div>
      <div className="quick-start-step-content">
        <h4>{title}</h4>
        <p>{description}</p>
        {action && !isComplete && (
          <Link to={action.href} className="quick-start-step-action">
            {action.label}
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
};

interface EmptyCollectionsStateProps {
  onCreateManual: () => void;
  onCollectionAdded?: () => void;
}

const EmptyCollectionsState: FC<EmptyCollectionsStateProps> = ({ onCreateManual, onCollectionAdded }) => {
  const { user } = useAuth();

  const isTraktConnected = user?.traktConnected ?? false;
  const isMdblistConnected = user?.mdblistConnected ?? false;
  const hasAnyIntegration = isTraktConnected || isMdblistConnected;

  return (
    <div className="empty-collections-container animate-fade-in">
      {/* Hero Section with Illustration */}
      <div className="empty-collections-hero">
        <div className="empty-collections-illustration">
          <div className="illustration-circle illustration-circle-outer">
            <div className="illustration-circle illustration-circle-inner">
              <FolderPlus size={48} className="text-primary" />
            </div>
          </div>
          <div className="illustration-orbit">
            <div className="illustration-orbit-item orbit-item-1">
              <TrendingUp size={20} />
            </div>
            <div className="illustration-orbit-item orbit-item-2">
              <Database size={20} />
            </div>
            <div className="illustration-orbit-item orbit-item-3">
              <Server size={20} />
            </div>
          </div>
        </div>

        <div className="empty-collections-hero-content">
          <div className="empty-collections-badge">
            <Sparkles size={14} />
            Get Started
          </div>
          <h2>Create Your First Collection</h2>
          <p>
            Collections sync your favorite movie and TV lists from Trakt and MDBList
            directly to your Emby server. Set it up once, and your library stays
            automatically updated.
          </p>
        </div>
      </div>

      {/* Quick Start Guide */}
      <div className="quick-start-guide">
        <h3 className="quick-start-title">Quick Start Guide</h3>
        <div className="quick-start-steps">
          <QuickStartStep
            number={1}
            title="Connect Your Integrations"
            description={
              hasAnyIntegration
                ? `Connected: ${[isTraktConnected && 'Trakt', isMdblistConnected && 'MDBList'].filter(Boolean).join(', ')}`
                : 'Link your Trakt or MDBList account to import your watchlists and curated lists.'
            }
            icon={<TrendingUp size={24} />}
            isComplete={hasAnyIntegration}
            action={
              hasAnyIntegration
                ? undefined
                : { label: 'Go to Settings', href: '/settings' }
            }
          />

          <QuickStartStep
            number={2}
            title="Browse & Add Lists"
            description="Explore popular lists from Trakt and MDBList, then add them as collections with one click."
            icon={<Database size={24} />}
            action={{ label: 'Browse Sources', href: '/browse' }}
          />

          <QuickStartStep
            number={3}
            title="Configure Emby Sync"
            description="Connect your Emby server and choose which libraries to sync your collections to."
            icon={<Server size={24} />}
            action={{ label: 'Configure Emby', href: '/settings' }}
          />

          <QuickStartStep
            number={4}
            title="Automatic Updates"
            description="Collections refresh automatically on your schedule, keeping your Emby library always up to date."
            icon={<RefreshCw size={24} />}
          />
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="empty-collections-actions">
        <Link to="/browse" className="btn btn-primary btn-lg" data-testid="create-first-collection-btn">
          <FolderPlus size={20} />
          Create First Collection
        </Link>
        <button
          className="btn btn-secondary btn-lg"
          onClick={onCreateManual}
        >
          Or Create a Manual Collection
        </button>
      </div>

      {/* Feature Highlights */}
      <div className="empty-collections-features">
        <div className="feature-item">
          <div className="feature-icon">
            <TrendingUp size={20} />
          </div>
          <div className="feature-text">
            <strong>Trakt Lists</strong>
            <span>Watchlists, custom lists & trending</span>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-icon">
            <Database size={20} />
          </div>
          <div className="feature-text">
            <strong>MDBList</strong>
            <span>Curated & community lists</span>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-icon">
            <RefreshCw size={20} />
          </div>
          <div className="feature-text">
            <strong>Auto Sync</strong>
            <span>Scheduled refreshes</span>
          </div>
        </div>
      </div>

      {/* Sample Collections */}
      <SampleCollectionsGrid onCollectionAdded={onCollectionAdded} />
    </div>
  );
};

export default EmptyCollectionsState;
