import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './Toast';

export function ReloadPrompt() {
  const { addToast } = useToast();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      addToast('App ready for offline use', 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, addToast, setOfflineReady]);

  useEffect(() => {
    if (needRefresh) {
      addToast('New version available. Reloading...', 'info', 5000);
      const timeout = setTimeout(() => {
        updateServiceWorker(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [needRefresh, addToast, updateServiceWorker]);

  return null;
}
