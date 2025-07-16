import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Trash2, Calendar, MapPin, AudioWaveform as Waveform } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EcgData {
  date: string;
  location: string;
  samplingRate: number;
}

interface FileUploadProps {
  accept?: string;
  label?: string;
  multiple?: boolean;
  onFilesChange?: (files: File[]) => void;
  onEcgDataChange?: (ecgData: EcgData) => void;
  isSubmitting?: boolean;
  title?: string;
  description?: string;
  className?: string;
  defaultEcgData?: EcgData;
}

const DEFAULT_FS = 360;
const today = new Date().toISOString().split('T')[0];

const FileUpload: React.FC<FileUploadProps> = ({
  accept = '.csv',
  label = 'fichiers',
  multiple = true,
  onFilesChange,
  onEcgDataChange,
  isSubmitting,
  title = 'Téléchargement de fichiers',
  description = 'Glissez et déposez vos fichiers ici',
  className = '',
  defaultEcgData = {
    date: today,
    location: '',
    samplingRate: DEFAULT_FS,
  }
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [ecgData, setEcgData] = useState<EcgData>(defaultEcgData);

  // Gestion des fichiers
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        let newFiles: File[];
        if (multiple) {
          newFiles = [...selectedFiles, ...acceptedFiles];
        } else {
          newFiles = [acceptedFiles[0]];
        }
        setSelectedFiles(newFiles);
        if (onFilesChange) {
          onFilesChange(newFiles);
        }
      }
    },
    [selectedFiles, multiple, onFilesChange]
  );

  const acceptToMimeMap = (ext: string): { [key: string]: string[] } => {
    const lower = ext.toLowerCase();
    if (lower === '.csv') {
      return { 'text/csv': ['.csv', '.CSV'] };
    }
    // Ajoute d'autres cas si besoin
    return {};
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptToMimeMap(accept),
    multiple,
  });

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    if (onFilesChange) {
      onFilesChange(newFiles);
    }
  };

  const handleClearAllFiles = () => {
    setSelectedFiles([]);
    if (onFilesChange) {
      onFilesChange([]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTotalSize = () => {
    return selectedFiles.reduce((total, file) => total + file.size, 0);
  };

  // Gestion du mini-formulaire ECG
  const handleEcgInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newData = {
      ...ecgData,
      [name]: name === 'samplingRate' ? parseInt(value, 10) : value,
    };
    setEcgData(newData);
    if (onEcgDataChange) {
      onEcgDataChange(newData);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Bloc Données ECG */}
      <div className="card p-6 mb-6">
        <h2 className="text-xl font-medium mb-4">Données ECG</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Date d'enregistrement */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Calendar size={16} className="inline mr-1" /> Date d'enregistrement
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={ecgData.date}
              onChange={handleEcgInputChange}
              className="input"
            />
          </div>
          {/* Lieu d'enregistrement */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <MapPin size={16} className="inline mr-1" /> Lieu d'enregistrement
            </label>
            <input
              type="text"
              id="location"
              name="location"
              value={ecgData.location}
              onChange={handleEcgInputChange}
              placeholder="ex: Hôpital, Clinique, Domicile"
              className="input"
            />
          </div>
          {/* Fréquence d'échantillonnage */}
          <div>
            <label htmlFor="samplingRate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Waveform size={16} className="inline mr-1" /> Fréquence d'échantillonnage (Hz) *
            </label>
            <input
              type="number"
              id="samplingRate"
              name="samplingRate"
              value={ecgData.samplingRate}
              onChange={handleEcgInputChange}
              required
              min="1"
              step="1"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Header avec titre et description */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      {/* Zone de drop */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 cursor-pointer transition-all duration-300 dark:hover:bg-gray-500 ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 scale-[1.02]'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center text-center">
          <motion.div
            animate={{
              scale: isDragActive ? 1.1 : 1,
              rotate: isDragActive ? 5 : 0,
            }}
            className={`mb-4 p-4 rounded-full transition-colors duration-300 ${
              isDragActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Upload size={32} />
          </motion.div>
          <p className="text-lg font-semibold text-gray-700 mb-2">
            {isDragActive ? 'Déposez les fichiers ici' : `Glissez et déposez vos ${label} ici`}
          </p>
          <p className="text-sm text-gray-500 mb-3">ou cliquez pour parcourir vos fichiers</p>
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full dark:bg-gray-800">
            <File size={14} />
            <span>Accepte les fichiers {accept}</span>
          </div>
        </div>
      </div>
            
      {/* Statistiques */}
      {selectedFiles.length > 0 && (
        <motion.div
          className="mt-6 bg-blue-50 rounded-lg p-4 dark:bg-gray-800 shadow-sm dark:hover:bg-gray-400"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium text-blue-900">
                {selectedFiles.length} fichier{selectedFiles.length > 1 ? 's' : ''} sélectionné
                {selectedFiles.length > 1 ? 's' : ''}
              </div>
              <div className="text-sm text-blue-700">
                Taille totale: {formatFileSize(getTotalSize())}
              </div>
            </div>
            <button
              onClick={handleClearAllFiles}
              className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:text-red-700 
              hover:bg-red-100 rounded-lg transition-colors duration-200"
            >
              <Trash2 size={14} />
              <span className="text-sm font-medium">Tout supprimer</span>
            </button>
          </div>
        </motion.div>
      )}

    {/* Liste des fichiers */}
    <AnimatePresence>
      {selectedFiles.length > 0 && (
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white">
              Fichiers sélectionnés
            </h4>
            {multiple && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Vous pouvez ajouter plus de fichiers
              </p>
            )}
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {selectedFiles.map((file, index) => (
                <motion.div
                  key={`${file.name}-${index}-${file.lastModified}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="flex-shrink-0 p-2 bg-blue-50 dark:bg-blue-900 rounded-lg mr-3">
                      <File size={20} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleRemoveFile(index)}
                    className="flex-shrink-0 ml-3 p-2 text-gray-400 dark:text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900 rounded-lg transition-colors duration-200"
                    title="Supprimer ce fichier"
                  >
                    <X size={16} />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
};

export default FileUpload;
