import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App-ny';
import './index.css';

// Mock data for local development (?mock=true)
const MOCK_JOBS = [
  {
    id: '1',
    title: 'Frontend Developer',
    employer: 'Spotify',
    location: 'Stockholm',
    url: 'https://example.com/job1',
    isRemote: true,
    experienceRequired: false,
    workingHours: 'Heltid',
    deadline: '2025-02-15',
    vacancies: 3,
    employmentType: 'Heltid',
    mustHaveSkills: ['React', 'TypeScript', 'CSS'],
    description: 'Vi söker en frontend-utvecklare med passion för användarvänliga gränssnitt.'
  },
  {
    id: '2',
    title: 'Backend Engineer',
    employer: 'Klarna',
    location: 'Göteborg',
    url: 'https://example.com/job2',
    isRemote: false,
    experienceRequired: true,
    workingHours: 'Heltid',
    deadline: '2025-02-20',
    vacancies: 1,
    employmentType: 'Heltid',
    mustHaveSkills: ['Java', 'Spring Boot', 'PostgreSQL'],
    description: 'Join our engineering team building the future of payments.'
  },
  {
    id: '3',
    title: 'UX Designer',
    employer: 'IKEA',
    location: 'Malmö',
    url: 'https://example.com/job3',
    isRemote: true,
    experienceRequired: false,
    workingHours: 'Deltid',
    deadline: '2025-02-28',
    vacancies: 2,
    employmentType: 'Deltid',
    mustHaveSkills: ['Figma', 'User Research'],
    description: 'Designa upplevelser för miljontals kunder världen över.'
  },
  {
    id: '4',
    title: 'DevOps Engineer',
    employer: 'Ericsson',
    location: 'Stockholm',
    url: 'https://example.com/job4',
    isRemote: true,
    experienceRequired: true,
    workingHours: 'Heltid',
    deadline: '2025-03-01',
    vacancies: 5,
    employmentType: 'Heltid',
    mustHaveSkills: ['Kubernetes', 'AWS', 'Terraform'],
    description: 'Build and maintain world-class infrastructure.'
  },
  {
    id: '5',
    title: 'Product Manager',
    employer: 'King',
    location: 'Stockholm',
    url: 'https://example.com/job5',
    isRemote: false,
    experienceRequired: true,
    workingHours: 'Heltid',
    deadline: '2025-02-10',
    employmentType: 'Heltid',
    mustHaveSkills: ['Agile', 'Data Analysis'],
    description: 'Lead product strategy for mobile games with billions of players.'
  },
  {
    id: '6',
    title: 'Data Scientist',
    employer: 'H&M',
    location: 'Stockholm',
    url: 'https://example.com/job6',
    isRemote: true,
    experienceRequired: false,
    workingHours: 'Heltid',
    deadline: '2025-03-15',
    vacancies: 2,
    employmentType: 'Heltid',
    mustHaveSkills: ['Python', 'Machine Learning', 'SQL'],
    description: 'Apply AI to revolutionize fashion retail.'
  },
  {
    id: '7',
    title: 'iOS Developer',
    employer: 'Volvo',
    location: 'Göteborg',
    url: 'https://example.com/job7',
    isRemote: false,
    experienceRequired: true,
    workingHours: 'Heltid',
    deadline: '2025-02-25',
    employmentType: 'Heltid',
    mustHaveSkills: ['Swift', 'SwiftUI', 'CoreData'],
    description: 'Build next-generation automotive apps.'
  },
  {
    id: '8',
    title: 'Technical Writer',
    employer: 'Axis',
    location: 'Lund',
    url: 'https://example.com/job8',
    isRemote: true,
    experienceRequired: false,
    workingHours: 'Deltid',
    deadline: '2025-03-10',
    employmentType: 'Deltid',
    description: 'Document cutting-edge surveillance technology.'
  }
];

// Check if we're in mock mode
if (typeof window !== 'undefined' && window.location.search.includes('mock=true')) {
  console.log('🎭 MOCK MODE ENABLED');

  // Create mock openai object
  (window as any).openai = {
    theme: 'light',
    displayMode: 'inline',
    toolOutput: {
      jobs: MOCK_JOBS,
      query: 'Utvecklare',
      location: 'Stockholm',
      total: MOCK_JOBS.length,
      language: 'sv',
      translateMode: false,
      widgetSessionId: 'mock_session_123'
    },
    notifyIntrinsicHeight: (h: number) => console.log('📐 Height:', h),
    requestDisplayMode: (m: any) => console.log('🖥️ Display mode:', m),
    openExternal: (opts: any) => window.open(opts.href, '_blank'),
    sendFollowUpMessage: (opts: any) => console.log('💬 Follow-up:', opts.prompt),
    setWidgetState: (state: any) => console.log('💾 State:', state),
    widgetState: { savedJobs: [], filter: 'all', showMap: false, currentPage: 1 }
  };

  // Dispatch event to notify React
  setTimeout(() => {
    window.dispatchEvent(new Event('openai:set_globals'));
  }, 100);
}

// Initialize widget
console.log('🚀 Smidra Widget v2.0 - OpenAI Design System');
console.log('   Theme:', window.openai?.theme);
console.log('   DisplayMode:', window.openai?.displayMode);
console.log('   ToolOutput:', window.openai?.toolOutput ? 'YES' : 'NO');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
