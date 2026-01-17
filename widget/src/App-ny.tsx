import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, ExternalLink, X, MapPin, Clock, Briefcase, TrendingUp, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOpenAiGlobal, useWidgetState } from './hooks';
import { translateJobs, translateLabels, translateBatch } from './utils/translate';
import type { Job, Labels, ToolOutput, WidgetState, SalaryData } from './types';
import './styles/ny-design.css';

const JOBS_PER_PAGE = 6;

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
  fetching: 'Laddar...',
  page: 'Sida',
  of: 'av',
  previous: 'Föregående',
  next: 'Nästa'
};

const createDefaultWidgetState = (): WidgetState => ({
  savedJobs: [],
  filter: 'all',
  showMap: false,
  currentPage: 1
});

// Color extraction from logo image
const extractedColors = new Map<string, { brand: string; brandTint: string; brandDim: string }>();

const extractColorFromImage = (imageUrl: string): Promise<{ r: number; g: number; b: number } | null> => {
  return new Promise((resolve) => {
    // Skip on mobile or if canvas is not supported
    if (typeof window === 'undefined' || !document.createElement) {
      resolve(null);
      return;
    }

    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';

      // Timeout after 3 seconds
      const timeout = setTimeout(() => resolve(null), 3000);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }

          // Sample at smaller size for performance
          const size = 50;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);

          const imageData = ctx.getImageData(0, 0, size, size).data;
          const colorCounts: Record<string, { count: number; r: number; g: number; b: number }> = {};

          // Sample pixels and count colors (skip very light/dark colors)
          for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const a = imageData[i + 3];

            // Skip transparent, very light (white-ish), or very dark pixels
            if (a < 128) continue;
            const brightness = (r + g + b) / 3;
            if (brightness > 240 || brightness < 15) continue;

            // Quantize to reduce similar colors
            const qr = Math.round(r / 32) * 32;
            const qg = Math.round(g / 32) * 32;
            const qb = Math.round(b / 32) * 32;
            const key = `${qr},${qg},${qb}`;

            if (!colorCounts[key]) {
              colorCounts[key] = { count: 0, r: qr, g: qg, b: qb };
            }
            colorCounts[key].count++;
          }

          // Find most common color with good saturation
          let bestColor = null;
          let bestScore = 0;

          for (const color of Object.values(colorCounts)) {
            const max = Math.max(color.r, color.g, color.b);
            const min = Math.min(color.r, color.g, color.b);
            const saturation = max === 0 ? 0 : (max - min) / max;
            // Score = count * saturation boost (prefer colorful)
            const score = color.count * (1 + saturation * 2);
            if (score > bestScore) {
              bestScore = score;
              bestColor = color;
            }
          }

          resolve(bestColor ? { r: bestColor.r, g: bestColor.g, b: bestColor.b } : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
      img.src = imageUrl;
    } catch {
      resolve(null);
    }
  });
};

const rgbToColors = (r: number, g: number, b: number) => ({
  brand: `rgb(${r}, ${g}, ${b})`,
  brandTint: `rgba(${r}, ${g}, ${b}, 0.12)`,
  brandDim: `rgba(${r}, ${g}, ${b}, 0.35)`
});

