import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, ExternalLink, X } from 'lucide-react';
import { useOpenAiGlobal, useWidgetState } from './hooks';
import { translateJobs, translateLabels } from './utils/translate';
import type { Job, Labels, ToolOutput, WidgetState } from './types';
import './styles/ny-design.css';

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

// Brand colors based on company
const getBrandColors = (employer: string) => {
  if (employer.includes('Spotify')) return { brand: '#1DB954', brandTint: 'rgba(29, 185, 84, 0.1)', brandDim: 'rgba(29, 185, 84, 0.3)' };
  if (employer.includes('IKEA')) return { brand: '#0058a3', brandTint: 'rgba(0, 88, 163, 0.1)', brandDim: 'rgba(0, 88, 163, 0.3)' };
  if (employer.includes('Apple')) return { brand: '#1a1a1a', brandTint: 'rgba(0,0,0,0.05)', brandDim: 'rgba(0,0,0,0.2)' };
  if (employer.includes('Figma')) return { brand: '#A259FF', brandTint: 'rgba(162, 89, 255, 0.1)', brandDim: 'rgba(162, 89, 255, 0.3)' };
  return { brand: '#64748b', brandTint: 'rgba(100, 116, 139, 0.1)', brandDim: 'rgba(100, 116, 139, 0.2)' };
};

// Verified badge SVG - Blue for all
const VerifiedBadge = () => (
  <svg className="verified-badge" viewBox="0 0 24 24" fill="#3b82f6">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

// Company logo
function CompanyLogo({ name, size = 52 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  const hue = name?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360 || 0;

  return (
    <div
      className="logo-box"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 55%) 0%, hsl(${hue + 30}, 70%, 45%) 100%)`
      }}
    >
      <span style={{ color: '#fff', fontSize: size * 0.4, fontWeight: 600 }}>{initial}</span>
    </div>
  );
}

// Job Card Component
function JobCard({
  job,
  isExpanded,
  onToggle,
  isSaved,
  onSave,
  onClick,
  labels
}: {
  job: Job;
  isExpanded: boolean;
  onToggle: () => void;
  isSaved: boolean;
  onSave: () => void;
  onClick: () => void;
  labels: Labels;
}) {
  const colors = getBrandColors(job.employer);

  return (
    <div
      className={`job-card ${isExpanded ? 'expanded' : ''}`}
      style={{
        // @ts-ignore
        '--brand': colors.brand,
        '--brand-tint': colors.brandTint,
        '--brand-dim': colors.brandDim
      }}
      onClick={onToggle}
    >
      {/* Save button */}
      <button
        onClick={(e) => { e.stopPropagation(); onSave(); }}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 10,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: isSaved ? 'none' : '1px solid rgba(0,0,0,0.1)',
          background: isSaved ? '#f43f5e' : '#fff',
          color: isSaved ? '#fff' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
      >
        <Heart size={16} fill={isSaved ? 'currentColor' : 'none'} />
      </button>

      <div className="card-content">
        <div className="card-header">
          <CompanyLogo name={job.employer} />
          <div className="header-text">
            <h3 className="job-title">{job.title}</h3>
            <div className="company-row">
              <span className="company-name">{job.employer}</span>
              <VerifiedBadge />
            </div>
          </div>
        </div>

        <div className="info-tags">
          {job.isRemote && (
            <span className="tag remote-tag">✅ Distans</span>
          )}
          {job.experienceRequired === false ? (
            <span className="tag no-exp-tag">Kräver ej erfarenhet</span>
          ) : (
            <span className="tag exp-tag">Kräver erfarenhet</span>
          )}
          {job.workingHours && (
            <span className="tag">{job.workingHours}</span>
          )}
          {job.deadline && (
            <span className="tag deadline-tag">Ansök senast {job.deadline}</span>
          )}
        </div>

        <p className="job-description">
          {job.description || 'Ingen beskrivning tillgänglig.'}
        </p>

        <div className="expanded-actions">
          <button
            className="btn btn-salary"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
          >
            {labels.salaryInfo}
          </button>
          <button
            className="btn btn-apply"
            onClick={(e) => { e.stopPropagation(); window.openai?.openExternal?.({ href: job.url }); }}
          >
            {labels.applyNow}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main App
export default function App() {
  const toolOutput = useOpenAiGlobal('toolOutput') as ToolOutput | null;
  const [widgetState, setWidgetState] = useWidgetState<WidgetState>(createDefaultWidgetState);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const toggleSave = useCallback((id: string) => {
    setWidgetState(prev => {
      const isSaved = prev.savedJobs.includes(id);
      return { ...prev, savedJobs: isSaved ? prev.savedJobs.filter(x => x !== id) : [...prev.savedJobs, id] };
    });
  }, [setWidgetState]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedJobId(prev => prev === id ? null : id);
  }, []);

  // Handle tool output
  useEffect(() => {
    if (!toolOutput?.jobs) return;

    const handleData = async () => {
      setHasReceivedData(true);
      const lang = toolOutput.language || 'sv';

      if ((toolOutput.translateMode || lang !== 'sv') && toolOutput.jobs?.length) {
        const [translatedJobs, translatedLabels] = await Promise.all([
          translateJobs(toolOutput.jobs, lang),
          translateLabels(DEFAULT_LABELS as Record<string, string>, lang)
        ]);
        setJobs(translatedJobs);
        setLabels(translatedLabels);
      } else {
        setJobs(toolOutput.jobs || []);
        setLabels(DEFAULT_LABELS);
      }
    };

    handleData();
  }, [toolOutput]);

  if (!hasReceivedData) {
    return (
      <div style={{
        minHeight: '420px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Outfit, sans-serif',
        color: '#64748b',
        fontSize: '14px'
      }}>
        Väntar på jobbsökning...
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: 'Outfit, sans-serif',
      backgroundColor: '#f8fafc',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(0, 0, 0, 0.02) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(0, 0, 0, 0.02) 0px, transparent 50%)',
      padding: '40px 16px',
      minHeight: '100vh'
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ marginBottom: '32px', paddingLeft: '4px' }}>
          <h1 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '2rem',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '8px'
          }}>
            Jobbannonser
          </h1>
          <p style={{ fontSize: '1rem', color: '#64748b' }}>
            {jobs.length} {labels.jobs}
          </p>
        </header>

        <div className="job-grid">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isExpanded={expandedJobId === job.id}
              onToggle={() => toggleExpand(job.id)}
              isSaved={widgetState.savedJobs.includes(job.id)}
              onSave={() => toggleSave(job.id)}
              onClick={() => setSelectedJob(job)}
              labels={labels}
            />
          ))}
        </div>
      </div>

      {/* Modal for job details */}
      <AnimatePresence>
        {selectedJob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: '20px'
            }}
            onClick={() => setSelectedJob(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              style={{
                backgroundColor: '#fff',
                borderRadius: '20px',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '80vh',
                overflow: 'auto',
                padding: '24px',
                position: 'relative'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedJob(null)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#f1f5f9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>

              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '1.5rem', marginBottom: '12px' }}>
                {selectedJob.title}
              </h2>
              <p style={{ color: '#64748b', marginBottom: '20px' }}>{selectedJob.employer}</p>
              <p style={{ lineHeight: '1.6', color: '#475569' }}>
                {selectedJob.description || labels.noDesc}
              </p>

              <button
                onClick={() => window.openai?.openExternal?.({ href: selectedJob.url })}
                style={{
                  marginTop: '24px',
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#0f172a',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {labels.applyNow}
                <ExternalLink size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
