import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Eye, FileText, PlusCircle, Search, BarChart3, Trash, Plus, X, AlertTriangle, CheckCircle } from "lucide-react";
import type { Patient, ECG, PatientOut } from "../types";
import { deleteECG, deletePatient, readCache, writeCache } from "../services/api";

// -----------------------------------------------------------------------------
// Composants Toast et Modal
// -----------------------------------------------------------------------------
interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm ${
        type === 'success'
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {type === 'success' ? (
            <CheckCircle size={20} className="mr-2" />
          ) : (
            <AlertTriangle size={20} className="mr-2" />
          )}
          <span className="text-sm font-medium">{message}</span>
        </div>
        <button
          onClick={onClose}
          className="ml-3 text-white hover:text-gray-200 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
};

interface ConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "Supprimer",
  cancelText = "Annuler"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        <div className="flex items-center mb-4">
          <AlertTriangle size={28} className="text-red-500 mr-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Hook pour gérer les toasts
// -----------------------------------------------------------------------------
const useToast = () => {
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast(null);
  };

  return { toast, showToast, hideToast };
};

// -----------------------------------------------------------------------------
// Utilitaires de mappage API → modèles front (évite les erreurs de clés manquantes)
// -----------------------------------------------------------------------------
const mapApiEcg = (api: any): ECG => ({
  id: String(api.id),
  patientId: String(api.patient_id ?? api.patientId ?? ""),
  date: api.date_prise ?? "",
  location: api.lieu ?? "",
  samplingRate: api.frequence_hz ?? api.samplingRate,
  data: api.data ?? [],
  rPeaks: api.rPeaks ?? [],
  rrIntervals: api.rrIntervals ?? [],
  analysis: api.analysis ?? undefined,
});

const mapApiPatient = (api: any): Patient => ({
  id: String(api.id),
  firstName: api.prenom ?? api.firstName ?? "",
  lastName: api.nom ?? api.lastName ?? "",
  dateOfBirth: api.date_naissance ?? "",
  age: api.age ?? 0,
  weight: api.poids ?? 0,
  height: api.taille ?? 0,
  address: api.adresse ?? "",
  medicalHistory: api.antecedant ?? "",
  medication: api.prise_medoc ?? false,
  allergies: api.allergies ?? "",
  ecgs: (api.ecg_records ?? api.ecgs ?? []).map(mapApiEcg),
});

