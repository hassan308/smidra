import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion, type Variants } from 'framer-motion';
import clsx from 'clsx';
import { MapPin, Clock, Heart, ExternalLink, X, Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { useOpenAiGlobal, useWidgetState, useDisplayMode, useMaxHeight } from './hooks';
import { translateJobs, translateLabels, translateBatch } from './utils/translate';
import type { Job, Labels, SalaryData, ToolOutput, WidgetState } from './types';

const JOBS_PER_PAGE = 9;

// Respect prefers-reduced-motion
const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

// Animation variants with reduced motion support
const cardVariants: Variants = prefersReducedMotion
  ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
  : {
      initial: { opacity: 0, scale: 0.98 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.98 }
    };

const modalVariants: Variants = prefersReducedMotion
  ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
  : {
      initial: { opacity: 0, scale: 0.95, y: 20 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.95, y: 20 }
    };

const fadeVariants: Variants = prefersReducedMotion
  ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
  : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

const toastVariants: Variants = prefersReducedMotion
  ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
  : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 20 } };

const DEFAULT_LABELS: Labels = {
  jobs: 'jobb',
  map: 'Karta',
  all: 'Alla',
  fulltime: 'Heltid',
  parttime: 'Deltid',
  showMore: 'Visa mer',
  apply: 'Ansök',
  applyNow: 'Ansök nu',
  saved: 'Sparad!',
  noJobs: 'Inga jobb hittades',
  tryOther: 'Prova att söka efter något annat',
  loadingDesc: 'Laddar...',
  noDesc: 'Ingen beskrivning tillgänglig.',
  salaryInfo: 'Löneinfo',
  fetchingSalary: 'Hämtar lönestatistik...',
  salaryTitle: 'Lönestatistik',
  salaryShown: 'Visas',
  krPerMonth: 'kr/mån',
  salaryMin: 'Min',
  salaryMax: 'Max',
  sources: 'Källor',
  fetching: 'Hämtar...'
};

const createDefaultWidgetState = (): WidgetState => ({
  savedJobs: [],
  filter: 'all',
  showMap: false,
  currentPage: 1
});

// Company logo with fallback - explicit dimensions for layout stability
function CompanyLogo({ name, logoUrl, size = 48 }: { name: string; logoUrl?: string; size?: number }) {
  const [error, setError] = useState(false);
  const initials = name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '?';

  if (error || !logoUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-sm"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${name} logo`}
      >
        {initials}
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
      className="rounded-2xl object-cover bg-slate-100 dark:bg-slate-700"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}

// Job card component - accessible, keyboard navigable
function JobCard({
  job,
  isSaved,
  onSave,
  onClick,
  labels
}: {
  job: Job;
  isSaved: boolean;
  onSave: (id: string) => void;
  onClick: (job: Job) => void;
  labels: Labels;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(job);
    }
  };

  return (
    <motion.article
      layout
      layoutId={job.id}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 26, mass: 0.8 }}
      onClick={() => onClick(job)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      aria-label={`${job.title} hos ${job.employer}`}
      className={clsx(
        'group flex cursor-pointer flex-col overflow-hidden rounded-3xl border bg-white dark:bg-slate-900 transition-[border-color,box-shadow] duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'touch-action-manipulation',
        isHovered ? 'border-black/20 dark:border-white/20 shadow-lg' : 'border-black/[0.08] dark:border-white/[0.08]'
      )}
    >
      {/* Header with logo */}
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo name={job.employer} logoUrl={job.logoUrl} size={48} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{job.employer}</p>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              <span className="truncate">{job.location || 'Sverige'}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSave(job.id); }}
          aria-label={isSaved ? `Ta bort ${job.title} från sparade` : `Spara ${job.title}`}
          aria-pressed={isSaved}
          className={clsx(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
            isSaved
              ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-500'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
          )}
        >
          <Heart className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>

      {/* Title */}
      <div className="px-5 pb-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
          {job.title}
        </h3>
      </div>

      {/* Meta */}
      <div className="px-5 pb-4 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {job.deadline && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            <time>{job.deadline}</time>
          </span>
        )}
        {job.employmentType && (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {job.employmentType}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 p-4 pt-0 mt-auto border-t border-slate-100 dark:border-slate-800">
        <Button
          type="button"
          variant="outline"
          color="secondary"
          size="sm"
          className="flex-1 focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={(e) => { e.stopPropagation(); onClick(job); }}
        >
          {labels.showMore || 'Visa mer'}
        </Button>
        <Button
          type="button"
          variant="solid"
          color="primary"
          size="sm"
          className="flex-1 focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={(e) => {
            e.stopPropagation();
            window.openai?.openExternal?.({ href: job.url });
          }}
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          {labels.apply || 'Ansök'}
        </Button>
      </div>
    </motion.article>
  );
}

