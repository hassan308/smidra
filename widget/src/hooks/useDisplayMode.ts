import { useOpenAiGlobal } from './useOpenAiGlobal';
import type { DisplayMode } from '../types';

export function useDisplayMode(): DisplayMode | null {
  return useOpenAiGlobal('displayMode');
}
