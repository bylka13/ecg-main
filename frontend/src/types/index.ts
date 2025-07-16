export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: number;
  weight: number;
  height: number;
  address: string;
  medicalHistory: string;
  medication: boolean;
  allergies: string;
  ecgs: ECG[];
}

export interface ECG {
  id: string;
  patientId: string;
  date: string;
  location: string;
  samplingRate: number;
  data: number[];
  rPeaks: number[];
  rrIntervals: number[];
  analysis?: ECGAnalysis;
}

export interface ECGAnalysis {
  totalBeats: number;
  bpm: number;
  temporalAnalysis: {
    sdnn: number;
    rmssd: number;
    pnn50: number;
    pnn20?: number; 
  };
  frequencyAnalysis: {
    lf: number;
    hf: number;
    lfHfRatio: number;
  };
  nonLinearAnalysis: {
    sd1: number;
    sd2: number;
    sd1Sd2Ratio: number;
    alpha1: number;
    alpha2: number;
  };
  classification: {
    rhythmType: string;
    confidence: number;
  };
  llmAnalysis: string;
}

export interface ECGRecordOut {
  id: number;
  patient_id: number;
  fichier_csv: string;
  lieu: string;
  frequence_hz: number;
  date_prise: string | null; 
}

export interface PatientOut{
  id : number; 
  nom: string;
  prenom : string;
  date_naissance : string;
  age : number;
  poids : number;
  taille : number;
  adresse : string;
  antecedant : string; 
  prise_medoc : string; 
  allergies : string
  ecg_records : ECGRecordOut[]
}

export interface StoreState {
  patients: Patient[];
  currentPatient: Patient | null;
  currentECG: ECG | null;
  
  addPatient: (patient: Patient) => void;
  updatePatient: (patient: Patient) => void;
  setCurrentPatient: (patientId: string | null) => void;
  
  addECG: (patientId: string, ecg: Omit<ECG, 'id' | 'patientId'>) => void;
  setCurrentECG: (ecgId: string | null) => void;
  