// -----------------------------------------------------------------------------
// Page principale
// -----------------------------------------------------------------------------
const ECGListPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // États pour les modales de confirmation
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'patient' | 'ecg';
    patientId?: string | number;
    ecgId?: string | number;
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'patient',
    title: '',
    message: ''
  });

  // ---------------------------------------------------------------------------
  // Fetch patients (au montage)
  // ---------------------------------------------------------------------------
  const fetchPatients = async () => {
    const cached = readCache<Patient[]>("patients");
    if (cached) {
      setPatients(cached);
      setLoading(false);
    }
    try {
      const res = await fetch("http://localhost:8000/api/patients");
      if (!res.ok) {
        throw new Error(`Erreur serveur : ${res.status}`);
      }
      const raw: PatientOut[] = await res.json();
      const data: Patient[] = raw.map(mapApiPatient);
      setPatients(data);
      writeCache("patients", data);
      raw.forEach((p) => writeCache(`patient-${p.id}`, p));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers & helpers
  // ---------------------------------------------------------------------------
  const filteredPatients = patients.filter((patient) => {
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase());
  });

  const handleNavigateToImport = () => navigate("/");
  const handleNavigateToVisualization = (patientId: string | number, ecgId: string | number) =>
    navigate(`/visualization/${patientId}/${ecgId}`);
  const handleNavigateToReport = (patientId: string | number, ecgId: string | number) =>
    navigate(`/report/${patientId}/${ecgId}`);

  // ---------------------------------------------------------------------------
  // Gestion des suppressions avec modales
  // ---------------------------------------------------------------------------
  const initiateDeleteECG = (patientId: string | number, ecgId: string | number) => {
    setConfirmModal({
      isOpen: true,
      type: 'ecg',
      patientId,
      ecgId,
      title: 'Confirmer la suppression',
      message: 'Êtes-vous sûr de vouloir supprimer cet ECG ? Cette action est irréversible.'
    });
  };

  const initiateDeletePatient = (patientId: string | number) => {
    setConfirmModal({
      isOpen: true,
      type: 'patient',
      patientId,
      title: 'Confirmer la suppression',
      message: 'Supprimer ce patient ainsi que tous ses ECGs ? Cette action est irréversible.'
    });
  };

  const handleConfirmDelete = async () => {
    try {
      if (confirmModal.type === 'ecg' && confirmModal.patientId && confirmModal.ecgId) {
        await deleteECG(Number(confirmModal.patientId), Number(confirmModal.ecgId));
        showToast('ECG supprimé avec succès !', 'success');
      } else if (confirmModal.type === 'patient' && confirmModal.patientId) {
        await deletePatient(Number(confirmModal.patientId));
        showToast('Patient supprimé avec succès !', 'success');
      }
      fetchPatients();
    } catch (e: any) {
      showToast(
        `Erreur de suppression : ${e?.response?.data?.detail || e.message}`,
        'error'
      );
    } finally {
      setConfirmModal({ ...confirmModal, isOpen: false });
    }
  };

  const handleCancelDelete = () => {
    setConfirmModal({ ...confirmModal, isOpen: false });
  };

  function handleAddECG(id: string | number): void {
    navigate(`/add-ecg/${id}?prefill=true`);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) return <div className="p-6 text-center text-gray-900 dark:text-white">Chargement…</div>;
  if (error)
    return (
      <div className="p-6 text-center text-red-600 dark:text-red-400">
        Impossible de récupérer les patients : {error}
      </div>
    );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Enregistrements ECG</h1>
        <button className="btn btn-primary" onClick={handleNavigateToImport}>
          <PlusCircle size={18} className="mr-1" />
          Ajouter Un Nouveau Patient
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="card mb-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              className="input pl-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Cherchez Un Patient…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Liste des patients */}
      {filteredPatients.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {filteredPatients.map((patient) => (
            <motion.div
              key={patient.id}
              className="card overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Patient header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div className="flex items-center">
                  <Users size={22} className="text-gray-400 dark:text-gray-500 mr-2" />
                  <div>
                    <div className="flex items-center">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        {patient.firstName} {patient.lastName}
                      </h3>
                      {patient.age !== undefined && (
                        <span className="ml-2 text-sm text-gray-800 dark:text-gray-200">
                          {patient.age} ans
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Ajouter un ECG pour ce patient"
                    onClick={() => handleAddECG(patient.id)}
                  >
                    <Plus size={22} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Supprimer ce patient"
                    onClick={() => initiateDeletePatient(patient.id)}
                  >
                    <Trash size={22} className="text-red-400" />
                  </button>
                </div>
              </div>

              {/* ECG list */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {patient.ecgs.length > 0 ? (
                  patient.ecgs.map((ecg) => (
                    <div key={ecg.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <BarChart3 size={25} className="text-accent-500 mr-2" />
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              ECG enregistré le {ecg.date ? new Date(ecg.date).toLocaleDateString("fr-FR") : "n/a"}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {ecg.location || "Lieu non spécifié"}
                            </p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            className="btn btn-outline py-1 px-2 text-sm border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => handleNavigateToVisualization(patient.id, ecg.id)}
                          >
                            <Eye size={16} className="mr-1" />
                            Visualiser
                          </button>
                          <button
                            className="btn btn-primary py-1 px-2 text-sm"
                            onClick={() => handleNavigateToReport(patient.id, ecg.id)}
                          >
                            <FileText size={16} className="mr-1" />
                            Générer Le Rapport
                          </button>
                          <button
                            className="btn btn-danger py-1 px-2 text-sm"
                            title="Supprimer cet ECG"
                            onClick={() => initiateDeleteECG(patient.id, ecg.id)}
                          >
                            <Trash size={16} className="mr-1" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                      {ecg.analysis && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-center">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Fréquence Cardiaque</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{ecg.analysis.bpm} BPM</p>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-center">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Rythme</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{ecg.analysis.classification.rhythmType}</p>
                          </div>
                          {ecg.data.length > 0 && (
                            <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-center">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Durée</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{(ecg.data.length / ecg.samplingRate).toFixed(1)} s</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <p>Pas d'enregistrement ECG pour ce patient.</p>
                    <button
                      className="mt-2 btn btn-outline py-1 px-2 text-sm border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      onClick={() => handleAddECG(patient.id)}
                    >
                      Importer ECG
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card p-6 text-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Aucun patient trouvé. Commencez par ajouter un nouveau patient.
          </p>
          <button className="btn btn-primary" onClick={handleNavigateToImport}>
            <PlusCircle size={18} className="mr-1" />
            Ajouter Un Nouveau Patient
          </button>
        </div>
      )}

      {/* Modal de confirmation */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        title={confirmModal.title}
        message={confirmModal.message}
      />

      {/* Toast de notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}
    </motion.div>
  );
};

export default ECGListPage;