// Fallback: Generate color from employer name
const getColorFromEmployer = (employer: string): { brand: string; brandTint: string; brandDim: string } => {
  // Known brands (fallback if logo extraction fails)
  const knownBrands: Record<string, { brand: string; brandTint: string; brandDim: string }> = {
    'spotify': { brand: '#1DB954', brandTint: 'rgba(29, 185, 84, 0.12)', brandDim: 'rgba(29, 185, 84, 0.35)' },
    'ikea': { brand: '#0058a3', brandTint: 'rgba(0, 88, 163, 0.12)', brandDim: 'rgba(0, 88, 163, 0.35)' },
    'klarna': { brand: '#FFB3C7', brandTint: 'rgba(255, 179, 199, 0.15)', brandDim: 'rgba(255, 179, 199, 0.4)' },
    'volvo': { brand: '#003057', brandTint: 'rgba(0, 48, 87, 0.12)', brandDim: 'rgba(0, 48, 87, 0.35)' },
    'ericsson': { brand: '#0082F0', brandTint: 'rgba(0, 130, 240, 0.12)', brandDim: 'rgba(0, 130, 240, 0.35)' },
    'h&m': { brand: '#E50010', brandTint: 'rgba(229, 0, 16, 0.12)', brandDim: 'rgba(229, 0, 16, 0.35)' }
  };

  const lowerEmployer = employer.toLowerCase();
  for (const [brand, colors] of Object.entries(knownBrands)) {
    if (lowerEmployer.includes(brand)) return colors;
  }

  // Generate color from employer name hash
  const hue = employer.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  return {
    brand: `hsl(${hue}, 60%, 45%)`,
    brandTint: `hsla(${hue}, 60%, 45%, 0.12)`,
    brandDim: `hsla(${hue}, 60%, 45%, 0.35)`
  };
};

