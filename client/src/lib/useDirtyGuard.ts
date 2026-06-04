import { useEffect } from 'react';

/**
 * Registers a beforeunload listener when isDirty is true,
 * triggering the browser's native "unsaved changes" dialog
 * on tab close, refresh, or back-button navigation.
 */
export function useDirtyGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for most modern browsers to show the dialog
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}