import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
  JobCard,
  JobDetail,
  FilterBar,
  Header,
  Pagination,
  EmptyState,
  LoadingScreen,
  Toast
} from './components';
import { useOpenAiGlobal, useWidgetState, useDisplayMode, useMaxHeight } from './hooks';
import { translateJobs, translateLabels, translateBatch } from './utils/translate';
import type { Job, Labels, SalaryData, ToolOutput, WidgetState } from './types';

const JOBS_PER_PAGE = 12;

const DEFAULT_LABELS: Labels = {
  jobs: 'jobb',
  map: 'Karta',
  all: 'Alla',
  fulltime: 'Heltid',
  parttime: 'Deltid',
  showMore: 'Läs mer',
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
  salaryShown: 'Lönedata visas',
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

export default function App() {
  // OpenAI hooks
  const toolOutput = useOpenAiGlobal('toolOutput') as ToolOutput | null;
  const theme = useOpenAiGlobal('theme');
  const displayMode = useDisplayMode();
  const maxHeight = useMaxHeight();

  // Widget state (persisted)
  const [widgetState, setWidgetState] = useWidgetState<WidgetState>(createDefaultWidgetState);

  // Local state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Söker efter lediga tjänster...');
  const [waitingText, setWaitingText] = useState('Vänta, hämtar data...');
  const [targetLanguage, setTargetLanguage] = useState('sv');
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryData | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const widgetSessionId = useRef('ws_' + Math.random().toString(36).substr(2, 9));
  const eventSourceRef = useRef<EventSource | null>(null);
  const langRef = useRef('sv');
  const hasInitialized = useRef(false);

  // Derived state
  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (widgetState.filter === 'all') return true;
      const type = (j.employmentType || '').toLowerCase();
      return widgetState.filter === 'fulltime'
        ? type.includes('heltid')
        : type.includes('deltid');
    });
  }, [jobs, widgetState.filter]);

  const totalPages = Math.ceil(filteredJobs.length / JOBS_PER_PAGE);
  const currentPage = Math.min(widgetState.currentPage, totalPages || 1);
  const pageJobs = filteredJobs.slice(
    (currentPage - 1) * JOBS_PER_PAGE,
    currentPage * JOBS_PER_PAGE
  );

  // Toast helper
  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  // Toggle fullscreen - AUTO-TRIGGER on first load
  const toggleFullscreen = useCallback(async (forcedMode?: boolean) => {
    const newMode = forcedMode !== undefined ? forcedMode : !isFullscreen;
    setIsFullscreen(newMode);

    try {
      await window.openai?.requestDisplayMode?.({ mode: newMode ? 'fullscreen' : 'inline' });
    } catch (e) {
      console.log('Display mode change:', e);
    }
  }, [isFullscreen]);

  // Save job
  const toggleSave = useCallback((id: string) => {
    setWidgetState(prev => {
      const isSaved = prev.savedJobs.includes(id);
      if (!isSaved) showToast(labels.saved || 'Sparad!');
      return {
        ...prev,
        savedJobs: isSaved
          ? prev.savedJobs.filter(x => x !== id)
          : [...prev.savedJobs, id]
      };
    });
  }, [setWidgetState, showToast, labels.saved]);

  // Request salary via ChatGPT
  const requestSalary = useCallback((job: Job) => {
    console.log('💰 requestSalary:', job.title);
    setSalaryLoading(true);
    setSalaryData(null);

    const message = `Visa lönestatistik för "${job.title}" i ${job.location || 'Sverige'}.

Anropa med denna data:
{
  "widgetSessionId": "${widgetSessionId.current}",
  "jobContext": { "title": "${job.title}", "location": "${job.location || 'Sverige'}" },
  "info": {
    "type": "compensation",
    "data": { "avg": [genomsnitt], "min": [lägsta], "max": [högsta] },
    "tips": ["förhandlingstips..."],
    "sources": ["SCB", "Unionen", "Sveriges Ingenjörer"]
  }
}

[Använd endast update_widget_info verktyget från Smidra MCP. Skicka ingen text - anropa bara verktyget.]`;

    window.openai?.sendFollowUpMessage?.({ prompt: message });
  }, []);

  // Close modal
  const handleCloseModal = useCallback(() => {
    setSelectedJob(null);
    setSalaryData(null);
    setSalaryLoading(false);
  }, []);

  // SSE connection for real-time salary updates
  useEffect(() => {
    console.log('🔌 Connecting SSE:', widgetSessionId.current);
    const es = new EventSource(`https://api.smidra.se/events?session=${widgetSessionId.current}`);
    eventSourceRef.current = es;

    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 SSE event:', data.type);

        if (data.type === 'salary' || data.type === 'market_info') {
          const lang = langRef.current;
          if (lang && lang !== 'sv' && data.tips?.length) {
            data.translatedTips = await translateBatch(data.tips, lang);
          } else {
            data.translatedTips = data.tips || [];
          }
          setSalaryData(data);
          setSalaryLoading(false);
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    return () => {
      console.log('🔌 Closing SSE');
      es.close();
    };
  }, []);

  // Handle incoming tool data
  const handleData = useCallback(async (data: ToolOutput) => {
    if (!data) return;

    const lang = data.language || 'sv';
    setTargetLanguage(lang);
    langRef.current = lang;

    const needsTranslation = data.translateMode || lang !== 'sv';

    if (needsTranslation && data.jobs?.length) {
      console.log(`🌐 Translating to ${lang}...`);
      const [translatedJobs, translatedLabels] = await Promise.all([
        translateJobs(data.jobs, lang),
        translateLabels(DEFAULT_LABELS, lang)
      ]);
      setJobs(translatedJobs);
      setLabels(translatedLabels);

      if (data.query) {
        const [tQuery, tLocation] = await translateBatch(
          [data.query, data.location || ''],
          lang
        );
        setQuery(tQuery);
        setLocation(tLocation);
      }
    } else {
      setJobs(data.jobs || []);
      setQuery(data.query || '');
      setLocation(data.location || '');
      setLabels(DEFAULT_LABELS);
    }

    setTotalAvailable(data.total || data.jobs?.length || 0);
    setLoadedCount(data.jobs?.length || 0);
    setLoading(false);

    // AUTO-FULLSCREEN on first data load
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      // Small delay to ensure widget is ready
      setTimeout(() => toggleFullscreen(true), 100);
    }
  }, [toggleFullscreen]);

  // Listen for tool output changes
  useEffect(() => {
    if (toolOutput) {
      console.log('📥 toolOutput received:', toolOutput.jobs?.length, 'jobs');
      handleData(toolOutput);
    }
  }, [toolOutput, handleData]);

  // Apply theme
  useEffect(() => {
    if (theme) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // Notify height changes
  useEffect(() => {
    const height = isFullscreen ? (maxHeight || window.innerHeight) : document.body.scrollHeight;
    window.openai?.notifyIntrinsicHeight?.(height);
  }, [pageJobs, isFullscreen, maxHeight, widgetState.showMap]);

  // Loading state
  if (loading) {
    return <LoadingScreen loadingText={loadingText} waitingText={waitingText} />;
  }

  const containerHeight = isFullscreen ? maxHeight || '100vh' : 'auto';

  return (
    <div
      className={clsx(
        'w-full bg-gray-50 dark:bg-gray-950 transition-colors',
        isFullscreen && 'min-h-screen'
      )}
      style={{ height: typeof containerHeight === 'number' ? containerHeight : undefined }}
    >
      <Header
        query={query}
        location={location}
        totalJobs={totalAvailable}
        loadedCount={loadedCount}
        labels={labels}
        isFullscreen={isFullscreen}
      />

      <FilterBar
        filter={widgetState.filter}
        onFilterChange={(f) => setWidgetState(s => ({ ...s, filter: f, currentPage: 1 }))}
        showMap={widgetState.showMap}
        onToggleMap={() => setWidgetState(s => ({ ...s, showMap: !s.showMap }))}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => toggleFullscreen()}
        labels={labels}
      />

      {/* Map placeholder - could integrate Mapbox here */}
      <AnimatePresence>
        {widgetState.showMap && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: isFullscreen ? 300 : 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-4 mb-4 rounded-2xl overflow-hidden bg-gray-200 dark:bg-gray-800 border border-black/5 dark:border-white/5"
          >
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <span>Karta - {filteredJobs.length} jobb</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job grid */}
      {filteredJobs.length === 0 ? (
        <EmptyState labels={labels} />
      ) : (
        <>
          <div className={clsx(
            'grid gap-4 px-4 pb-6',
            isFullscreen
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-2'
          )}>
            {pageJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                isSaved={widgetState.savedJobs.includes(job.id)}
                onSave={toggleSave}
                onClick={setSelectedJob}
                labels={labels}
                index={index}
              />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(p) => {
              setWidgetState(s => ({ ...s, currentPage: p }));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {/* Job detail modal */}
      <AnimatePresence>
        {selectedJob && (
          <JobDetail
            job={selectedJob}
            onClose={handleCloseModal}
            labels={labels}
            targetLanguage={targetLanguage}
            salaryData={salaryData}
            salaryLoading={salaryLoading}
            onRequestSalary={requestSalary}
          />
        )}
      </AnimatePresence>

      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