// Verified badge SVG - Blue for all
const VerifiedBadge = () => (
  <svg className="verified-badge" viewBox="0 0 24 24" fill="#3b82f6">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

// Company logo with image support
function CompanyLogo({ name, logoUrl, size = 52, brandColor }: { name: string; logoUrl?: string; size?: number; brandColor?: string }) {
  const [error, setError] = useState(false);
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  const hue = name?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360 || 0;

  if (logoUrl && !error) {
    return (
      <div
        className="logo-box"
        style={{
          width: size,
          height: size,
          background: '#fff',
          padding: '8px'
        }}
      >
        <img
          src={logoUrl}
          alt={`${name} logo`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            borderRadius: '6px'
          }}
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="logo-box"
      style={{
        width: size,
        height: size,
        background: brandColor || `linear-gradient(135deg, hsl(${hue}, 60%, 55%) 0%, hsl(${hue + 30}, 70%, 45%) 100%)`
      }}
    >
      <span style={{ color: '#fff', fontSize: size * 0.4, fontWeight: 600 }}>{initial}</span>
    </div>
  );
}

// Custom hook for extracting color from logo
function useLogoColor(logoUrl: string | undefined, employer: string) {
  const [colors, setColors] = useState(() => getColorFromEmployer(employer));

  useEffect(() => {
    // Always set fallback color immediately
    setColors(getColorFromEmployer(employer));

    if (!logoUrl) return;

    // Check cache first
    const cacheKey = logoUrl;
    if (extractedColors.has(cacheKey)) {
      setColors(extractedColors.get(cacheKey)!);
      return;
    }

    // Try to extract color from logo (may fail on mobile)
    extractColorFromImage(logoUrl)
      .then((rgb) => {
        if (rgb) {
          const newColors = rgbToColors(rgb.r, rgb.g, rgb.b);
          extractedColors.set(cacheKey, newColors);
          setColors(newColors);
        }
      })
      .catch(() => {
        // Silently fail, keep fallback color
      });
  }, [logoUrl, employer]);

  return colors;
}

// Salary Widget Component - beautiful popup
function SalaryWidget({
  salaryData,
  colors,
  labels,
  onClose,
  isMobile
}: {
  salaryData: SalaryData;
  colors: { brand: string; brandTint: string; brandDim: string };
  labels: Labels;
  onClose: () => void;
  isMobile: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '12px',
        width: isMobile ? 'calc(100vw - 48px)' : '320px',
        maxWidth: '320px',
        background: '#fff',
        borderRadius: '20px',
        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        zIndex: 100
      }}
    >
      {/* Header with gradient */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.brand} 0%, ${colors.brandDim} 100%)`,
        padding: '20px',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={14} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <TrendingUp size={20} color="#fff" />
          </div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>{labels.salaryTitle}</span>
        </div>
        <p style={{
          fontSize: '2.2rem',
          fontWeight: 700,
          color: '#fff',
          margin: 0,
          textShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          {salaryData.salary?.avg?.toLocaleString('sv-SE')} <span style={{ fontSize: '1rem', fontWeight: 500 }}>{labels.krPerMonth}</span>
        </p>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px' }}>
        {/* Min/Max range */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '16px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '12px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>{labels.salaryMin}</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
              {salaryData.salary?.min?.toLocaleString('sv-SE')} kr
            </p>
          </div>
          <div style={{ width: '1px', background: '#e2e8f0' }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>{labels.salaryMax}</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
              {salaryData.salary?.max?.toLocaleString('sv-SE')} kr
            </p>
          </div>
        </div>

        {/* Tips */}
        {salaryData.translatedTips && salaryData.translatedTips.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            {salaryData.translatedTips.slice(0, 2).map((tip, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '8px',
                fontSize: '0.85rem',
                color: '#64748b'
              }}>
                <span style={{ color: colors.brand, marginTop: '2px' }}>💡</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {salaryData.sources && salaryData.sources.length > 0 && (
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
            {labels.sources}: {salaryData.sources.join(', ')}
          </p>
        )}
      </div>
    </motion.div>
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
  onRequestSalary,
  salaryLoading,
  salaryData,
  showSalaryWidget,
  onCloseSalaryWidget,
  labels
}: {
  job: Job;
  isExpanded: boolean;
  onToggle: () => void;
  isSaved: boolean;
  onSave: () => void;
  onClick: () => void;
  onRequestSalary: () => void;
  salaryLoading: boolean;
  salaryData: SalaryData | null;
  showSalaryWidget: boolean;
  onCloseSalaryWidget: () => void;
  labels: Labels;
}) {
  const colors = useLogoColor(job.logoUrl, job.employer);
  const cardIsMobile = typeof window !== 'undefined' && window.innerWidth <= 600;

  return (
    <div
      className={`job-card ${isExpanded ? 'expanded' : ''}`}
      style={{
        '--brand': colors.brand,
        '--brand-tint': colors.brandTint,
        '--brand-dim': colors.brandDim,
        background: `linear-gradient(135deg, #fff 0%, #fff 60%, ${colors.brandTint} 100%)`,
        borderColor: colors.brandTint
      } as React.CSSProperties}
      onClick={onToggle}
    >
      {/* Brand glow effect */}
      <div style={{
        position: 'absolute',
        top: cardIsMobile ? '-30%' : '-50%',
        right: cardIsMobile ? '-15%' : '-20%',
        width: cardIsMobile ? '120px' : '200px',
        height: cardIsMobile ? '120px' : '200px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colors.brandDim} 0%, transparent 70%)`,
        opacity: 0.5,
        pointerEvents: 'none'
      }} />

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
          <CompanyLogo name={job.employer} logoUrl={job.logoUrl} brandColor={colors.brand} />
          <div className="header-text">
            <h3 className="job-title">{job.title}</h3>
            <div className="company-row">
              <span className="company-name">{job.employer}</span>
              <VerifiedBadge />
            </div>
          </div>
        </div>

        <div className="info-tags">
          {job.isRemote && <span className="tag remote-tag">Distans</span>}
          {job.experienceRequired === false ? (
            <span className="tag no-exp-tag">Kräver ej erfarenhet</span>
          ) : (
            <span className="tag exp-tag">Kräver erfarenhet</span>
          )}
          {job.workingHours && <span className="tag">{job.workingHours}</span>}
          {job.deadline && <span className="tag deadline-tag">Ansök senast {job.deadline}</span>}
        </div>

        <p className="job-description">
          {job.description || 'Ingen beskrivning tillgänglig.'}
        </p>

        {/* Action buttons - always visible, more prominent */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          position: 'relative'
        }}>
          {/* Salary Widget Popup */}
          <AnimatePresence>
            {showSalaryWidget && salaryData && (
              <SalaryWidget
                salaryData={salaryData}
                colors={colors}
                labels={labels}
                onClose={onCloseSalaryWidget}
                isMobile={cardIsMobile}
              />
            )}
          </AnimatePresence>

          {/* Salary button with loading spinner */}
          <button
            onClick={(e) => { e.stopPropagation(); onRequestSalary(); }}
            disabled={salaryLoading}
            style={{
              flex: 1,
              padding: cardIsMobile ? '10px 12px' : '12px 16px',
              borderRadius: '10px',
              border: `1px solid ${salaryData ? colors.brand : 'rgba(0,0,0,0.1)'}`,
              background: salaryData ? colors.brandTint : '#fff',
              color: salaryData ? colors.brand : '#64748b',
              fontWeight: 600,
              fontSize: cardIsMobile ? '0.8rem' : '0.85rem',
              cursor: salaryLoading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            {salaryLoading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{labels.fetching}</span>
              </>
            ) : salaryData ? (
              <>
                <TrendingUp size={16} />
                <span>{salaryData.salary?.avg?.toLocaleString('sv-SE')} kr</span>
              </>
            ) : (
              <>
                <TrendingUp size={16} />
                <span>{labels.salaryInfo}</span>
              </>
            )}
          </button>

          {/* Apply button */}
          <button
            onClick={(e) => { e.stopPropagation(); window.openai?.openExternal?.({ href: job.url }); }}
            style={{
              flex: 1,
              padding: cardIsMobile ? '10px 12px' : '12px 16px',
              borderRadius: '10px',
              border: 'none',
              background: colors.brand,
              color: '#fff',
              fontWeight: 600,
              fontSize: cardIsMobile ? '0.8rem' : '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: `0 2px 8px ${colors.brandDim}`,
              transition: 'all 0.2s'
            }}
          >
            <span>{labels.applyNow}</span>
            <ExternalLink size={14} />
          </button>
        </div>

        {/* Expanded content - show more details button */}
        <div className="expanded-actions">
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px dashed rgba(0,0,0,0.15)',
              background: 'rgba(0,0,0,0.02)',
              color: '#64748b',
              fontWeight: 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '12px'
            }}
          >
            {labels.showMore}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Job Detail Modal with full description loading and salary
