import { memo } from 'react';
import { MapPin, Spinner } from './Icons';
import type { Labels } from '../types';

interface HeaderProps {
  query: string;
  location: string;
  totalJobs: number;
  loadedCount: number;
  labels: Labels;
  isFullscreen: boolean;
}

export const Header = memo(function Header({
  query,
  location,
  totalJobs,
  loadedCount,
  labels,
  isFullscreen
}: HeaderProps) {
  const isLoading = loadedCount < totalJobs;

  return (
    <header className={`px-5 pt-6 pb-4 ${isFullscreen ? 'pt-4 pb-3' : ''}`}>
      {/* Eyebrow */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-0.5 bg-[#C85A38]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-[#C85A38]">
          Jobbsökning
        </span>
      </div>

      {/* Title */}
      <h1 className={`font-bold text-gray-900 dark:text-white leading-tight mb-3 ${isFullscreen ? 'text-2xl' : 'text-3xl'}`}>
        {query || 'Lediga tjänster'}
      </h1>

      {/* Meta */}
      <div className="flex items-center gap-4 flex-wrap">
        {location && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <MapPin className="w-4 h-4 text-[#7B9E87]" />
            {location}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-bold text-lg text-gray-900 dark:text-white">
            {totalJobs}
          </span>
          <span>{labels.jobs || 'jobb'}</span>
          {isLoading && (
            <Spinner className="w-3.5 h-3.5 text-[#C85A38]" />
          )}
        </div>
      </div>
    </header>
  );
});
