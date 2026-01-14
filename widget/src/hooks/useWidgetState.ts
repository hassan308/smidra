import { useState, useCallback, useEffect } from 'react';
import { useOpenAiGlobal } from './useOpenAiGlobal';

export function useWidgetState<T>(
  createDefaultState: () => T
): [T, (state: T | ((prev: T) => T)) => void] {
  const savedState = useOpenAiGlobal('widgetState');

  const [state, _setState] = useState<T>(() => {
    if (savedState != null) {
      return { ...createDefaultState(), ...savedState } as T;
    }
    return createDefaultState();
  });

  // Sync with OpenAI widget state on mount/update
  useEffect(() => {
    if (savedState != null) {
      _setState(prev => ({ ...prev, ...savedState }));
    }
  }, [savedState]);

  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    _setState(prev => {
      const next = typeof newState === 'function'
        ? (newState as (prev: T) => T)(prev)
        : newState;

      // Persist to OpenAI
      if (next != null && window.openai?.setWidgetState) {
        window.openai.setWidgetState(next as any);
      }

      return next;
    });
  }, []);

  return [state, setState];
}
