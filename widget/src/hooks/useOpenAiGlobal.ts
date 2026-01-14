import { useState, useEffect } from 'react';

type OpenAIGlobalKey = 'toolOutput' | 'theme' | 'locale' | 'widgetState' | 'displayMode' | 'maxHeight';

export function useOpenAiGlobal<K extends OpenAIGlobalKey>(
  key: K
): NonNullable<Window['openai']>[K] | null {
  const [value, setValue] = useState<NonNullable<Window['openai']>[K] | null>(
    () => window.openai?.[key] ?? null
  );

  useEffect(() => {
    const handler = () => {
      setValue(window.openai?.[key] ?? null);
    };

    window.addEventListener('openai:set_globals', handler);

    // Also check on mount
    if (window.openai?.[key] !== undefined) {
      setValue(window.openai[key]);
    }

    return () => {
      window.removeEventListener('openai:set_globals', handler);
    };
  }, [key]);

  return value;
}
