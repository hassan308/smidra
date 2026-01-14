import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { MapPin, Clock, X, ExternalLink, Spinner } from './Icons';
import { CompanyLogo } from './CompanyLogo';
import { translateText } from '../utils/translate';
import type { Job, Labels, SalaryData } from '../types';

interface JobDetailProps {
  job: Job | null;
  onClose: () => void;
  labels: Labels;
  targetLanguage: string;
  salaryData: SalaryData | null;
  salaryLoading: boolean;
  onRequestSalary: (job: Job) => void;
}

const formatSalary = (num: number) => num?.toLocaleString('sv-SE') || '0';

const getBarPosition = (salary?: { avg: number; min: number; max: number }) => {
  if (!salary) return 50;
  const range = salary.max - salary.min;
  if (range <= 0) return 50;
  return Math.min(100, Math.max(0, ((salary.avg - salary.min) / range) * 100));
};

export const JobDetail = memo(function JobDetail({
  job,
  onClose,
  labels,
  targetLanguage,
  salaryData,
  salaryLoading,
  onRequestSalary
}: JobDetailProps) {
  const [details, setDetails] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;

    (async () => {
      let data = job;

      // Fetch full details if needed
      if (!job.fullDescription && !job.description) {
        setLoading(true);
        try {
          const res = await fetch(`https://api.smidra.se/api/job/${job.id}`);
          data = { ...job, ...(await res.json()) };
          setDetails(data);
        } catch {
          setDetails(job);
          setLoading(false);
          return;
        }
      } else {
        setDetails(job);
      }

      // Translate description
      const desc = data.fullDescription || data.description || '';
      if (targetLanguage && targetLanguage !== 'sv') {
        setDescription(await translateText(desc, targetLanguage));
      } else {
        setDescription(desc);
      }
      setLoading(false);
    })();
  }, [job, targetLanguage]);

  if (!job) return null;

  const d = details || job;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800 relative flex-shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-[#C85A38] hover:bg-[#C85A38]/10 transition-colors flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <CompanyLogo name={d.employer} logoUrl={d.logoUrl} size={48} />
              <div>
                <p className="text-sm font-semibold text-[#C85A38]">{d.employer}</p>
                {d.employmentType && (
                  <Badge variant="soft" color="secondary" className="mt-1 text-xs">
                    {d.employmentType}
                  </Badge>
                )}
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white pr-10 leading-snug">
              {d.title}
            </h2>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
            {/* Meta pills */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-600 dark:text-gray-300">
                <MapPin className="w-4 h-4 text-[#7B9E87]" />
                {d.location || 'Sverige'}
              </div>
              {d.deadline && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-600 dark:text-gray-300">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {d.deadline}
                </div>
              )}
            </div>

            {/* Description */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Spinner className="w-8 h-8 text-[#C85A38] mb-3" />
                <p className="text-sm text-gray-500">{labels.loadingDesc || 'Laddar...'}</p>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                {description || labels.noDesc || 'Ingen beskrivning tillgänglig.'}
              </div>
            )}

            {/* Salary section */}
            {salaryLoading && (
              <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl">
                <Spinner className="w-5 h-5 text-[#C85A38]" />
                <span className="text-sm text-gray-500">
                  {labels.fetchingSalary || 'Hämtar lönestatistik...'}
                </span>
              </div>
            )}

            {salaryData?.salary && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-[#7B9E87]/10 to-gray-50 dark:from-[#7B9E87]/20 dark:to-gray-800 rounded-2xl p-5 border border-[#7B9E87]/30"
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">💰</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {labels.salaryTitle || 'Lönestatistik'}
                  </span>
                </div>

                <p className="text-3xl font-bold text-[#C85A38] mb-2">
                  {formatSalary(salaryData.salary.avg)} {labels.krPerMonth || 'kr/mån'}
                </p>

                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>{labels.salaryMin || 'Min'}: {formatSalary(salaryData.salary.min)} kr</span>
                  <span>{labels.salaryMax || 'Max'}: {formatSalary(salaryData.salary.max)} kr</span>
                </div>

                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden mb-4">
                  <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-[#7B9E87] to-[#C85A38] rounded-full" />
                  <div
                    className="absolute top-1/2 w-3 h-3 bg-[#C85A38] border-2 border-white rounded-full -translate-y-1/2 shadow-sm"
                    style={{ left: `${getBarPosition(salaryData.salary)}%` }}
                  />
                </div>

                {salaryData.translatedTips && salaryData.translatedTips.length > 0 && (
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 pl-4 list-disc">
                    {salaryData.translatedTips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                )}

                {salaryData.sources && salaryData.sources.length > 0 && (
                  <p className="text-xs text-gray-400 mt-3">
                    {labels.sources || 'Källor'}: {salaryData.sources.join(', ')}
                  </p>
                )}
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 flex-shrink-0">
            <Button
              variant="outline"
              color="secondary"
              className="flex-1"
              onClick={() => onRequestSalary(d)}
              disabled={salaryLoading || !!salaryData}
            >
              {salaryLoading
                ? labels.fetching || 'Hämtar...'
                : salaryData
                ? `✓ ${labels.salaryShown || 'Visas'}`
                : labels.salaryInfo || 'Löneinfo'}
            </Button>
            <Button
              variant="solid"
              color="primary"
              className="flex-1 bg-gray-900 hover:bg-[#C85A38]"
              onClick={() => window.openai?.openExternal?.({ href: d.url })}
            >
              <ExternalLink className="w-4 h-4" />
              {labels.applyNow || 'Ansök nu'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