  // importCSV: (patientId: string, file: File, date?: string, location?: string, samplingRate?: number) => Promise<void>;
  // generateAnalysis: (ecgId: string) => Promise<void>;
}

  // importCSV: async (
  //   patientId: string,
  //   file: File,
  //   date?: string,
  //   location?: string,
  //   samplingRate: number = 250
  // ) => {
  //   try {
  //     const response = await api.importECG({
  //       firstName: get().currentPatient?.firstName || '',
  //       lastName: get().currentPatient?.lastName || '',
  //       dateOfBirth: get().currentPatient?.dateOfBirth || '',
  //       age: get().currentPatient?.age || 0,
  //       weight: get().currentPatient?.weight || 0,
  //       height: get().currentPatient?.height || 0,
  //       address: get().currentPatient?.address || '',
  //       medicalHistory: get().currentPatient?.medicalHistory || '',
  //       medication: get().currentPatient?.medication || false,
  //       allergies: get().currentPatient?.allergies || '',
  //       date: date || new Date().toISOString(),
  //       location: location || '',
  //       samplingRate,
  //       file,
  //     });

  //     const ecgId = get().addECG(patientId, {
  //       date: date || new Date().toISOString(),
  //       location: location || '',
  //       samplingRate,
  //       data: [],
  //       rPeaks: [],
  //       rrIntervals: [],
  //     });

  //     await get().generateAnalysis(ecgId);
  //   } catch (error) {
  //     console.error('Error importing CSV:', error);
  //     throw error;
  //   }
  // },
  
  // generateAnalysis: async (ecgId: string) => {
  //   const state = get();
  //   let patient = null;
  //   let ecg = null;

  //   for (const p of state.patients) {
  //     const e = p.ecgs.find(e => e.id === ecgId);
  //     if (e) {
  //       patient = p;
  //       ecg = e;
  //       break;
  //     }
  //   }

  //   if (patient && ecg) {
  //     try {
  //       const ecgData = await api.getData(parseInt(patient.id), parseInt(ecg.id));
        
  //       set(state => {
  //         const updatedPatients = state.patients.map(p => {
  //           if (p.id === patient.id) {
  //             const updatedECGs = p.ecgs.map(e => {
  //               if (e.id === ecgId) {
  //                 return {
  //                   ...e,
  //                   data: ecgData.ecg_data.map(([_, v]: [number, number]) => v),
  //                   rPeaks: ecgData.r_peaks.map(([t, _]: [number, number]) => Math.round(t * ecgData.sampling_rate)),
  //                   rrIntervals: ecgData.rr_intervals.map(([_, v]: [number, number]) => Math.round(v * ecgData.sampling_rate)),
  //                   analysis: {
  //                     totalBeats: ecgData.r_peaks.length,
  //                     bpm: (ecgData.metrics.time_domain.MeanRR != null) ? Math.round(60 / (ecgData.metrics.time_domain.MeanRR / 1000)) : -1,
  //                     temporalAnalysis: {
  //                       sdnn: (ecgData.metrics.time_domain.SDNN != null)?ecgData.metrics.time_domain.SDNN:-1,
  //                       rmssd: (ecgData.metrics.time_domain.RMSSD!=null)?ecgData.metrics.time_domain.RMSSD:-1,
  //                       pnn50: (ecgData.metrics.time_domain.pNN50!=null)?ecgData.metrics.time_domain.pNN50:-1,
  //                     },
  //                     frequencyAnalysis: {
  //                       lf: (ecgData.metrics.frequency_domain.LF!=null)?ecgData.metrics.frequency_domain.LF:-1,
  //                       hf: (ecgData.metrics.frequency_domain.HF!=null)?ecgData.metrics.frequency_domain.HF:-1,
  //                       lfHfRatio: (ecgData.metrics.frequency_domain.LF_HF_ratio!=null)?ecgData.metrics.frequency_domain.LF_HF_ratio:-1,
  //                     },
  //                     nonLinearAnalysis: {
  //                       sd1: (ecgData.metrics.non_linear_domain.SD1!=null)?ecgData.metrics.non_linear_domain.SD1:-1,
  //                       sd2: (ecgData.metrics.non_linear_domain.SD2!=null)?ecgData.metrics.non_linear_domain.SD2:-1,
  //                       sd1Sd2Ratio: (ecgData.metrics.non_linear_domain.SD1_SD2_ratio!=null)?ecgData.metrics.non_linear_domain.SD1_SD2_ratio:-1,
  //                       alpha1: (ecgData.metrics.non_linear_domain.alpha1!=null)?ecgData.metrics.non_linear_domain.alpha1:-1,
  //                       alpha2: (ecgData.metrics.non_linear_domain.alpha2!=null)?ecgData.metrics.non_linear_domain.alpha2:-1,
  //                     },
  //                     classification: {
  //                       rhythmType: "Normal Sinus Rhythm",
  //                       confidence: 0.95,
  //                     },
  //                     llmAnalysis: "Analyse automatique en cours de développement",
  //                   }
  //                 };
  //               }
  //               return e;
  //             });
  //             return { ...p, ecgs: updatedECGs };
  //           }
  //           return p;
  //         });

  //         return {
  //           patients: updatedPatients,
  //           currentECG: state.currentECG?.id === ecgId
  //             ? {
  //                 ...state.currentECG,
  //                 data: ecgData.ecg_data.map(([_, v]: [number, number]) => v),
  //                 rPeaks: ecgData.r_peaks.map(([t, _]: [number, number]) => Math.round(t * ecgData.sampling_rate)),
  //                 rrIntervals: ecgData.rr_intervals.map(([_, v]: [number, number]) => Math.round(v * ecgData.sampling_rate)),
  //               }
  //             : state.currentECG
  //         };
  //       });
  //     } catch (error) {
  //       console.error('Error generating analysis:', error);
  //     }
  //   }
  // }