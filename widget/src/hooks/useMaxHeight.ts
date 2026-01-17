import { useOpenAiGlobal } from './useOpenAiGlobal';

export function useMaxHeight(): number | null {
  return useOpenAiGlobal('maxHeight') ?? null;
}
