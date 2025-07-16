import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Users, Upload, Sun, Moon, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { useThemeStore } from '../../store';

const Navbar: React.FC = () => {
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useThemeStore();

  const isVisualization = location.pathname.startsWith('/visualization');
  const isRapport = location.pathname.startsWith('/report');

  
  const links = [
    { to: '/', label: 'Importer', icon: <Upload size={18} /> },
    { to: '/ecg-list', label: 'Liste ECG', icon: <Users size={18} /> },
    ...(isVisualization
      ? [{ to: location.pathname, label: 'Visualisation', icon: <BarChart3 size={18} /> }]
      : []),
    ...(isRapport
      ? [{ to: location.pathname, label: 'Rapport', icon: <FileText size={18} /> }]
      : []),   
  ];
  
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-900 sticky top-0 z-10">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <BarChart3 className="text-accent-600 dark:text-accent-400" />
            <span className="font-semibold text-xl text-gray-900 dark:text-white">ECG</span>
          </Link>
          
          <nav className="hidden md:flex items-center space-x-1">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative px-3 py-2 rounded-md flex items-center space-x-1 text-sm font-medium ${
                    isActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {link.icon}
                  <span>{link.label}</span>
                  
                  {isActive && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label={isDarkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;