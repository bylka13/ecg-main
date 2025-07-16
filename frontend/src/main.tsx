import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Initialize dark mode on page load
const initializeDarkMode = () => {
  const isDark = localStorage.getItem('theme-storage') 
    ? JSON.parse(localStorage.getItem('theme-storage')!).state.isDarkMode
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
    
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
};

initializeDarkMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);