function JobDetailModal({
  job,
  onClose,
  labels,
  salaryData,
  salaryLoading,
  onRequestSalary,
  isSaved,
  onSave,
  langRef
}: {
  job: Job;
  onClose: () => void;
  labels: Labels;
  salaryData: SalaryData | null;
  salaryLoading: boolean;
  onRequestSalary: (job: Job) => void;
  isSaved: boolean;
  onSave: () => void;
  langRef: React.MutableRefObject<string>;
}) {
  const [fullDescription, setFullDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const colors = useLogoColor(job.logoUrl, job.employer);

  // Fetch full job description
  useEffect(() => {
    if (job.fullDescription) {
      setFullDescription(job.fullDescription);
      return;
    }

    setLoading(true);
    fetch(`https://api.smidra.se/api/job/${job.id}`)
      .then(res => res.json())
      .then(async (data) => {
        let desc = data.fullDescription || data.description || job.description || labels.noDesc;
        // Translate if needed
        if (langRef.current !== 'sv' && desc) {
          try {
            const [translated] = await translateBatch([desc], langRef.current);
            desc = translated || desc;
          } catch {}
        }
        setFullDescription(desc);
        setLoading(false);
      })
      .catch(() => {
        setFullDescription(job.description || labels.noDesc);
        setLoading(false);
      });
  }, [job, labels.noDesc, langRef]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        style={{
          backgroundColor: '#fff',
          borderRadius: '24px',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with brand color gradient */}
        <div style={{
          background: `linear-gradient(145deg, #fff 0%, ${colors.brandTint} 40%, ${colors.brandDim} 100%)`,
          padding: '28px 24px',
          borderBottom: `2px solid ${colors.brandTint}`,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative brand glow */}
          <div style={{
            position: 'absolute',
            top: '-30%',
            right: '-10%',
            width: '250px',
            height: '250px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colors.brandDim} 0%, transparent 60%)`,
            opacity: 0.8,
            pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-50%',
            left: '-10%',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colors.brandTint} 0%, transparent 70%)`,
            opacity: 0.5,
            pointerEvents: 'none'
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', position: 'relative', zIndex: 1 }}>
            <CompanyLogo name={job.employer} logoUrl={job.logoUrl} size={64} brandColor={colors.brand} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1.4rem',
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: '6px',
                lineHeight: 1.3
              }}>
                {job.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '0.9rem' }}>
                  {job.employer}
                </span>
                <VerifiedBadge />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {job.location && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#64748b' }}>
                    <MapPin size={14} /> {job.location}
                  </span>
                )}
                {job.workingHours && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#64748b' }}>
                    <Briefcase size={14} /> {job.workingHours}
                  </span>
                )}
                {job.deadline && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#64748b' }}>
                    <Clock size={14} /> {job.deadline}
                  </span>
                )}
              </div>
            </div>

            {/* Close & Save buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={onSave}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isSaved ? '#f43f5e' : '#fff',
                  color: isSaved ? '#fff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                <Heart size={18} fill={isSaved ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={onClose}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          {job.isRemote && (
            <span className="tag remote-tag">Distans</span>
          )}
          {job.experienceRequired === false ? (
            <span className="tag no-exp-tag">Kräver ej erfarenhet</span>
          ) : (
            <span className="tag exp-tag">Kräver erfarenhet</span>
          )}
          {job.vacancies && job.vacancies > 1 && (
            <span className="tag" style={{ background: '#f0f9ff', color: '#0369a1', borderColor: 'rgba(3, 105, 161, 0.1)' }}>
              {job.vacancies} platser
            </span>
          )}
        </div>

        {/* Body - scrollable */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          maxHeight: 'calc(85vh - 280px)',
          WebkitOverflowScrolling: 'touch'
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b' }}>
              <Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              {labels.loadingDesc}
            </div>
          ) : (
            <div style={{
              fontSize: '1rem',
              lineHeight: 1.7,
              color: '#475569',
              whiteSpace: 'pre-wrap'
            }}>
              {fullDescription}
            </div>
          )}

          {/* Salary section */}
          {salaryLoading && (
            <div style={{
              marginTop: '24px',
              padding: '16px',
              borderRadius: '12px',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
              <span style={{ color: '#64748b' }}>{labels.fetchingSalary}</span>
            </div>
          )}

          {salaryData?.salary && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: '24px',
                padding: '20px',
                borderRadius: '16px',
                background: `linear-gradient(135deg, ${colors.brandTint} 0%, rgba(255,255,255,0.8) 100%)`,
                border: `1px solid ${colors.brandDim}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: colors.brand,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <TrendingUp size={18} color="#fff" />
                </div>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{labels.salaryTitle}</span>
              </div>
              <p style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: colors.brand,
                marginBottom: '8px'
              }}>
                {salaryData.salary.avg?.toLocaleString('sv-SE')} {labels.krPerMonth}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b' }}>
                <span>{labels.salaryMin}: {salaryData.salary.min?.toLocaleString('sv-SE')} kr</span>
                <span>{labels.salaryMax}: {salaryData.salary.max?.toLocaleString('sv-SE')} kr</span>
              </div>
              {salaryData.translatedTips && salaryData.translatedTips.length > 0 && (
                <ul style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${colors.brandDim}`, listStyle: 'none', padding: 0 }}>
                  {salaryData.translatedTips.map((tip, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '0.9rem', color: '#475569' }}>
                      <span style={{ color: colors.brand }}>•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(0,0,0,0.05)',
          display: 'flex',
          gap: '12px',
          background: '#fafafa'
        }}>
          <button
            onClick={() => onRequestSalary(job)}
            disabled={salaryLoading || !!salaryData}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.1)',
              background: salaryData ? colors.brandTint : '#fff',
              color: salaryData ? colors.brand : '#1e293b',
              fontWeight: 600,
              cursor: salaryLoading ? 'wait' : salaryData ? 'default' : 'pointer',
              opacity: salaryLoading ? 0.7 : 1
            }}
          >
            {salaryLoading ? labels.fetching : salaryData ? `✓ ${labels.salaryShown}` : labels.salaryInfo}
          </button>
          <button
            onClick={() => window.openai?.openExternal?.({ href: job.url })}
            style={{
              flex: 2,
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: colors.brand,
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: `0 4px 12px ${colors.brandDim}`
            }}
          >
            {labels.applyNow}
            <ExternalLink size={16} />
          </button>
        </div>
      </motion.div>
    </motion.div>
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
  const [modalSalaryData, setModalSalaryData] = useState<SalaryData | null>(null);
  const [modalSalaryLoading, setModalSalaryLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);

  // Track salary data per job
  const [jobSalaryData, setJobSalaryData] = useState<Record<string, SalaryData>>({});
  const [jobSalaryLoading, setJobSalaryLoading] = useState<Record<string, boolean>>({});
  const [visibleSalaryWidgetId, setVisibleSalaryWidgetId] = useState<string | null>(null);
  const currentSalaryJobId = useRef<string | null>(null);
  const selectedJobRef = useRef<Job | null>(null);
  const salaryForModalRef = useRef<boolean>(false);

  const widgetSessionId = useRef('ws_' + Math.random().toString(36).substr(2, 9));
  const langRef = useRef('sv');
  const searchQueryRef = useRef<{ query: string; location: string }>({ query: '', location: '' });

  // Keep ref in sync with state
  useEffect(() => {
    selectedJobRef.current = selectedJob;
  }, [selectedJob]);

  // Pagination
  const totalPages = Math.ceil(totalJobs / JOBS_PER_PAGE);
  const currentJobs = jobs;

  const goToPage = useCallback(async (page: number) => {
    if (page === currentPage) return;
    setExpandedJobId(null);
    setPageLoading(true);

    // Fetch new page from API
    const { query, location } = searchQueryRef.current;
    if (query) {
      try {
        const offset = (page - 1) * JOBS_PER_PAGE;
        const res = await fetch(`https://api.smidra.se/api/search?q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&limit=${JOBS_PER_PAGE}&offset=${offset}`);
        const data = await res.json();

        if (data.jobs?.length) {
          // Translate if needed
          if (langRef.current !== 'sv') {
            const translatedJobs = await translateJobs(data.jobs, langRef.current);
            setJobs(translatedJobs);
          } else {
            setJobs(data.jobs);
          }
        }
      } catch (err) {
        console.error('Failed to fetch page:', err);
      }
    }

    setCurrentPage(page);
    setPageLoading(false);
  }, [currentPage]);

  const toggleSave = useCallback((id: string) => {
    setWidgetState(prev => {
      const isSaved = prev.savedJobs.includes(id);
      return { ...prev, savedJobs: isSaved ? prev.savedJobs.filter(x => x !== id) : [...prev.savedJobs, id] };
    });
  }, [setWidgetState]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedJobId(prev => prev === id ? null : id);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedJob(null);
    setModalSalaryData(null);
    setModalSalaryLoading(false);
  }, []);

  // Request salary for a job (from card or modal)
  const requestSalary = useCallback((job: Job, forModal = false) => {
    currentSalaryJobId.current = job.id;
    salaryForModalRef.current = forModal;

    if (forModal) {
      setModalSalaryLoading(true);
      setModalSalaryData(null);
    }
    setJobSalaryLoading(prev => ({ ...prev, [job.id]: true }));

    // Check if in mock mode (for local testing)
    const isMockMode = typeof window !== 'undefined' && window.location.search.includes('mock=true');

    if (isMockMode) {
      // Simulate salary data arriving after a short delay
      console.log('🎭 Mock mode: Simulating salary data');
      setTimeout(() => {
        const mockSalaryData: SalaryData = {
          salary: {
            avg: 45000 + Math.floor(Math.random() * 20000),
            min: 35000 + Math.floor(Math.random() * 10000),
            max: 55000 + Math.floor(Math.random() * 25000)
          },
          tips: ['Förhandla alltid din lön', 'Kolla branschsnitt innan intervju'],
          translatedTips: ['Förhandla alltid din lön', 'Kolla branschsnitt innan intervju'],
          sources: ['SCB', 'Unionen', 'Sveriges Ingenjörer']
        };

        setJobSalaryData(prev => ({ ...prev, [job.id]: mockSalaryData }));
        setJobSalaryLoading(prev => ({ ...prev, [job.id]: false }));
        setVisibleSalaryWidgetId(job.id);

        if (forModal) {
          setModalSalaryData(mockSalaryData);
          setModalSalaryLoading(false);
        }
      }, 1500);
      return;
    }

    const msg = `Visa lönestatistik för "${job.title}" i ${job.location || 'Sverige'}.
Sök på webben efter aktuell lönedata och anropa sedan update_widget_info med:
{ "widgetSessionId": "${widgetSessionId.current}", "jobContext": { "title": "${job.title}", "location": "${job.location || 'Sverige'}" }, "info": { "type": "compensation", "data": { "avg": [genomsnitt], "min": [lägst], "max": [högst] }, "tips": ["förhandlingstips"], "sources": ["SCB", "Unionen"] } }
[Använd ENDAST update_widget_info från Smidra MCP. Skriv ingen text.]`;
    window.openai?.sendFollowUpMessage?.({ prompt: msg });
  }, []);

  // SSE for salary updates
  useEffect(() => {
    const sessionId = toolOutput?.widgetSessionId || widgetSessionId.current;
    if (toolOutput?.widgetSessionId) {
      widgetSessionId.current = toolOutput.widgetSessionId;
    }

    console.log(`SSE connecting: ${sessionId}`);
    const es = new EventSource(`https://api.smidra.se/events?session=${sessionId}`);

    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 SSE received:', data.type, data);
        if (data.type === 'salary' || data.type === 'market_info') {
          if (langRef.current !== 'sv' && data.tips?.length) {
            data.translatedTips = await translateBatch(data.tips, langRef.current);
          } else {
            data.translatedTips = data.tips || [];
          }

          const jobId = currentSalaryJobId.current;
          console.log('💰 Salary data for jobId:', jobId, 'salary:', data.salary);
          if (jobId) {
            // Update job-specific salary data
            setJobSalaryData(prev => ({ ...prev, [jobId]: data }));
            setJobSalaryLoading(prev => ({ ...prev, [jobId]: false }));
            // Auto-show the salary widget popup
            setVisibleSalaryWidgetId(jobId);
            console.log('✅ Updated salary for job:', jobId);
          }

          // Also update modal salary if open (use ref to avoid stale closure)
          const currentSelectedJob = selectedJobRef.current;
          if (currentSelectedJob && jobId === currentSelectedJob.id) {
            setModalSalaryData(data);
            setModalSalaryLoading(false);
            console.log('✅ Updated modal salary');
          }
        }
      } catch {}
    };

    return () => {
      console.log(`SSE disconnecting: ${sessionId}`);
      es.close();
    };
  }, [toolOutput?.widgetSessionId]);

  // Handle tool output
  useEffect(() => {
    if (!toolOutput?.jobs) return;

    const handleData = async () => {
      setHasReceivedData(true);
      setCurrentPage(1);

      // Save search query for pagination
      searchQueryRef.current = {
        query: toolOutput.query || '',
        location: toolOutput.location || ''
      };

      // Set total jobs count
      setTotalJobs(toolOutput.total || toolOutput.jobs.length);

      const lang = toolOutput.language || 'sv';
      langRef.current = lang;

      // Only show first page of jobs (JOBS_PER_PAGE)
      const firstPageJobs = toolOutput.jobs.slice(0, JOBS_PER_PAGE);

      if ((toolOutput.translateMode || lang !== 'sv') && firstPageJobs.length) {
        const [translatedJobs, translatedLabels] = await Promise.all([
          translateJobs(firstPageJobs, lang),
          translateLabels(DEFAULT_LABELS as Record<string, string>, lang)
        ]);
        setJobs(translatedJobs);
        setLabels(translatedLabels);
      } else {
        setJobs(firstPageJobs);
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

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 600;

  return (
    <div style={{
      fontFamily: 'Outfit, sans-serif',
      backgroundColor: '#f8fafc',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(0, 0, 0, 0.02) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(0, 0, 0, 0.02) 0px, transparent 50%)',
      padding: isMobile ? '20px 12px 100px' : '40px 16px',
      minHeight: '100vh'
    }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ marginBottom: isMobile ? '20px' : '32px', paddingLeft: '4px' }}>
          <h1 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: isMobile ? '1.5rem' : '2rem',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '6px'
          }}>
            Jobbannonser
          </h1>
          <p style={{ fontSize: isMobile ? '0.9rem' : '1rem', color: '#64748b' }}>
            {totalJobs} {labels.jobs}
            {totalPages > 1 && (
              <span style={{ marginLeft: '8px', color: '#94a3b8' }}>
                • {labels.page} {currentPage} {labels.of} {totalPages}
              </span>
            )}
          </p>
        </header>

        {/* Page loading overlay */}
        {pageLoading && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '40px',
            color: '#64748b'
          }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '12px' }} />
            {labels.fetching}
          </div>
        )}

        {!pageLoading && (
          <div className="job-grid">
            {currentJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isExpanded={expandedJobId === job.id}
                onToggle={() => toggleExpand(job.id)}
                isSaved={widgetState.savedJobs.includes(job.id)}
                onSave={() => toggleSave(job.id)}
                onClick={() => setSelectedJob(job)}
                onRequestSalary={() => requestSalary(job)}
                salaryLoading={jobSalaryLoading[job.id] || false}
                salaryData={jobSalaryData[job.id] || null}
                showSalaryWidget={visibleSalaryWidgetId === job.id}
                onCloseSalaryWidget={() => setVisibleSalaryWidgetId(null)}
                labels={labels}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginTop: '32px',
            paddingBottom: '20px'
          }}>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || pageLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: currentPage === 1 ? '#f1f5f9' : '#fff',
                color: currentPage === 1 ? '#94a3b8' : '#1e293b',
                fontWeight: 500,
                fontSize: '0.9rem',
                cursor: (currentPage === 1 || pageLoading) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <ChevronLeft size={18} />
              <span className="pagination-text">{labels.previous}</span>
            </button>

            <div style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'center'
            }}>
              {/* Smart pagination: show max 5 page numbers */}
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 5) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 3) pages.push('...');
                  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                    pages.push(i);
                  }
                  if (currentPage < totalPages - 2) pages.push('...');
                  pages.push(totalPages);
                }
                return pages.map((page, idx) => (
                  page === '...' ? (
                    <span key={`dots-${idx}`} style={{ color: '#94a3b8', padding: '0 4px' }}>...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => goToPage(page as number)}
                      disabled={pageLoading}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        border: page === currentPage ? 'none' : '1px solid rgba(0,0,0,0.1)',
                        background: page === currentPage ? '#1e293b' : '#fff',
                        color: page === currentPage ? '#fff' : '#64748b',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: pageLoading ? 'wait' : 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {page}
                    </button>
                  )
                ));
              })()}
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || pageLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: currentPage === totalPages ? '#f1f5f9' : '#fff',
                color: currentPage === totalPages ? '#94a3b8' : '#1e293b',
                fontWeight: 500,
                fontSize: '0.9rem',
                cursor: (currentPage === totalPages || pageLoading) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <span className="pagination-text">{labels.next}</span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Modal for job details */}
      <AnimatePresence>
        {selectedJob && (
          <JobDetailModal
            job={selectedJob}
            onClose={closeModal}
            labels={labels}
            salaryData={modalSalaryData || jobSalaryData[selectedJob.id] || null}
            salaryLoading={modalSalaryLoading}
            onRequestSalary={(job) => requestSalary(job, true)}
            isSaved={widgetState.savedJobs.includes(selectedJob.id)}
            onSave={() => toggleSave(selectedJob.id)}
            langRef={langRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
