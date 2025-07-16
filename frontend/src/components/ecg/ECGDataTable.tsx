import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Activity, Search, Download } from 'lucide-react';

interface ECGDataTableProps {
  data: Array<{[key: string]: any}>;
  columns: Array<{
    key: string;
    label: string;
    format?: (value: any) => string;
  }>;
  title: string;
  maxRows?: number;
}

const ECGDataTable: React.FC<ECGDataTableProps> = ({ 
  data, 
  columns, 
  title,
  maxRows = 10 
}) => {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter data based on search term
  const filteredData = data.filter(row => 
    Object.values(row).some(value => 
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );
  
  const totalPages = Math.ceil(filteredData.length / maxRows);
  const displayData = expanded 
    ? filteredData 
    : filteredData.slice(page * maxRows, (page + 1) * maxRows);
  
  const handlePrevPage = () => {
    setPage(Math.max(0, page - 1));
  };
  
  const handleNextPage = () => {
    setPage(Math.min(totalPages - 1, page + 1));
  };
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
    setPage(0); // Reset to first page when toggling
  };
  
  // Reset page when search changes
  React.useEffect(() => {
    setPage(0);
  }, [searchTerm]);
  
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded">
              <Activity className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors duration-200" onClick={toggleExpanded}>
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>

        
        {/* Search Bar */}
        <div className="mt-3 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          </div>
          <input
            type="text"
            placeholder="Rechercher dans les données..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400"
          />
        </div>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {columns.map((column) => (
                <th 
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {displayData.length > 0 ? (
              displayData.map((row, index) => (
                <tr 
                  key={index} 
                  className={`transition-colors duration-150 ${
                    index % 2 === 0 
                      ? 'bg-white dark:bg-gray-900 hover:bg-blue-50 dark:hover:bg-gray-800' 
                      : 'bg-gray-50 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {columns.map((column) => (
                    <td 
                      key={column.key} 
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                    >
                      {column.format 
                        ? column.format(row[column.key])
                        : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={columns.length}
                  className="px-6 py-12 text-center"
                >
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <Search className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune donnée trouvée</p>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Essayez de modifier votre recherche</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {!expanded && totalPages > 1 && (
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <button
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              onClick={handlePrevPage}
              disabled={page === 0}
            >
              Précédent
            </button>
            
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Page {page + 1} sur {totalPages}
            </span>
            
            <button
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              onClick={handleNextPage}
              disabled={page === totalPages - 1}
            >
              Suivant
            </button>
          </div>
          
          {/* Data info */}
          <div className="mt-2 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Affichage de {displayData.length} sur {filteredData.length} entrée(s)
              {searchTerm && ` (filtré sur "${searchTerm}")`}
            </p>
          </div>
        </div>
      )}
      
      {/* Expanded view info */}
      {expanded && (
        <div className="px-6 py-2 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-700">
          <p className="text-sm text-green-700 dark:text-green-400 text-center">
            Vue complète - Affichage de toutes les {filteredData.length} entrée(s)
          </p>
        </div>
      )}
    </div>
  );
};

export default ECGDataTable;