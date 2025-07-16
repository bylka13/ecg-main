import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, FileText } from 'lucide-react';

import PatientInfo from '../components/common/PatientInfo';
import ECGChart from '../components/ecg/ECGChart';
import ECGDataTable from '../components/ecg/ECGDataTable';

import { getPatient, getData, ECGRecordOut, writeCache} from '../services/api'; // <-- API calls

const VisualizationPage: React.FC = () => {

  const { ecgId, patientId } = useParams<{ ecgId?: string, patientId?: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<any>(null);
  const [ecg, setEcg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ecg' | 'rPeaks' | 'rrIntervals'>('ecg');

  useEffect(() => {
    const loadData = async () => {
      if (!ecgId || !patientId) {
        setError("Aucun ecgId ou patientId.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [patientData, ecgData] = await Promise.all([
          getPatient(Number(patientId)),
          getData(Number(patientId), Number(ecgId)),
        ]);
        setPatient(patientData);
        setEcg(ecgData);
        writeCache(`patient-${patientId}`, patientData);
        writeCache(`ecg-${patientId}-${ecgId}`, ecgData);
        setLoading(false);
      } catch (err: any) {
        setError("Erreur de chargement : " + (err.message || err.toString()));
        setLoading(false);
      }
    };
    loadData();
  }, [patientId, ecgId]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary-600 mb-3" />
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-red-500 mb-4">{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/ecg-list')}>Retour à la liste</button>
      </div>
    );
  }

  if (!patient || !ecg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 mb-4">Aucune donnée à afficher.</p>
        <button className="btn btn-primary" onClick={() => navigate('/ecg-list')}>Retour à la liste</button>
      </div>
    );
  }

  const ecgDates: string[] = patient.ecg_records.map((record : ECGRecordOut) => 
    record.date_prise
      ? new Date(record.date_prise).toLocaleDateString()
      : 'N/A'
  );

  const ecgLieu: string[] = patient.ecg_records.map((record : ECGRecordOut) => 
    record.lieu
      ? record.lieu
      : 'Non spécifié'
  );

  // --- Adapter le format pour tes DataTables (à ajuster selon la réponse API) ---
  const FS = ecg.sampling_rate || 360;
  const dataArr = ecg.ecg_data || [];

  const ecgTableData = dataArr.map(([time, value]: [number, number], index: number) => ({
    index,
    time: time.toFixed(3),
    value: value.toFixed(3),
  }));

  const rPeaksTableData = (ecg.r_peaks || []).map(([time, amplitude]: [number, number], index: number) => ({
    index,
    time: time.toFixed(3),
    amplitude: amplitude.toFixed(3),
  }));

  const rrIntervalsTableData = (ecg.rr_intervals || []).map(
    ([timestamp, duration]: [number, number], index: number) => ({
      index,
      timestamp: timestamp.toFixed(3),             // en secondes
      interval: duration.toFixed(3),                // en secondes
      bpm: (60 / duration).toFixed(1),              // battements par minute
    })
  );

  // ------------------------------------------------------------------------------

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-center mb-6">
        <button
          className="mr-3 p-2 rounded-full hover:bg-gray-100"
          onClick={() => navigate('/ecg-list')}
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold">ECG Visualization</h1>
        <div className="ml-auto space-x-2">
          <button className="btn btn-outline" onClick={() => navigate(`/report/${patientId}/${ecgId}`)}>
            <FileText size={18} className="mr-1" />
            Visualiser le Rapport
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 space-y-6">
          <ECGChart 
            patientId={Number(patientId)}
            ecgId={Number(ecgId)}
            data={dataArr.map(([, value]: [number, number]) => value)} 
            rPeaks={ecg.r_peaks?.map(([time]: [number, number]) => time)} 
            rrIntervals={
              (ecg.rr_intervals as [number, number][] | undefined)?.map(
                ([timestamp, duration]: [number, number]) => ({ timestamp, duration })
              ) ?? []
            }            
            sampling={ecg.sampling_rate}
          />
          {/* ... ANALYSE/CARD ... */}

          <div className="card overflow-hidden">
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  className={`px-4 py-3 text-sm font-medium ${activeTab === 'ecg' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('ecg')}
                >
                  ECG Values
                </button>
                <button
                  className={`px-4 py-3 text-sm font-medium ${activeTab === 'rPeaks' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('rPeaks')}
                >
                  R Peaks
                </button>
                <button
                  className={`px-4 py-3 text-sm font-medium ${activeTab === 'rrIntervals' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('rrIntervals')}
                >
                  RR Intervals
                </button>
              </div>
            </div>
            <div className="p-4">
              {activeTab === 'ecg' && (
                <ECGDataTable
                  title="ECG Values"
                  data={ecgTableData}
                  columns={[
                    { key: 'index', label: 'Index' },
                    { key: 'time', label: 'Time (s)' },
                    { key: 'value', label: 'Value (mV)' },
                  ]}
                />
              )}
              {activeTab === 'rPeaks' && (
                <ECGDataTable
                  title="R Peaks"
                  data={rPeaksTableData}
                  columns={[
                    { key: 'index', label: 'Peak #' },
                    { key: 'time', label: 'Time (s)' },
                    { key: 'amplitude', label: 'Amplitude (mV)' },
                  ]}
                />
              )}
              {activeTab === 'rrIntervals' && (
                <ECGDataTable
                  title="RR Intervals"
                  data={rrIntervalsTableData}
                  columns={[
                    { key: 'index', label: 'Interval #' },
                    { key: 'interval', label: 'Interval (s)' },
                    { key: 'bpm', label: 'Instant HR (BPM)' },
                  ]}
                />
              )}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <PatientInfo patient={patient} />
          <div className="card p-4">
            <h3 className="text-lg font-medium mb-3">Infos d'Enregistrement</h3>
            <div className="space-y-3">
              <div>
                <span className="text-sm text-gray-700 font-medium">Date&#160;:</span>
                <span className="text-sm text-gray-900 ml-2"><strong>{ecgDates[0]}</strong></span>
              </div>
              <div>
                <span className="text-sm text-gray-700 font-medium">Lieu&#160;:</span>
                <span className="text-sm text-gray-900 ml-2"><strong>{ecgLieu}</strong></span>
              </div>
              <div>
                <span className="text-sm text-gray-700 font-medium">Fréquence d'Échantillonnage&#160;:</span>
                <span className="text-sm text-gray-900 ml-2"><strong>{FS} Hz</strong></span>
              </div>
              <div>
                <span className="text-sm text-gray-700 font-medium">Data Points&#160;:</span>
                <span className="text-sm text-gray-900 ml-2"><strong>{dataArr.length}</strong></span>
              </div>
              <div>
                <span className="text-sm text-gray-700 font-medium">Durée&#160;:</span>
                <span className="text-sm text-gray-900 ml-2"><strong>{(dataArr.length / FS).toFixed(1)} secondes</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default VisualizationPage;
