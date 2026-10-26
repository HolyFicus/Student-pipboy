import { useEffect } from 'react';

/**
 * Custom hook to lock scrolling and blur the background app shell when any modal is open.
 *
 * @param isOpen boolean flag whether the modal is currently active/mounted
 */
export function useModalScrollLock(isOpen: boolean = true) {
  useEffect(() => {
    if (!isOpen) return;

    // Track active modal instances to handle nested/stacked modals safely
    const currentCount = parseInt(document.body.getAttribute('data-modal-count') || '0', 10);
    const newCount = currentCount + 1;
    document.body.setAttribute('data-modal-count', String(newCount));

    // When first modal opens: prevent page scroll & apply blurred backdrop class
    if (currentCount === 0) {
      document.body.classList.add('modal-open');
    }

    return () => {
      const activeCount = parseInt(document.body.getAttribute('data-modal-count') || '1', 10);
      const remainingCount = Math.max(0, activeCount - 1);
      
      if (remainingCount === 0) {
        document.body.removeAttribute('data-modal-count');
        document.body.classList.remove('modal-open');
      } else {
        document.body.setAttribute('data-modal-count', String(remainingCount));
      }
    };
  }, [isOpen]);
}
