export interface Job {
  id: string;
  title: string;
  employer: string;
  location: string;
  url: string;
  deadline?: string;
  employmentType?: string;
  logoUrl?: string;
  description?: string;
  fullDescription?: string;
}

export interface Labels {
  [key: string]: string;
  jobs: string;
  map: string;
  all: string;
  fulltime: string;
  parttime: string;
  showMore: string;
  apply: string;
  applyNow: string;
  saved: string;
  noJobs: string;
  tryOther: string;
  loadingDesc: string;
  noDesc: string;
  salaryInfo: string;
  fetchingSalary: string;
  salaryTitle: string;
  salaryShown: string;
  krPerMonth: string;
  salaryMin: string;
  salaryMax: string;
  sources: string;
  fetching: string;
}

export interface SalaryData {
  salary?: {
    avg: number;
    min: number;
    max: number;
  };
  tips?: string[];
  translatedTips?: string[];
  sources?: string[];
}

export interface WidgetState {
  savedJobs: string[];
  filter: string;
  showMap: boolean;
  currentPage: number;
}

export interface ToolOutput {
  jobs?: Job[];
  query?: string;
  location?: string;
  total?: number;
  language?: string;
  translateMode?: boolean;
  direction?: 'ltr' | 'rtl';
}