// Job detail modal - accessible dialog with focus trap
function JobDetailModal({
  job,
  onClose,
  labels,
  salaryData,
  salaryLoading,
  onRequestSalary
}: {
  job: Job;
  onClose: () => void;
  labels: Labels;
  salaryData: SalaryData | null;
  salaryLoading: boolean;
  onRequestSalary: (job: Job) => void;
}) {
  const [description, setDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
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
      .then(data => {
        setDescription(data.fullDescription || data.description || labels.noDesc || '');
        setLoading(false);
      })
      .catch(() => {
        setDescription(labels.noDesc || 'Ingen beskrivning tillgänglig.');
        setLoading(false);
      });
  }, [job, labels.noDesc]);

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overscroll-contain"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <motion.div
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800 p-6 pb-4">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Stäng dialog"
            className={clsx(
              'absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full transition-colors',
              'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
              'hover:bg-slate-200 dark:hover:bg-slate-700',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
            )}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-4 pr-12">
            <CompanyLogo name={job.employer} logoUrl={job.logoUrl} size={56} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{job.employer}</p>
              <h2 id="modal-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100 leading-tight mt-1">{job.title}</h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              {job.location || 'Sverige'}
            </span>
            {job.deadline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <time>{job.deadline}</time>
              </span>
            )}
          </div>
        </div>

        {/* Body - scrollable with smooth scrolling */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Laddar beskrivning">
              <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-slate-600 dark:border-t-slate-300 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {description}
            </div>
          )}

          {/* Salary section */}
          {salaryLoading && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800" role="status" aria-label={labels.fetchingSalary}>
              <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 border-t-slate-600 dark:border-t-slate-300 rounded-full animate-spin" />
              <span className="text-sm text-slate-500 dark:text-slate-400">{labels.fetchingSalary}</span>
            </div>
          )}

          {salaryData?.salary && (
            <motion.div
              variants={prefersReducedMotion ? fadeVariants : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }}
              initial="initial"
              animate="animate"
              className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-slate-50 dark:from-emerald-900/20 dark:to-slate-800 border border-emerald-100 dark:border-emerald-800/50"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg" aria-hidden="true">💰</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{labels.salaryTitle}</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2 tabular-nums">
                {salaryData.salary.avg?.toLocaleString('sv-SE')}&nbsp;{labels.krPerMonth}
              </p>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-3 tabular-nums">
                <span>{labels.salaryMin}: {salaryData.salary.min?.toLocaleString('sv-SE')}&nbsp;kr</span>
                <span>{labels.salaryMax}: {salaryData.salary.max?.toLocaleString('sv-SE')}&nbsp;kr</span>
              </div>
              {salaryData.translatedTips?.length > 0 && (
                <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 mt-3 pt-3 border-t border-emerald-100 dark:border-emerald-800/50">
                  {salaryData.translatedTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5" aria-hidden="true">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-3 p-4 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="outline"
            color="secondary"
            className="flex-1 focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={() => onRequestSalary(job)}
            disabled={salaryLoading || !!salaryData}
          >
            {salaryLoading ? labels.fetching : salaryData ? `✓ ${labels.salaryShown}` : labels.salaryInfo}
          </Button>
          <Button
            variant="solid"
            color="primary"
            className="flex-1 focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={() => window.openai?.openExternal?.({ href: job.url })}
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            {labels.applyNow}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Main App
export default function App() {
  const toolOutput = useOpenAiGlobal('toolOutput') as ToolOutput | null;
  const theme = useOpenAiGlobal('theme');
  const displayMode = useDisplayMode();
  const maxHeight = useMaxHeight();

  const [widgetState, setWidgetState] = useWidgetState<WidgetState>(createDefaultWidgetState);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [targetLanguage, setTargetLanguage] = useState('sv');
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryData | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'fulltime' | 'parttime'>('all');

  const widgetSessionId = useRef('ws_' + Math.random().toString(36).substr(2, 9));
  const langRef = useRef('sv');
  const hasTriggeredFullscreen = useRef(false);
  const lastToolOutputRef = useRef<string>('');

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (activeFilter === 'all') return true;
      const type = (j.employmentType || '').toLowerCase();
      return activeFilter === 'fulltime' ? type.includes('heltid') : type.includes('deltid');
    });
  }, [jobs, activeFilter]);

  const totalPages = Math.ceil(filteredJobs.length / JOBS_PER_PAGE);
  const currentPage = Math.min(widgetState.currentPage, totalPages || 1);
  const pageJobs = filteredJobs.slice((currentPage - 1) * JOBS_PER_PAGE, currentPage * JOBS_PER_PAGE);

  // Toast
  const showToast = useCallback((msg: string) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  // Fullscreen
  const toggleFullscreen = useCallback(async (forced?: boolean) => {
    const newMode = forced !== undefined ? forced : !isFullscreen;
    setIsFullscreen(newMode);
    try {
      await window.openai?.requestDisplayMode?.({ mode: newMode ? 'fullscreen' : 'inline' });
    } catch {}
  }, [isFullscreen]);

  // Save job
  const toggleSave = useCallback((id: string) => {
    setWidgetState(prev => {
      const isSaved = prev.savedJobs.includes(id);
      if (!isSaved) showToast(labels.saved || 'Sparad!');
      return {
        ...prev,
        savedJobs: isSaved ? prev.savedJobs.filter(x => x !== id) : [...prev.savedJobs, id]
      };
    });
  }, [setWidgetState, showToast, labels.saved]);

  // Request salary
  const requestSalary = useCallback((job: Job) => {
    setSalaryLoading(true);
    setSalaryData(null);
    const msg = `Visa lönestatistik för "${job.title}" i ${job.location || 'Sverige'}.
Anropa med: { "widgetSessionId": "${widgetSessionId.current}", "jobContext": { "title": "${job.title}", "location": "${job.location || 'Sverige'}" }, "info": { "type": "compensation", "data": { "avg": [genomsnitt], "min": [lägsta], "max": [högsta] }, "tips": ["tips..."], "sources": ["SCB"] } }
[Använd endast update_widget_info verktyget från Smidra MCP.]`;
    window.openai?.sendFollowUpMessage?.({ prompt: msg });
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    setSelectedJob(null);
    setSalaryData(null);
    setSalaryLoading(false);
  }, []);

  // SSE for salary
  useEffect(() => {
    const es = new EventSource(`https://api.smidra.se/events?session=${widgetSessionId.current}`);
    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'salary' || data.type === 'market_info') {
          if (langRef.current !== 'sv' && data.tips?.length) {
            data.translatedTips = await translateBatch(data.tips, langRef.current);
          } else {
            data.translatedTips = data.tips || [];
          }
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

    setHasReceivedData(true);
    const lang = data.language || 'sv';
    setTargetLanguage(lang);
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
        setQuery(tQ);
        setLocation(tL);
      }
    } else {
      setJobs(data.jobs || []);
      setQuery(data.query || '');
      setLocation(data.location || '');
      setLabels(DEFAULT_LABELS);
    }

    setTotalAvailable(data.total || data.jobs?.length || 0);

    if (!hasTriggeredFullscreen.current && data.jobs?.length > 0) {
      hasTriggeredFullscreen.current = true;
      setTimeout(() => toggleFullscreen(true), 150);
    }
  }, [toggleFullscreen]);

  useEffect(() => {
    if (toolOutput) handleData(toolOutput);
  }, [toolOutput, handleData]);

  useEffect(() => {
    if (theme) document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const h = isFullscreen ? (maxHeight || window.innerHeight) : document.body.scrollHeight;
    window.openai?.notifyIntrinsicHeight?.(h);
  }, [pageJobs, isFullscreen, maxHeight, hasReceivedData]);

  // Welcome screen - accessible loading state
  if (!hasReceivedData) {
    return (
      <div className="min-h-[400px] w-full bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-8">
        <motion.div
          variants={prefersReducedMotion ? fadeVariants : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }}
          initial="initial"
          animate="animate"
          className="text-center"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
            <Briefcase className="w-10 h-10 text-slate-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2 text-balance">Smidra</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Sök efter lediga jobb i Sverige</p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400" role="status" aria-label="Väntar på sökning">
            <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-slate-500 dark:border-t-slate-400 rounded-full animate-spin" />
            <span>Väntar på sökning…</span>
          </div>
        </motion.div>
      </div>
    );
  }

  const containerMaxHeight = isFullscreen ? maxHeight : undefined;

  return (
    <div
      className={clsx('w-full bg-white dark:bg-slate-900', isFullscreen && 'min-h-screen')}
      style={{ maxHeight: containerMaxHeight, height: isFullscreen ? containerMaxHeight : undefined }}
    >
      {/* Header */}
      <header className="border-b border-slate-100 dark:border-slate-800 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Jobbsökning</p>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 truncate text-balance">{query || 'Lediga tjänster'}</h1>
          </div>
          {!isFullscreen && (
            <Button
              variant="outline"
              color="secondary"
              size="sm"
              onClick={() => toggleFullscreen(true)}
              className="flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Se alla
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          {location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" aria-hidden="true" />
              {location}
            </span>
          )}
          <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{totalAvailable}</span>
          <span>{labels.jobs}</span>
        </div>
      </header>

      {/* Filters - accessible navigation */}
      <nav className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 dark:border-slate-800 overflow-x-auto" role="tablist" aria-label="Filtrera jobb">
        {(['all', 'fulltime', 'parttime'] as const).map((f) => (
          <Button
            key={f}
            variant={activeFilter === f ? 'solid' : 'outline'}
            color="primary"
            size="sm"
            role="tab"
            aria-selected={activeFilter === f}
            aria-controls="job-list"
            onClick={() => { setActiveFilter(f); setWidgetState(s => ({ ...s, currentPage: 1 })); }}
            className="focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {f === 'all' ? labels.all : f === 'fulltime' ? labels.fulltime : labels.parttime}
          </Button>
        ))}
      </nav>

      {/* Job grid */}
      {filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center" role="status">
          <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-slate-400" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">{labels.noJobs}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{labels.tryOther}</p>
        </div>
      ) : (
        <>
          <LayoutGroup id="jobs-grid">
            <div
              id="job-list"
              role="tabpanel"
              aria-label={`${filteredJobs.length} jobb`}
              className={clsx(
                'grid gap-4 p-6',
                isFullscreen ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
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
                    labels={labels}
                  />
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>

          {/* Pagination - accessible navigation */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2 py-6 border-t border-slate-100 dark:border-slate-800" aria-label="Pagination">
              <Button
                variant="outline"
                color="secondary"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setWidgetState(s => ({ ...s, currentPage: s.currentPage - 1 }))}
                aria-label="Föregående sida"
                className="focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </Button>
              <span className="px-4 text-sm text-slate-600 dark:text-slate-300 tabular-nums" aria-live="polite">
                {currentPage}&nbsp;/&nbsp;{totalPages}
              </span>
              <Button
                variant="outline"
                color="secondary"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setWidgetState(s => ({ ...s, currentPage: s.currentPage + 1 }))}
                aria-label="Nästa sida"
                className="focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}

      {/* Job detail modal */}
      <AnimatePresence>
        {selectedJob && (
          <JobDetailModal
            job={selectedJob}
            onClose={closeModal}
            labels={labels}
            salaryData={salaryData}
            salaryLoading={salaryLoading}
            onRequestSalary={requestSalary}
          />
        )}
      </AnimatePresence>

      {/* Toast - accessible live region */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            variants={toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium shadow-lg z-50"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
