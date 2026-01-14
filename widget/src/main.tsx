import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

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
