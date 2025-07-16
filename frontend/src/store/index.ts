import { create } from 'zustand';
import { persist } from 'zustand/middleware';


interface ThemeState {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const getInitialDarkMode = () => {
  const stored = localStorage.getItem('theme');
  if (stored) {
    return stored === 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDarkMode: getInitialDarkMode(),
      toggleTheme: () => set((state) => {
        const newMode = !state.isDarkMode;
        if (newMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        return { isDarkMode: newMode };
      }),
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state?.isDarkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
    }
  )
);
