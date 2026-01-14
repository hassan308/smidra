import { memo } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Maximize2, Minimize2, Map } from './Icons';
import type { Labels } from '../types';
import clsx from 'clsx';

type Filter = 'all' | 'fulltime' | 'parttime';

interface FilterBarProps {
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  showMap: boolean;
  onToggleMap: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  labels: Labels;
}

export const FilterBar = memo(function FilterBar({
  filter,
  onFilterChange,
  showMap,
  onToggleMap,
  isFullscreen,
  onToggleFullscreen,
  labels
}: FilterBarProps) {
  return (
    <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-black/5 dark:border-white/5">
      <Button
        variant={isFullscreen ? 'solid' : 'outline'}
        color={isFullscreen ? 'primary' : 'secondary'}
        size="sm"
        className={clsx(
          'flex-shrink-0',
          isFullscreen && 'bg-[#C85A38] hover:bg-[#B54E2E]'
        )}
        onClick={onToggleFullscreen}
      >
        {isFullscreen ? (
          <>
            <Minimize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Minimera</span>
          </>
        ) : (
          <>
            <Maximize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Fullskärm</span>
          </>
        )}
      </Button>

      <Button
        variant={showMap ? 'solid' : 'outline'}
        color={showMap ? 'primary' : 'secondary'}
        size="sm"
        className={clsx(
          'flex-shrink-0',
          showMap && 'bg-[#7B9E87] hover:bg-[#6a8b75]'
        )}
        onClick={onToggleMap}
      >
        <Map className="w-4 h-4" />
        <span className="hidden sm:inline">{labels.map || 'Karta'}</span>
      </Button>

      <div className="w-px bg-gray-200 dark:bg-gray-700 mx-1" />

      <Button
        variant={filter === 'all' ? 'solid' : 'ghost'}
        color="secondary"
        size="sm"
        className={clsx(
          'flex-shrink-0',
          filter === 'all' && 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
        )}
        onClick={() => onFilterChange('all')}
      >
        {labels.all || 'Alla'}
      </Button>

      <Button
        variant={filter === 'fulltime' ? 'solid' : 'ghost'}
        color="secondary"
        size="sm"
        className={clsx(
          'flex-shrink-0',
          filter === 'fulltime' && 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
        )}
        onClick={() => onFilterChange('fulltime')}
      >
        {labels.fulltime || 'Heltid'}
      </Button>

      <Button
        variant={filter === 'parttime' ? 'solid' : 'ghost'}
        color="secondary"
        size="sm"
        className={clsx(
          'flex-shrink-0',
          filter === 'parttime' && 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
        )}
        onClick={() => onFilterChange('parttime')}
      >
        {labels.parttime || 'Deltid'}
      </Button>
    </div>
  );
});
