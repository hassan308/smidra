import { memo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { MapPin, Clock, Heart, ExternalLink } from './Icons';
import { CompanyLogo } from './CompanyLogo';
import type { Job, Labels } from '../types';
import clsx from 'clsx';

interface JobCardProps {
  job: Job;
  isSaved: boolean;
  onSave: (id: string) => void;
  onClick: (job: Job) => void;
  labels: Labels;
  index?: number;
}

export const JobCard = memo(function JobCard({
  job,
  isSaved,
  onSave,
  onClick,
  labels,
  index = 0
}: JobCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group bg-white dark:bg-gray-900 rounded-2xl border border-black/5 dark:border-white/10
                 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden"
      onClick={() => onClick(job)}
    >
      <div className="p-5">
        {/* Top row: Logo + Company + Save button */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <CompanyLogo name={job.employer} logoUrl={job.logoUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {job.employer}
              </p>
              {job.employmentType && (
                <Badge variant="soft" color="secondary" className="mt-1 text-xs">
                  {job.employmentType}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            color={isSaved ? 'primary' : 'secondary'}
            size="sm"
            uniform
            onClick={(e) => {
              e.stopPropagation();
              onSave(job.id);
            }}
            className={clsx(
              'transition-colors',
              isSaved && 'text-[#C85A38] bg-[#C85A38]/10'
            )}
          >
            <Heart
              className="w-4 h-4"
              fill={isSaved ? 'currentColor' : 'none'}
            />
          </Button>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white leading-snug mb-3 line-clamp-2 group-hover:text-[#C85A38] transition-colors">
          {job.title}
        </h3>

        {/* Meta info */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#7B9E87]" />
            {job.location || 'Sverige'}
          </span>
          {job.deadline && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              {job.deadline}
            </span>
          )}
        </div>
      </div>

      {/* Footer buttons */}
      <div className="flex gap-2 p-3 pt-0 border-t-0">
        <Button
          variant="outline"
          color="secondary"
          size="sm"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            onClick(job);
          }}
        >
          {labels.showMore || 'Läs mer'}
        </Button>
        <Button
          variant="solid"
          color="primary"
          size="sm"
          className="flex-1 bg-gray-900 hover:bg-[#C85A38]"
          onClick={(e) => {
            e.stopPropagation();
            window.openai?.openExternal?.({ href: job.url });
          }}
        >
          <ExternalLink className="w-4 h-4" />
          {labels.apply || 'Ansök'}
        </Button>
      </div>
    </motion.div>
  );
});
