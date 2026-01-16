export type DisplayMode = 'inline' | 'fullscreen' | 'pip';

export interface Job {
  id: string;
  title: string;
  employer: string;
  location: string;
  city?: string;
  region?: string;
  lat?: number | null;
  lng?: number | null;
  deadline?: string;
  deadlineRaw?: string;
  description?: string;
  fullDescription?: string;
  url: string;
  logoUrl?: string;

  // Employment info
  employmentType?: string;
  salaryType?: string;
  workingHours?: string;
  duration?: string;
  scope?: string;

  // Requirements badges
  experienceRequired?: boolean | null;
  drivingLicenseRequired?: boolean;
  accessToOwnCar?: boolean;
  isRemote?: boolean;

  // Category
  occupationField?: string;
  occupation?: string;

  // Vacancies
  vacancies?: number;

  // Publication
  published?: string;

  // Skills (from detailed fetch)
  mustHaveSkills?: string[];
  niceToHaveSkills?: string[];
  mustHaveLanguages?: string[];

  // URLs
  employerUrl?: string;
  applicationUrl?: string;

  // AI verification (ChatGPT verifies these badges)
  needsVerification?: boolean;
  verificationSnippets?: string;
}

export interface SalaryData {
  salary: {
    avg: number;
    min: number;
    max: number;
  };
  tips?: string[];
  translatedTips?: string[];
  sources?: string[];
}

export interface ToolOutput {
  _rule?: string;
  language?: string;
  direction?: 'ltr' | 'rtl';
  query?: string;
  querySwedish?: string;
  location?: string;
  locationSwedish?: string;
  total?: number;
  jobs?: Job[];
  translateMode?: boolean;
  labels?: Labels;
  // SSE session for real-time updates
  widgetSessionId?: string;
  // Jobs currently being verified (show spinner on badge)
  jobsBeingVerified?: string[];
}

export interface Labels {
  jobs?: string;
  map?: string;
  all?: string;
  fulltime?: string;
  parttime?: string;
  showMore?: string;
  apply?: string;
  applyNow?: string;
  saved?: string;
  noJobs?: string;
  tryOther?: string;
  loadingDesc?: string;
  noDesc?: string;
  salaryInfo?: string;
  fetchingSalary?: string;
  salaryTitle?: string;
  salaryShown?: string;
  krPerMonth?: string;
  salaryMin?: string;
  salaryMax?: string;
  sources?: string;
  fetching?: string;
}

export interface WidgetState {
  savedJobs: string[];
  filter: 'all' | 'fulltime' | 'parttime';
  showMap: boolean;
  currentPage: number;
}

declare global {
  interface Window {
    openai?: {
      toolOutput?: ToolOutput;
      theme?: 'light' | 'dark';
      locale?: string;
      widgetState?: WidgetState;
      displayMode?: DisplayMode;
      maxHeight?: number;
      notifyIntrinsicHeight?: (height: number) => void;
      setWidgetState?: (state: Partial<WidgetState>) => void;
      openExternal?: (opts: { href: string }) => void;
      sendFollowUpMessage?: (opts: { prompt: string }) => void;
      requestDisplayMode?: (opts: { mode: DisplayMode }) => Promise<void>;
      requestClose?: () => void;
    };
  }
}
