import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

// Onboarding step definitions
export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  route?: string;
  action?: () => void;
}

export const ONBOARDING_STEPS = [
  {
    id: 'connect_media_server',
    title: 'Connect Media Server',
    description: 'Add your Emby or Jellyfin server to sync collections',
    route: '/settings/emby',
  },
  {
    id: 'link_trakt',
    title: 'Link Trakt Account',
    description: 'Connect Trakt to import your watchlists and custom lists',
    route: '/settings/general',
  },
  {
    id: 'create_collection',
    title: 'Create First Collection',
    description: 'Create your first collection from a list source',
    route: '/browse',
  },
  {
    id: 'run_sync',
    title: 'Run First Sync',
    description: 'Sync your collections to your media server',
    route: '/collections',
  },
  {
    id: 'configure_preferences',
    title: 'Configure Preferences',
    description: 'Customize your sync settings and preferences',
    route: '/settings/general',
  },
] as const;

export type OnboardingStepId = typeof ONBOARDING_STEPS[number]['id'];

interface OnboardingStepsStatus {
  [key: string]: boolean;
}

interface OnboardingContextType {
  isOpen: boolean;
  isLoading: boolean;
  completed: boolean;
  dismissed: boolean;
  steps: OnboardingStep[];
  completedCount: number;
  totalSteps: number;
  progressPercentage: number;
  openChecklist: () => void;
  closeChecklist: () => void;
  dismissOnboarding: () => Promise<void>;
  completeStep: (stepId: OnboardingStepId) => Promise<void>;
  refreshOnboardingStatus: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [stepsStatus, setStepsStatus] = useState<OnboardingStepsStatus>({});

  // Build steps array with completion status
  const steps: OnboardingStep[] = ONBOARDING_STEPS.map((step) => ({
    ...step,
    completed: stepsStatus[step.id] || false,
  }));

  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const progressPercentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const refreshOnboardingStatus = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const status = await api.getOnboardingStatus();
      setCompleted(status.completed);
      setDismissed(status.dismissed);
      setStepsStatus(status.steps || {});

      // Auto-open checklist for first-time users who haven't dismissed
      if (!status.completed && !status.dismissed) {
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Failed to load onboarding status:', error);
      // Default to showing onboarding on error for first-time experience
      setCompleted(false);
      setDismissed(false);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshOnboardingStatus();
  }, [refreshOnboardingStatus]);

  const openChecklist = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeChecklist = useCallback(() => {
    setIsOpen(false);
  }, []);

  const dismissOnboarding = useCallback(async () => {
    try {
      await api.dismissOnboarding();
      setDismissed(true);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to dismiss onboarding:', error);
    }
  }, []);

  const completeStep = useCallback(async (stepId: OnboardingStepId) => {
    try {
      const result = await api.completeOnboardingStep(stepId);
      setStepsStatus((prev) => ({ ...prev, [stepId]: true }));

      // Check if all steps are now completed
      if (result.allCompleted) {
        setCompleted(true);
      }
    } catch (error) {
      console.error('Failed to complete onboarding step:', error);
    }
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        isOpen,
        isLoading,
        completed,
        dismissed,
        steps,
        completedCount,
        totalSteps,
        progressPercentage,
        openChecklist,
        closeChecklist,
        dismissOnboarding,
        completeStep,
        refreshOnboardingStatus,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextType {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export default OnboardingContext;
