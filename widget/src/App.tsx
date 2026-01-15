import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  MapPin, Clock, Heart, ExternalLink, X, Search, ChevronLeft, ChevronRight,
  Building2, Sparkles, TrendingUp, Maximize2, Minimize2, Share2, Bookmark,
  ArrowUpDown, Calendar, Filter, Copy, Check, RefreshCw
} from 'lucide-react';
import { useOpenAiGlobal, useWidgetState, useDisplayMode, useMaxHeight } from './hooks';
import { translateJobs, translateLabels, translateBatch } from './utils/translate';
import type { Job, Labels, SalaryData, ToolOutput, WidgetState } from './types';

const JOBS_PER_PAGE = 12;

// Respect prefers-reduced-motion
const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

const springTransition = prefersReducedMotion
  ? { duration: 0 }
  : { type: 'spring', stiffness: 400, damping: 30 };

const DEFAULT_LABELS: Labels = {
  jobs: 'jobb',
  map: 'Karta',
  all: 'Alla',
  fulltime: 'Heltid',
  parttime: 'Deltid',
  showMore: 'Läs mer',
  apply: 'Ansök',
  applyNow: 'Ansök nu',
  saved: 'Sparad',
  noJobs: 'Inga jobb hittades',
  tryOther: 'Prova att ändra din sökning',
  loadingDesc: 'Laddar...',
  noDesc: 'Ingen beskrivning tillgänglig.',
  salaryInfo: 'Visa lön',
  fetchingSalary: 'Hämtar lönedata...',
  salaryTitle: 'Lönestatistik',
  salaryShown: 'Visas',
  krPerMonth: 'kr/mån',
  salaryMin: 'Lägst',
  salaryMax: 'Högst',
  sources: 'Källor',
  fetching: 'Laddar...'
};

const createDefaultWidgetState = (): WidgetState => ({
  savedJobs: [],
  filter: 'all',
  showMap: false,
  currentPage: 1
});

// Detect mobile
const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

