import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Calendar, Weight, Ruler, MapPin, FileText,
  Pill, AlertCircle, Upload,
} from 'lucide-react';
import FileUpload from '../components/common/FileUpload';
import { uploadEcg, getPatient } from '../services/api'; 
import type { Patient, PatientOut, ECG } from '../types';

const ImportPage: React.FC = () => {
  const { patientId } = useParams();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const prefill = query.get('prefill') === 'true';
  const FS = 360;

  const navigate = useNavigate();

  // ------------------------------------------------------------ State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    age: '',
    weight: '',
    height: '',
    address: '',
    medicalHistory: '',
    medication: false,
    allergies: '',
  });

  const [ecgData, setEcgData] = useState<Pick<ECG, 'date' | 'location' | 'samplingRate'>>({
    date: new Date().toISOString().split('T')[0],
    location: '',
    samplingRate: FS,
  });

  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [patientData, setPatientData] = useState<PatientOut | null>(null);

  // ------------------------------------------------------------ Prefill patient if needed
  useEffect(() => {
    const loadPatientData = async () => {
      if (prefill && patientId) {
        setLoading(true);
        setError(null);
        try {
          const patient = await getPatient(Number(patientId));
          setPatientData(patient);
        } catch (err) {
          setError("Erreur lors du chargement des informations du patient.");
        } finally {
          setLoading(false);
        }
      }
    };
    loadPatientData();
  }, [prefill, patientId]);

  // ------------------------------------------------------------ Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleFileSelect = (selectedFiles: File[]) => setFiles(selectedFiles);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      setError('Veuillez télécharger au moins un fichier ECG.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let patientPayload: Patient;
      
      if (prefill && patientData) {
        // Utiliser les données du patient existant
        patientPayload = {
          firstName: patientData.prenom || '',
          lastName: patientData.nom || '',
          dateOfBirth: patientData.date_naissance || '',
          age: patientData.age || 0,
          weight: patientData.poids || 0,
          height: patientData.taille || 0,
          address: patientData.adresse || '',
          medicalHistory: patientData.antecedant || '',
          medication: patientData.prise_medoc === 'true' || patientData.prise_medoc === '1',
          allergies: patientData.allergies || '',
        } as Patient;
      } else {
        // Utiliser les données du formulaire
        patientPayload = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          dateOfBirth: formData.dateOfBirth,
          age: parseInt(formData.age, 10),
          weight: parseFloat(formData.weight),
          height: parseFloat(formData.height),
          address: formData.address.trim(),
          medicalHistory: formData.medicalHistory.trim(),
          medication: formData.medication,
          allergies: formData.allergies.trim(),
        } as Patient;
      }

      await uploadEcg(patientPayload, files, ecgData, true);

      navigate('/ecg-list');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue lors de l\'import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ------------------------------------------------------------ JSX
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className="text-2xl font-semibold p-6 mb-6 rounded-xl dark:bg-gray-800 dark:border-gray-700">
        {prefill ? 'Ajouter un ECG' : 'Importer des données ECG'}
      </h1>

      {error && (
        <div className="mb-6 p-3 bg-accent-50 dark:bg-accent-900/50 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300 rounded-md">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mb-6 text-center">Chargement des informations du patient...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ------------------------------------------------ Patient Info (si pas prefill) ------------------------------------ */}
          {!prefill && (
            <div className="card p-6">
              <h2 className="text-xl font-medium mb-4">Informations du patient</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Prénom */}
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <User size={16} className="inline mr-1" /> Prénom *
                  </label>
                  <input type="text" id="firstName" name="firstName" value={formData.firstName} onChange={handleInputChange} required className="input" />
                </div>

                {/* Nom */}
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nom *
                  </label>
                  <input type="text" id="lastName" name="lastName" value={formData.lastName} onChange={handleInputChange} required className="input" />
                </div>

                {/* Date de naissance */}
                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar size={16} className="inline mr-1" /> Date de naissance *
                  </label>
                  <input type="date" id="dateOfBirth" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} required className="input" />
                </div>

                {/* Âge */}
                <div>
                  <label htmlFor="age" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Âge (années) *
                  </label>
                  <input type="number" id="age" name="age" value={formData.age} onChange={handleInputChange} required min="0" max="120" className="input" />
                </div>

                {/* Poids */}
                <div>
                  <label htmlFor="weight" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Weight size={16} className="inline mr-1" /> Poids (kg) *
                  </label>
                  <input type="number" id="weight" name="weight" value={formData.weight} onChange={handleInputChange} required step="0.1" min="0" className="input" />
                </div>

                {/* Taille */}
                <div>
                  <label htmlFor="height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Ruler size={16} className="inline mr-1" /> Taille (cm) *
                  </label>
                  <input type="number" id="height" name="height" value={formData.height} onChange={handleInputChange} required step="0.1" min="0" className="input" />
                </div>

                {/* Adresse */}
                <div className="md:col-span-2">
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <MapPin size={16} className="inline mr-1" /> Adresse
                  </label>
                  <input type="text" id="address" name="address" value={formData.address} onChange={handleInputChange} className="input" />
                </div>

                {/* Antécédents médicaux */}
                <div className="md:col-span-2">
                  <label htmlFor="medicalHistory" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FileText size={16} className="inline mr-1" /> Antécédents médicaux
                  </label>
                  <textarea id="medicalHistory" name="medicalHistory" value={formData.medicalHistory} onChange={handleInputChange} rows={3} className="input" />
                </div>

                {/* Médication */}
                <div>
                  <div className="flex items-center">
                    <input type="checkbox" id="medication" name="medication" checked={formData.medication} onChange={handleInputChange} className="h-4 w-4 text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500" />
                    <label htmlFor="medication" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      <Pill size={16} className="inline mr-1" /> Prise de médicaments
                    </label>
                  </div>
                </div>

                {/* Allergies */}
                <div>
                  <label htmlFor="allergies" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <AlertCircle size={16} className="inline mr-1" /> Allergies
                  </label>
                  <input type="text" id="allergies" name="allergies" value={formData.allergies} onChange={handleInputChange} className="input" />
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------ Patient existant (si prefill) ------------------------------------ */}
          {prefill && patientData && (
            <div className="card p-6">
              <h2 className="text-xl font-medium mb-4">Patient sélectionné</h2>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <p className="text-lg font-medium">
                  {patientData.prenom} {patientData.nom}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Âge: {patientData.age} ans | Né(e) le: {patientData.date_naissance}
                </p>
              </div>
            </div>
          )}
          {/* ------------------------------------------------ ECG ---------------------------------------- */}
          <div className="card p-6">
            <h2 className="text-xl font-medium mb-4">Données ECG</h2>
           
            {/* Fichier CSV */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Upload size={16} className="inline mr-1" /> Télécharger le fichier ECG (CSV) *
              </label>
              <FileUpload
                onFilesChange={handleFileSelect}
                onEcgDataChange={setEcgData}
                defaultEcgData={ecgData} 
                isSubmitting={isSubmitting}
              />
            </div>
          </div>

          {/* ------------------------------------------------ Submit -------------------------------------- */}
          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? 'Traitement en cours...' : (prefill ? 'Ajouter l\'ECG' : 'Importer les données ECG')}
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
};

export default ImportPage;