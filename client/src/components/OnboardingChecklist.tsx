import { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useOnboarding, OnboardingStep } from '../contexts/OnboardingContext';
import {
  CheckCircle2,
  Circle,
  Server,
  Link2,
  FolderPlus,
  RefreshCw,
  Settings,
  ChevronRight,
  Sparkles,
  PartyPopper,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Map step IDs to icons
const stepIcons: Record<string, typeof Server> = {
  connect_media_server: Server,
  link_trakt: Link2,
  create_collection: FolderPlus,
  run_sync: RefreshCw,
  configure_preferences: Settings,
};

interface OnboardingStepItemProps {
  step: OnboardingStep;
  isLast: boolean;
  onNavigate: (route?: string) => void;
}

const OnboardingStepItem: FC<OnboardingStepItemProps> = ({ step, isLast, onNavigate }) => {
  const Icon = stepIcons[step.id] || Circle;

  return (
    <button
      onClick={() => onNavigate(step.route)}
      className={cn(
        'group relative flex items-start gap-4 p-4 rounded-xl transition-all text-left w-full',
        'hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50',
        step.completed ? 'bg-green-500/5' : 'bg-secondary/20'
      )}
    >
      {/* Status indicator */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all',
          step.completed
            ? 'bg-green-500/20 text-green-500'
            : 'bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary'
        )}
      >
        {step.completed ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <Icon className="w-5 h-5" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3
          className={cn(
            'font-medium text-sm leading-tight mb-1 transition-colors',
            step.completed ? 'text-green-500' : 'text-foreground group-hover:text-primary'
          )}
        >
          {step.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2">{step.description}</p>
      </div>

      {/* Arrow */}
      {!step.completed && (
        <ChevronRight className="flex-shrink-0 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      )}

      {/* Connector line */}
      {!isLast && (
        <div
          className={cn(
            'absolute left-9 top-14 w-0.5 h-4',
            step.completed ? 'bg-green-500/30' : 'bg-border'
          )}
        />
      )}
    </button>
  );
};

// Celebration component shown when all steps are completed
const CelebrationOverlay: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm z-10 animate-in fade-in duration-300">
      {showConfetti && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Simple confetti effect using positioned dots */}
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                backgroundColor: ['#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'][
                  Math.floor(Math.random() * 5)
                ],
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${0.5 + Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="text-center p-6">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <PartyPopper className="w-10 h-10 text-green-500" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">You're All Set!</h2>
        <p className="text-muted-foreground mb-6 max-w-xs">
          Congratulations! You've completed all the setup steps. Your collections are ready to sync.
        </p>

        <Button onClick={onClose} className="gap-2">
          <Sparkles className="w-4 h-4" />
          Start Exploring
        </Button>
      </div>
    </div>
  );
};

export const OnboardingChecklist: FC = () => {
  const navigate = useNavigate();
  const {
    isOpen,
    closeChecklist,
    dismissOnboarding,
    steps,
    completedCount,
    totalSteps,
    progressPercentage,
    completed,
  } = useOnboarding();

  const [showCelebration, setShowCelebration] = useState(false);
  const [prevCompletedCount, setPrevCompletedCount] = useState(completedCount);

  // Check for milestone completion
  useEffect(() => {
    if (completedCount > prevCompletedCount) {
      // All steps completed - show celebration
      if (completedCount === totalSteps && !completed) {
        setShowCelebration(true);
      }
    }
    setPrevCompletedCount(completedCount);
  }, [completedCount, prevCompletedCount, totalSteps, completed]);

  const handleNavigate = (route?: string) => {
    if (route) {
      closeChecklist();
      navigate(route);
    }
  };

  const handleDismiss = async () => {
    await dismissOnboarding();
    closeChecklist();
  };

  const handleCelebrationClose = () => {
    setShowCelebration(false);
    closeChecklist();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeChecklist()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        {showCelebration && <CelebrationOverlay onClose={handleCelebrationClose} />}

        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-primary" />
              Getting Started
            </SheetTitle>
          </div>
          <SheetDescription>
            Complete these steps to set up your media collection syncing.
          </SheetDescription>
        </SheetHeader>

        {/* Progress bar */}
        <div className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {completedCount} of {totalSteps} completed
            </span>
            <span className="text-sm text-muted-foreground">{progressPercentage}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-green-500 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Steps list */}
        <div className="space-y-2 py-4">
          {steps.map((step, index) => (
            <OnboardingStepItem
              key={step.id}
              step={step}
              isLast={index === steps.length - 1}
              onNavigate={handleNavigate}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-border mt-auto">
          <div className="flex items-center justify-between">
            <button
              onClick={handleDismiss}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss for now
            </button>
            {completedCount > 0 && completedCount < totalSteps && (
              <span className="text-xs text-muted-foreground">
                {totalSteps - completedCount} steps remaining
              </span>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Floating button to re-open the checklist (shown when dismissed but not completed)
export const OnboardingFloatingButton: FC = () => {
  const { completed, dismissed, openChecklist, progressPercentage } = useOnboarding();

  // Only show if not completed and was dismissed
  if (completed || !dismissed) return null;

  return (
    <button
      onClick={openChecklist}
      className={cn(
        'fixed bottom-20 right-4 z-40 flex items-center gap-2 px-4 py-2 rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'hover:bg-primary/90 transition-all',
        'animate-in slide-in-from-right-4 fade-in duration-300'
      )}
      title="Open setup checklist"
    >
      <div className="relative">
        <Sparkles className="w-4 h-4" />
        {/* Progress indicator */}
        <div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 text-[8px] font-bold flex items-center justify-center"
          style={{ opacity: progressPercentage > 0 ? 1 : 0 }}
        >
          {Math.floor(progressPercentage / 20)}
        </div>
      </div>
      <span className="text-sm font-medium">Setup</span>
    </button>
  );
};

export default OnboardingChecklist;