// Premium company logo with elegant fallback
function CompanyLogo({ name, logoUrl, size = 44 }: { name: string; logoUrl?: string; size?: number }) {
  const [error, setError] = useState(false);
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  const hue = name?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360 || 0;

  if (error || !logoUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-xl font-semibold text-white shadow-sm"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          background: `linear-gradient(135deg, hsl(${hue}, 60%, 55%) 0%, hsl(${hue + 30}, 70%, 45%) 100%)`
        }}
        role="img"
        aria-label={`${name} logo`}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${name} logo`}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-xl object-cover ring-1 ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}

// Skeleton loader
function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </div>
  );
}

// Premium job card
function JobCard({
  job,
  isSaved,
  onSave,
  onClick,
  onShare,
  labels,
  compact = false
}: {
  job: Job;
  isSaved: boolean;
  onSave: (id: string) => void;
  onClick: (job: Job) => void;
  onShare: (job: Job) => void;
  labels: Labels;
  compact?: boolean;
}) {
  return (
    <motion.article
      layout
      layoutId={job.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={springTransition}
      onClick={() => onClick(job)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick(job))}
      tabIndex={0}
      role="button"
      aria-label={`${job.title} hos ${job.employer}`}
      className={clsx(
        'group relative flex cursor-pointer flex-col rounded-2xl border bg-white dark:bg-gray-900',
        'border-gray-200/60 dark:border-gray-800',
        'hover:border-gray-300 dark:hover:border-gray-700',
        'hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-950/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'transition-all duration-200'
      )}
    >
      {/* Action buttons */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onShare(job); }}
          aria-label="Dela jobb"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100/90 dark:bg-gray-800/90 backdrop-blur text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSave(job.id); }}
          aria-label={isSaved ? 'Ta bort från sparade' : 'Spara jobb'}
          aria-pressed={isSaved}
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-full transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            isSaved
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
              : 'bg-gray-100/90 dark:bg-gray-800/90 backdrop-blur text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
          )}
        >
          <Heart className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className={clsx('p-5', compact && 'p-4')}>
        <div className="flex items-start gap-3.5 mb-3">
          <CompanyLogo name={job.employer} logoUrl={job.logoUrl} size={compact ? 40 : 44} />
          <div className="min-w-0 flex-1 pr-16">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
              {job.employer}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-gray-500 dark:text-gray-400">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-xs truncate">{job.location || 'Sverige'}</span>
            </div>
          </div>
        </div>

        <h3 className={clsx(
          'font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 mb-3',
          'group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors',
          compact ? 'text-sm' : 'text-base'
        )}>
          {job.title}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {job.employmentType && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {job.employmentType}
            </span>
          )}
          {job.deadline && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {job.deadline}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      {!compact && (
        <div className="mt-auto border-t border-gray-100 dark:border-gray-800 p-4 flex gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(job); }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {labels.showMore}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); window.openai?.openExternal?.({ href: job.url }); }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {labels.apply}
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </motion.article>
  );
}

// Job detail modal
function JobDetailModal({
  job,
  onClose,
  labels,
  salaryData,
  salaryLoading,
  onRequestSalary,
  onShare,
  isSaved,
  onSave
}: {
  job: Job;
  onClose: () => void;
  labels: Labels;
  salaryData: SalaryData | null;
  salaryLoading: boolean;
  onRequestSalary: (job: Job) => void;
  onShare: (job: Job) => void;
  isSaved: boolean;
  onSave: (id: string) => void;
}) {
  const [description, setDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (job.fullDescription || job.description) {
      setDescription(job.fullDescription || job.description || '');
      return;
    }
    setLoading(true);
    fetch(`https://api.smidra.se/api/job/${job.id}`)
      .then(res => res.json())
      .then(data => { setDescription(data.fullDescription || data.description || labels.noDesc || ''); setLoading(false); })
      .catch(() => { setDescription(labels.noDesc || 'Ingen beskrivning.'); setLoading(false); });
  }, [job, labels.noDesc]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overscroll-contain"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={springTransition}
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with actions */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={() => onShare(job)}
            aria-label="Dela"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => onSave(job.id)}
            aria-label={isSaved ? 'Ta bort' : 'Spara'}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              isSaved
                ? 'bg-rose-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            <Heart className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Stäng"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Header content */}
        <div className="flex-shrink-0 p-6 pb-0">
          <div className="flex items-start gap-4 pr-32">
            <CompanyLogo name={job.employer} logoUrl={job.logoUrl} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{job.employer}</p>
              <h2 id="modal-title" className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {job.title}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 pb-5 border-b border-gray-100 dark:border-gray-800">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
              <MapPin className="w-4 h-4" aria-hidden="true" />
              {job.location || 'Sverige'}
            </span>
            {job.deadline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4" aria-hidden="true" />
                <time>{job.deadline}</time>
              </span>
            )}
            {job.employmentType && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300">
                {job.employmentType}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-4/6" />
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
              {description}
            </div>
          )}

          {/* Salary section */}
          {salaryLoading && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50" role="status">
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{labels.fetchingSalary}</span>
            </div>
          )}

          {salaryData?.salary && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 ring-1 ring-emerald-200 dark:ring-emerald-800/50"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{labels.salaryTitle}</span>
              </div>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-2 tabular-nums tracking-tight">
                {salaryData.salary.avg?.toLocaleString('sv-SE')}&nbsp;{labels.krPerMonth}
              </p>
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                <span>{labels.salaryMin}: {salaryData.salary.min?.toLocaleString('sv-SE')} kr</span>
                <span>{labels.salaryMax}: {salaryData.salary.max?.toLocaleString('sv-SE')} kr</span>
              </div>
              {salaryData.translatedTips?.length > 0 && (
                <ul className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800/50 space-y-2">
                  {salaryData.translatedTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-3 p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <button
            onClick={() => onRequestSalary(job)}
            disabled={salaryLoading || !!salaryData}
            className={clsx(
              'flex-1 px-5 py-3 rounded-xl text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              salaryData
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default'
                : salaryLoading
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-wait'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {salaryLoading ? labels.fetching : salaryData ? `✓ ${labels.salaryShown}` : labels.salaryInfo}
          </button>
          <button
            onClick={() => window.openai?.openExternal?.({ href: job.url })}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {labels.applyNow}
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Tab button
function TabButton({ active, onClick, icon: Icon, children, count }: {
  active: boolean; onClick: () => void; icon: any; children: React.ReactNode; count?: number
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        active
          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {children}
      {count !== undefined && count > 0 && (
        <span className={clsx(
          'ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums',
          active ? 'bg-white/20 dark:bg-gray-900/20' : 'bg-gray-200 dark:bg-gray-700'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// Filter pill
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        active
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
    >
      {children}
    </button>
  );
}

// Sort dropdown
function SortDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        <option value="newest">Nyast först</option>
        <option value="deadline">Deadline</option>
        <option value="employer">Företag A-Ö</option>
      </select>
      <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );
}

// Main App
export default function App() {
  const toolOutput = useOpenAiGlobal('toolOutput') as ToolOutput | null;
  const theme = useOpenAiGlobal('theme');
  const maxHeight = useMaxHeight();

  const [widgetState, setWidgetState] = useWidgetState<WidgetState>(createDefaultWidgetState);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryData | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false, icon: 'heart' as 'heart' | 'check' | 'share' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'fulltime' | 'parttime'>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [isLoading, setIsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const widgetSessionId = useRef('ws_' + Math.random().toString(36).substr(2, 9));
  const langRef = useRef('sv');
  const hasTriggeredFullscreen = useRef(false);
  const lastToolOutputRef = useRef<string>('');

  // Filter and sort jobs
  const displayJobs = useMemo(() => {
    let filtered = activeTab === 'saved'
      ? jobs.filter(j => widgetState.savedJobs.includes(j.id))
      : jobs;

    // Apply type filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(j => {
        const type = (j.employmentType || '').toLowerCase();
        return activeFilter === 'fulltime' ? type.includes('heltid') : type.includes('deltid');
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'newest') return 0; // Keep original order
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      }
      if (sortBy === 'employer') return a.employer.localeCompare(b.employer);
      return 0;
    });

    return sorted;
  }, [jobs, activeTab, activeFilter, sortBy, widgetState.savedJobs]);

  const totalPages = Math.ceil(displayJobs.length / JOBS_PER_PAGE);
  const currentPage = Math.min(widgetState.currentPage, totalPages || 1);
  const pageJobs = displayJobs.slice((currentPage - 1) * JOBS_PER_PAGE, currentPage * JOBS_PER_PAGE);
  const savedCount = widgetState.savedJobs.filter(id => jobs.some(j => j.id === id)).length;

  const showToast = useCallback((msg: string, icon: 'heart' | 'check' | 'share' = 'heart') => {
    setToast({ message: msg, visible: true, icon });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  const toggleFullscreen = useCallback(async (forced?: boolean) => {
    const newMode = forced !== undefined ? forced : !isFullscreen;
    setIsFullscreen(newMode);
    try { await window.openai?.requestDisplayMode?.({ mode: newMode ? 'fullscreen' : 'inline' }); } catch {}
  }, [isFullscreen]);

  const toggleSave = useCallback((id: string) => {
    setWidgetState(prev => {
      const isSaved = prev.savedJobs.includes(id);
      if (!isSaved) showToast('Sparat!', 'heart');
      return { ...prev, savedJobs: isSaved ? prev.savedJobs.filter(x => x !== id) : [...prev.savedJobs, id] };
    });
  }, [setWidgetState, showToast]);

  const shareJob = useCallback(async (job: Job) => {
    const shareData = {
      title: job.title,
      text: `${job.title} hos ${job.employer}`,
      url: job.url
    };

    // Try native share first (mobile)
    if (navigator.share && isMobile) {
      try {
        await navigator.share(shareData);
        showToast('Delat!', 'share');
        return;
      } catch {}
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(job.url);
      showToast('Länk kopierad!', 'check');
    } catch {
      // Last resort: open external
      window.openai?.openExternal?.({ href: job.url });
    }
  }, [showToast]);

  const handleSearch = useCallback(() => {
    if (!searchInput.trim()) return;
    const msg = `Sök jobb: ${searchInput}`;
    window.openai?.sendFollowUpMessage?.({ prompt: msg });
    setSearchInput('');
  }, [searchInput]);

  const requestSalary = useCallback((job: Job) => {
    setSalaryLoading(true);
    setSalaryData(null);
    const msg = `Visa lönestatistik för "${job.title}" i ${job.location || 'Sverige'}.\nAnropa: { "widgetSessionId": "${widgetSessionId.current}", "jobContext": { "title": "${job.title}", "location": "${job.location || 'Sverige'}" }, "info": { "type": "compensation", "data": { "avg": X, "min": X, "max": X }, "tips": [...], "sources": ["SCB"] } }\n[Använd update_widget_info från Smidra MCP.]`;
    window.openai?.sendFollowUpMessage?.({ prompt: msg });
  }, []);

  const closeModal = useCallback(() => { setSelectedJob(null); setSalaryData(null); setSalaryLoading(false); }, []);

  // SSE for salary
  useEffect(() => {
    const es = new EventSource(`https://api.smidra.se/events?session=${widgetSessionId.current}`);
    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'salary' || data.type === 'market_info') {
          if (langRef.current !== 'sv' && data.tips?.length) {
            data.translatedTips = await translateBatch(data.tips, langRef.current);
          } else { data.translatedTips = data.tips || []; }
          setSalaryData(data);
          setSalaryLoading(false);
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  // Handle tool output
  const handleData = useCallback(async (data: ToolOutput) => {
    if (!data?.jobs) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastToolOutputRef.current) return;
    lastToolOutputRef.current = serialized;

    setIsLoading(true);
    setHasReceivedData(true);
    const lang = data.language || 'sv';
    langRef.current = lang;

    if ((data.translateMode || lang !== 'sv') && data.jobs?.length) {
      const [translatedJobs, translatedLabels] = await Promise.all([
        translateJobs(data.jobs, lang),
        translateLabels(DEFAULT_LABELS, lang)
      ]);
      setJobs(translatedJobs);
      setLabels(translatedLabels);
      if (data.query) {
        const [tQ, tL] = await translateBatch([data.query, data.location || ''], lang);
        setQuery(tQ); setLocation(tL);
      }
    } else {
      setJobs(data.jobs || []);
      setQuery(data.query || '');
      setLocation(data.location || '');
      setLabels(DEFAULT_LABELS);
    }

    setTotalAvailable(data.total || data.jobs?.length || 0);
    setActiveTab('all');
    setWidgetState(s => ({ ...s, currentPage: 1 }));
    setIsLoading(false);

    if (!hasTriggeredFullscreen.current && data.jobs?.length > 0) {
      hasTriggeredFullscreen.current = true;
      setTimeout(() => toggleFullscreen(true), 100);
    }
  }, [toggleFullscreen, setWidgetState]);

  useEffect(() => { if (toolOutput) handleData(toolOutput); }, [toolOutput, handleData]);
  useEffect(() => { if (theme) document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  useEffect(() => {
    const h = isFullscreen ? (maxHeight || window.innerHeight) : document.body.scrollHeight;
    window.openai?.notifyIntrinsicHeight?.(h);
  }, [pageJobs, isFullscreen, maxHeight, hasReceivedData]);

  // Welcome screen
  if (!hasReceivedData) {
    return (
      <div className="min-h-[420px] w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Search className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">Smidra</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm leading-relaxed">
            Hitta ditt nästa jobb direkt i ChatGPT.
            <br />Skriv vad du letar efter.
          </p>
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400" role="status">
            <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            Väntar på sökning…
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'w-full bg-gray-50 dark:bg-gray-950 flex flex-col',
        isFullscreen && 'fixed inset-0 z-40'
      )}
      style={{
        height: isFullscreen ? '100%' : 'auto',
        maxHeight: isFullscreen ? '100%' : undefined
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800 flex-shrink-0">
        <div className="px-4 sm:px-6 py-4">
          {/* Top row */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <Building2 className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Jobbsökning
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 truncate tracking-tight">
                {query || 'Lediga tjänster'}
              </h1>
            </div>

            {/* Fullscreen toggle */}
            <button
              onClick={() => toggleFullscreen()}
              aria-label={isFullscreen ? 'Minimera' : 'Fullskärm'}
              className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-4">
            {location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" aria-hidden="true" />
                {location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{totalAvailable}</span>
              {labels.jobs}
            </span>
          </div>

          {/* Search bar (fullscreen only) */}
          {isFullscreen && (
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Sök nytt jobb..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 border-0 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!searchInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Sök
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" role="tablist">
            <TabButton
              active={activeTab === 'all'}
              onClick={() => { setActiveTab('all'); setWidgetState(s => ({ ...s, currentPage: 1 })); }}
              icon={Search}
            >
              {labels.all}
            </TabButton>
            <TabButton
              active={activeTab === 'saved'}
              onClick={() => { setActiveTab('saved'); setWidgetState(s => ({ ...s, currentPage: 1 })); }}
              icon={Bookmark}
              count={savedCount}
            >
              Sparade
            </TabButton>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 pb-3 overflow-x-auto">
          <div className="flex items-center gap-2">
            <FilterPill active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>
              Alla typer
            </FilterPill>
            <FilterPill active={activeFilter === 'fulltime'} onClick={() => setActiveFilter('fulltime')}>
              {labels.fulltime}
            </FilterPill>
            <FilterPill active={activeFilter === 'parttime'} onClick={() => setActiveFilter('parttime')}>
              {labels.parttime}
            </FilterPill>
          </div>
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {isLoading ? (
          <div className={clsx(
            'grid gap-3 sm:gap-4 p-4 sm:p-6',
            isFullscreen ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
          )}>
            {[...Array(8)].map((_, i) => <JobCardSkeleton key={i} />)}
          </div>
        ) : displayJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-20 px-6 text-center">
            <div className="w-14 h-14 mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {activeTab === 'saved' ? (
                <Bookmark className="w-7 h-7 text-gray-400" aria-hidden="true" />
              ) : (
                <Search className="w-7 h-7 text-gray-400" aria-hidden="true" />
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {activeTab === 'saved' ? 'Inga sparade jobb' : labels.noJobs}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              {activeTab === 'saved' ? 'Klicka på hjärtat för att spara jobb' : labels.tryOther}
            </p>
          </div>
        ) : (
          <>
            <LayoutGroup id="jobs-grid">
              <div
                id="job-list"
                role="tabpanel"
                className={clsx(
                  'grid gap-3 sm:gap-4 p-4 sm:p-6',
                  isFullscreen ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
                )}
              >
                <AnimatePresence mode="popLayout">
                  {pageJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      isSaved={widgetState.savedJobs.includes(job.id)}
                      onSave={toggleSave}
                      onClick={setSelectedJob}
                      onShare={shareJob}
                      labels={labels}
                      compact={isFullscreen && isMobile}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </LayoutGroup>

            {/* Pagination */}
            {totalPages > 1 && (
              <nav className="flex items-center justify-center gap-3 py-6 border-t border-gray-200/60 dark:border-gray-800" aria-label="Pagination">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setWidgetState(s => ({ ...s, currentPage: s.currentPage - 1 }))}
                  aria-label="Föregående"
                  className="h-10 w-10 rounded-xl flex items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <span className="min-w-[80px] text-center text-sm font-medium text-gray-600 dark:text-gray-400 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setWidgetState(s => ({ ...s, currentPage: s.currentPage + 1 }))}
                  aria-label="Nästa"
                  className="h-10 w-10 rounded-xl flex items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </nav>
            )}

            {/* Bottom padding for mobile */}
            <div className="h-20 sm:h-6" />
          </>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {selectedJob && (
          <JobDetailModal
            job={selectedJob}
            onClose={closeModal}
            labels={labels}
            salaryData={salaryData}
            salaryLoading={salaryLoading}
            onRequestSalary={requestSalary}
            onShare={shareJob}
            isSaved={widgetState.savedJobs.includes(selectedJob.id)}
            onSave={toggleSave}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={springTransition}
            role="status"
            aria-live="polite"
            className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium shadow-xl z-50 flex items-center gap-2"
          >
            {toast.icon === 'heart' && <Heart className="w-4 h-4 text-rose-400" fill="currentColor" aria-hidden="true" />}
            {toast.icon === 'check' && <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
            {toast.icon === 'share' && <Share2 className="w-4 h-4 text-blue-400" aria-hidden="true" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
