import { memo } from 'react';
import { Search } from './Icons';
import type { Labels } from '../types';

interface EmptyStateProps {
  labels: Labels;
}

export const EmptyState = memo(function EmptyState({ labels }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
        <Search className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {labels.noJobs || 'Inga jobb hittades'}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 max-w-xs">
        {labels.tryOther || 'Prova att söka efter något annat'}
      </p>
    </div>
  );
});
