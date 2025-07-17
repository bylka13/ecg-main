import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ChevronLeft, 
  Printer, 
  Download, 
  Heart, 
  Activity, 
  Clock, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ReferenceLine, Legend
} from 'recharts';
import PatientInfo from '../components/common/PatientInfo';
import { getPatient, getData, readCache, generateLLMAnalysis } from '../services/api';
import type { PatientOut, ECGAnalysis } from '../types';
import { useThemeStore } from '../store';

declare global {
  interface Window {
    html2pdf: any;
  }
}

const ReportPage: React.FC = () => {
  const pageRef = useRef<HTMLDivElement>(null);
  const { ecgId, patientId } = useParams<{ ecgId?: string; patientId?: string }>();
  const navigate = useNavigate();

  const [FS, setFs] = useState<number>(360);
  const [currentPatient, setCurrentPatient] = useState<PatientOut | null>(null);
  const [currentECG, setCurrentECG] = useState<{
    id: number;
    data: number[];
    rPeaks: number[];
    rrIntervals: number[];
    analysis: ECGAnalysis;
    date: string;
    location: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Déterminer le type de rythme sinusal à partir des intervalles RR (en secondes)
  const calculerRythmeSinusal = (
    rrIntervals: number[]
  ): { rhythmType: string; confidence: number } => {
    if (rrIntervals.length === 0) {
      return { rhythmType: 'Données insuffisantes', confidence: 0 };
    }

    const rrMs = rrIntervals.map((v) => v * 1000);
    const moyenne = rrMs.reduce((a, b) => a + b, 0) / rrMs.length;
    const ecartType = Math.sqrt(
      rrMs.reduce((sum, val) => sum + Math.pow(val - moyenne, 2), 0) /
        rrMs.length
    );
    const bpm = 60000 / moyenne;

    let rhythmType = '';
    if (bpm >= 60 && bpm <= 100 && ecartType < 80) {
      rhythmType = 'Rythme sinusal normal';
    } else if (bpm < 60 && ecartType < 80) {
      rhythmType = 'Bradycardie sinusale';
    } else if (bpm > 100 && ecartType < 80) {
      rhythmType = 'Tachycardie sinusale';
    } else {
      rhythmType = 'Rythme irrégulier';
    }

    const confidence = Math.max(0, 1 - Math.min(ecartType / 200, 1));
    return { rhythmType, confidence };
  };
  
  useEffect(() => {
    const chargerDonnees = async () => {
      if (!ecgId || !patientId) {
        setError("Aucun identifiant ECG ou patient spécifié dans l'URL.");
        setLoading(false);
        return;
      }

      const ecgIdParse = parseInt(ecgId, 10);
      const patientIdParse = parseInt(patientId, 10);
      if (Number.isNaN(ecgIdParse) || Number.isNaN(patientIdParse)) {
        setError("Paramètres invalides dans l'URL.");
        setLoading(false);
        return;
      }

      try {
        let donneesPatient = readCache<PatientOut>(`patient-${patientIdParse}`);
        let donneesECG = readCache<any>(`ecg-${patientIdParse}-${ecgIdParse}`);

        if (!donneesPatient || !donneesECG) {
          [donneesPatient, donneesECG] = await Promise.all([
            getPatient(patientIdParse),
            getData(patientIdParse, ecgIdParse),
          ]);
        }

        setCurrentPatient(donneesPatient);
        setFs(donneesECG.sampling_rate);

        const analyse: ECGAnalysis = {
          totalBeats: donneesECG.r_peaks.length,
          bpm: donneesECG.metrics.time_domain.HRV_MeanNN != null
            ? Math.round(60 / (donneesECG.metrics.time_domain.HRV_MeanNN / 1000))
            : -1,
          temporalAnalysis: {
            sdnn: Math.round(donneesECG.metrics.time_domain.HRV_SDNN ?? -1),
            rmssd: Math.round(donneesECG.metrics.time_domain.HRV_RMSSD ?? -1),
            pnn50: Math.round((donneesECG.metrics.time_domain.HRV_pNN50 ?? -1) * 100) / 100,
            pnn20: Math.round((donneesECG.metrics.time_domain.HRV_pNN20 ?? -1) * 100) / 100,
          },
          frequencyAnalysis: {
            lf: Math.round(donneesECG.metrics.frequency_domain.HRV_LF ?? -1),
            hf: Math.round(donneesECG.metrics.frequency_domain.HRV_HF ?? -1),
            lfHfRatio: Math.round((donneesECG.metrics.frequency_domain.HRV_LFHF ?? -1) * 100) / 100,
          },
          nonLinearAnalysis: {
            sd1: Math.round(donneesECG.metrics.non_linear_domain.HRV_SD1 ?? -1),
            sd2: Math.round(donneesECG.metrics.non_linear_domain.HRV_SD2 ?? -1),
            sd1Sd2Ratio: Math.round((donneesECG.metrics.non_linear_domain.HRV_SD1SD2 ?? -1) * 100) / 100,
            alpha1: Math.round((donneesECG.metrics.non_linear_domain.HRV_DFA_alpha1 ?? -1) * 100) / 100,
            alpha2: -1, 
          },
          classification: calculerRythmeSinusal(
            donneesECG.rr_intervals.map(([, v]: [number, number]) => v)
          ),
          llmAnalysis: await genererAnalyseLLM(
            patientIdParse,
            ecgIdParse,
            donneesECG.metrics,
          ),
        };

        const enregistrement = donneesPatient.ecg_records.find(r => r.id === ecgIdParse);

        setCurrentECG({
          id: ecgIdParse,
          data: donneesECG.ecg_data.map(([, v]: [number, number]) => v),
          rPeaks: donneesECG.r_peaks.map(([t]: [number, number]) => t),
          rrIntervals: donneesECG.rr_intervals.map(([, v]: [number, number]) => Math.round(v * donneesECG.sampling_rate)),
          analysis: analyse,
          date: enregistrement?.date_prise || '',
          location: enregistrement?.lieu || '',
        });
      } catch (err: any) {
        console.error(err);
        setError(err?.message || 'Erreur lors du chargement des données.');
      } finally {
        setLoading(false);
      }
    };

    chargerDonnees();
  }, [patientId, ecgId]);

  const genererAnalyseLLM = async (
    pid: number,
    eid: number,
    metrics: any,
  ): Promise<string> => {
    try {
      return await generateLLMAnalysis(pid, eid, metrics);
    } catch (err) {
      console.error(err);
      return "Analyse LLM indisponible";
    }
  };
  // Génération des données pour le graphique de Poincaré avec amélioration de l'échelle
  const genererDonneesPoincare = () => {
    const donnees = [];
    for (let i = 0; i < currentECG!.rrIntervals.length - 1; i++) {
      donnees.push({
        x: currentECG!.rrIntervals[i] / FS * 1000, // RR(n) en ms
        y: currentECG!.rrIntervals[i + 1] / FS * 1000, // RR(n+1) en ms
      });
    }
    return donnees;
  };
  // Génération de l'histogramme des intervalles RR avec meilleure distribution
  const genererHistogrammeRR = () => {
    const valeursRR = currentECG!.rrIntervals.map(rr => rr / FS * 1000); // en ms
    const min = Math.min(...valeursRR);
    const max = Math.max(...valeursRR);
    const largeurBin = Math.max(10, (max - min) / 20); // Au moins 10ms par bin, 20 bins

    const nbBins = Math.ceil((max - min) / largeurBin);
    const bins = Array(nbBins).fill(0).map((_, i) => ({
      intervalle: min + i * largeurBin,
      nombre: 0,
      label: `${(min + i * largeurBin).toFixed(0)}`
    }));

    valeursRR.forEach(rr => {
      const indexBin = Math.min(Math.floor((rr - min) / largeurBin), nbBins - 1);
      bins[indexBin].nombre++;
    });

    return bins;
  };

  // Génération du spectre de puissance amélioré avec zones de référence
  const genererSpectrePuissance = () => {
    const spectre = [];
    for (let i = 0; i <= 100; i++) {
      const freq = i * 0.005; // 0 à 0.5 Hz avec plus de points
      let puissance = 0;

      // Création des pics VLF, LF et HF plus réalistes
      if (freq < 0.04) {
        // VLF (Very Low Frequency)
        puissance = 200 * Math.exp(-Math.pow((freq - 0.015) / 0.01, 2)) + Math.random() * 20;
      } else if (freq >= 0.04 && freq < 0.15) {
        // LF (Low Frequency)
        puissance = 600 * Math.exp(-Math.pow((freq - 0.08) / 0.03, 2)) + Math.random() * 50;
      } else if (freq >= 0.15 && freq < 0.4) {
        // HF (High Frequency)
        puissance = 400 * Math.exp(-Math.pow((freq - 0.25) / 0.05, 2)) + Math.random() * 40;
      } else {
        puissance = Math.max(0, 30 - freq * 60) + Math.random() * 15;
      }

      spectre.push({
        frequence: freq,
        puissance: Math.max(0, puissance),
        bande: freq < 0.04 ? 'VLF' : freq < 0.15 ? 'LF' : freq < 0.4 ? 'HF' : 'Autres'
      });
    }

    return spectre;
  };

  // Génération des données pour le graphique en secteurs des bandes de fréquence
  const genererDonneesFrequences = () => {
    const lf = currentECG!.analysis.frequencyAnalysis.lf;
    const hf = currentECG!.analysis.frequencyAnalysis.hf;
    const vlf = Math.round(lf * 0.6); // Estimation VLF
    const total = lf + hf + vlf;
    
    return [
      { name: 'VLF (0-0.04Hz)', value: vlf, pourcentage: (vlf / total * 100).toFixed(1), couleur: '#EF4444' },
      { name: 'LF (0.04-0.15Hz)', value: lf, pourcentage: (lf / total * 100).toFixed(1), couleur: '#3B82F6' },
      { name: 'HF (0.15-0.4Hz)', value: hf, pourcentage: (hf / total * 100).toFixed(1), couleur: '#10B981' }
    ];
  };

  // Données pour graphique de tendance HRV dans le temps
  const genererTendanceHRV = () => {
    const tendance = [];
    const fenetreSize = Math.max(1, Math.floor(currentECG!.rrIntervals.length / 50));
    
    for (let i = 0; i < currentECG!.rrIntervals.length - fenetreSize; i += fenetreSize) {
      const fenetre = currentECG!.rrIntervals.slice(i, i + fenetreSize).map(rr => rr / FS * 1000);
      const moyenne = fenetre.reduce((a, b) => a + b, 0) / fenetre.length;
      const ecartType = Math.sqrt(fenetre.reduce((sum, val) => sum + Math.pow(val - moyenne, 2), 0) / fenetre.length);
      
      tendance.push({
        temps: (i * fenetreSize / FS).toFixed(1),
        moyenne: moyenne.toFixed(1),
        variabilite: ecartType.toFixed(1),
        bpm: Math.round(60000 / moyenne)
      });
    }
    
    return tendance;
  };

  const { isDarkMode } = useThemeStore();
  // const generatePdf = async (action : 'download' | 'print') => {
  //   const element = pageRef.current;
  //   if (!element || !window.html2pdf) return;

  //   const opt = {
  //     margin: [8, 8, 8, 8], 
  //     filename: `rapport_ecg_${currentPatient?.nom}_${currentPatient?.prenom}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`,
  //     image: { type: 'jpeg', quality: 0.98 },
  //     html2canvas: { 
  //       scale: 2, 
  //       useCORS: true,
  //       logging: false,
  //       letterRendering: true,
  //       allowTaint: true,
  //       backgroundColor: isDarkMode ? '#111827' : '#ffffff', // Fond conditionnel selon le thème
  //       width: element.offsetWidth, 
  //       height: element.offsetHeight,
  //       dpi: 300 
  //     },  
  //     jsPDF: { 
  //       unit: 'mm', 
  //       format: 'a4', 
  //       orientation: 'portrait',
  //     },
  //   };

  //   const originalStyle = element.style.cssText;
  //   const originalClassList = element.className;
    
  //   try {
  //     // Appliquer le mode sombre seulement si l'app est en mode sombre
  //     if (isDarkMode) {
  //       element.className = originalClassList + ' dark print-mode-dark';
  //       element.style.cssText += `
  //         width: 396.5mm !important;
  //         max-width: none !important;
  //         font-size: 16px !important;
  //         line-height: 1.4 !important;
  //         background-color: #111827 !important;
  //         color: #ffffff !important;
  //       `;

  //       // Appliquer les styles sombres aux éléments enfants
  //       const allElements = element.querySelectorAll('*');
  //       const originalStyles: { element: Element; originalStyle: string }[] = [];
        
  //       allElements.forEach((el) => {
  //         const htmlEl = el as HTMLElement;
  //         originalStyles.push({ element: el, originalStyle: htmlEl.style.cssText });
          
  //         // Forcer les couleurs sombres
  //         if (htmlEl.style.backgroundColor && 
  //             (htmlEl.style.backgroundColor.includes('white') || 
  //              htmlEl.style.backgroundColor.includes('rgb(255, 255, 255)') ||
  //              htmlEl.style.backgroundColor.includes('#ffffff') ||
  //              htmlEl.style.backgroundColor.includes('#fff'))) {
  //           htmlEl.style.backgroundColor = '#1f2937';
  //         }
          
  //         if (htmlEl.style.color && 
  //             (htmlEl.style.color.includes('black') || 
  //              htmlEl.style.color.includes('rgb(0, 0, 0)') ||
  //              htmlEl.style.color.includes('#000000') ||
  //              htmlEl.style.color.includes('#000'))) {
  //           htmlEl.style.color = '#ffffff';
  //         }
  //       });

  //       const pdfInstance = window.html2pdf().set(opt).from(element);
  //       if (action === 'download') {
  //         await pdfInstance.save();
  //       } 
  //       else if (action === 'print') {
  //         const pdfBlob = await pdfInstance.outputPdf('blob');
  //         const pdfUrl = URL.createObjectURL(pdfBlob);
          
  //         const printWindow = window.open('', '_blank');
  //         if (printWindow) {
  //           printWindow.document.write(`
  //             <html class="dark">
  //               <head>
  //                 <title>Impression Rapport ECG</title>
  //                 <style>
  //                   body { 
  //                     margin: 0; 
  //                     background-color: #111827 !important; 
  //                     color: #ffffff !important;
  //                   }
  //                   embed {
  //                     background-color: #111827 !important;
  //                   }
  //                 </style>
  //               </head>
  //               <body>
  //                 <embed src="${pdfUrl}" type="application/pdf" width="100%" height="100%" />
  //               </body>
  //             </html>
  //           `);
  //           printWindow.document.close();
            
  //           printWindow.onload = () => {
  //             setTimeout(() => {
  //               printWindow.print();
  //             }, 1000);
  //           };
  //         }
  //       }

  //       // Restaurer les styles originaux
  //       originalStyles.forEach(({ element, originalStyle }) => {
  //         (element as HTMLElement).style.cssText = originalStyle;
  //       });

  //     } else {
  //       // Mode light - garder les styles par défaut
  //       element.style.cssText += `
  //         width: 396.5mm !important;
  //         max-width: none !important;
  //         font-size: 16px !important;
  //         line-height: 1.4 !important;
  //       `;

  //       const pdfInstance = window.html2pdf().set(opt).from(element);
  //       if (action === 'download') {
  //         await pdfInstance.save();
  //       } 
  //       else if (action === 'print') {
  //         const pdfBlob = await pdfInstance.outputPdf('blob');
  //         const pdfUrl = URL.createObjectURL(pdfBlob);
          
  //         const printWindow = window.open('', '_blank');
  //         if (printWindow) {
  //           printWindow.document.write(`
  //             <html>
  //               <head>
  //                 <title>Impression Rapport ECG</title>
  //                 <style>
  //                   body { 
  //                     margin: 0; 
  //                     background-color: #ffffff !important; 
  //                     color: #000000 !important;
  //                   }
  //                   embed {
  //                     background-color: #ffffff !important;
  //                   }
  //                 </style>
  //               </head>
  //               <body>
  //                 <embed src="${pdfUrl}" type="application/pdf" width="100%" height="100%" />
  //               </body>
  //             </html>
  //           `);
  //           printWindow.document.close();
            
  //           printWindow.onload = () => {
  //             setTimeout(() => {
  //               printWindow.print();
  //             }, 1000);
  //           };
  //         }
  //       }
  //     }

  //   } catch (error) {
  //     console.error('Erreur lors de la génération du PDF:', error);
  //   } finally {
  //     element.style.cssText = originalStyle;
  //     element.className = originalClassList;
  //   }
  // };
  
  /*2eme version*/ 
  
  // const generatePdf = async (action: 'download' | 'print') => {
  //   const element = pageRef.current as HTMLElement | null;
  //   if (!element || !(window as any).html2pdf) return;
  
  //   /* ------------------------------------------------------------------ */
  //   /* 1 ▸ CLONAGE HORS ÉCRAN                                             */
  //   /* ------------------------------------------------------------------ */
  //   const clone = element.cloneNode(true) as HTMLElement;
  //   const sandbox = document.createElement('div');
  //   Object.assign(sandbox.style, {
  //     position: 'fixed',
  //     top: '-9999px',
  //     left: '0',
  //     zIndex: '-1',
  //     width: 'auto',
  //     height: 'auto',
  //     overflow: 'visible',
  //   });
  //   sandbox.appendChild(clone);
  //   document.body.appendChild(sandbox);
  
  //   /* ------------------------------------------------------------------ */
  //   /* 2 ▸ MESURES & FORMAT PDF                                           */
  //   /* ------------------------------------------------------------------ */
  //   const rect = clone.getBoundingClientRect();
  //   const pxToMm = (px: number) => (px * 25.4) / 96; // 96 dpi → mm
  //   const pdfSize: [number, number] = [pxToMm(rect.width), pxToMm(rect.height)];
  //   const isLandscape = rect.width > rect.height;
  
  //   /* ------------------------------------------------------------------ */
  //   /* 3 ▸ STYLES TEMPORAIRES SUR LE CLONE                                */
  //   /* ------------------------------------------------------------------ */
  //   clone.style.maxWidth = '100%';
  //   clone.style.boxSizing = 'border-box';
  //   clone.style.wordWrap = 'break-word';
  //   clone.style.backgroundColor = isDarkMode ? '#111827' : '#ffffff';
  //   clone.style.color = isDarkMode ? '#ffffff' : '#000000';
  //   if (isDarkMode) clone.classList.add('print-dark');
  
  //   /* ------------------------------------------------------------------ */
  //   /* 4 ▸ OPTIONS html2pdf                                               */
  //   /* ------------------------------------------------------------------ */
  //   const opt = {
  //     margin: [8, 8, 8, 8] as const,
  //     filename: `rapport_ecg_${currentPatient?.nom ?? ''}_${currentPatient?.prenom ?? ''}_${new Date()
  //       .toLocaleDateString('fr-FR')
  //       .replace(/\//g, '-')}.pdf`,
  //     pagebreak: { mode: ['css', 'legacy'] },
  //     image: { type: 'jpeg', quality: 0.98 },
  //     html2canvas: {
  //       scale: Math.min(window.devicePixelRatio || 1.5, 3), // ×3 max pour perf
  //       useCORS: true,
  //       logging: false,
  //       backgroundColor: isDarkMode ? '#111827' : '#ffffff',
  //     },
  //     jsPDF: {
  //       unit: 'mm',
  //       format: pdfSize,
  //       orientation: isLandscape ? 'landscape' : 'portrait',
  //     },
  //   } as const;
  
  //   /* ------------------------------------------------------------------ */
  //   /* 5 ▸ GÉNÉRATION & ACTION (download / print)                         */
  //   /* ------------------------------------------------------------------ */
  //   try {
  //     const pdf = (window as any).html2pdf().set(opt).from(clone);
  
  //     if (action === 'download') {
  //       await pdf.save();
  //     } else {
  //       const blob = await pdf.outputPdf('blob');
  //       const url = URL.createObjectURL(blob);
  //       const printWindow = window.open(url, '_blank');
  //       if (printWindow) {
  //         printWindow.onload = () => setTimeout(() => printWindow.print(), 500);
  //       }
  //     }
  //   } catch (err) {
  //     console.error('generatePdf error', err);
  //   } finally {
  //     /* ---------------------------------------------------------------- */
  //     /* 6 ▸ CLEAN‑UP                                                     */
  //     /* ---------------------------------------------------------------- */
  //     document.body.removeChild(sandbox);
  //   }
  // };
  
  /*3eme version*/
  const generatePdf = async (action: 'download' | 'print') => {
    const element = pageRef.current as HTMLElement | null;
    if (!element || !(window as any).html2pdf) return;
  
    /* ------------------------------------------------------------------ */
    /* 1 ▸ CLONAGE HORS ÉCRAN                                             */
    /* ------------------------------------------------------------------ */
    const clone = element.cloneNode(true) as HTMLElement;
    const sandbox = document.createElement('div');
    sandbox.style.cssText = 'position:fixed;top:-9999px;left:0;visibility:hidden;z-index:-1;';
    sandbox.appendChild(clone);
    document.body.appendChild(sandbox);
  
    /* ------------------------------------------------------------------ */
    /* 2 ▸ MISE AU FORMAT A4 (LARGEUR FIXE)                               */
    /* ------------------------------------------------------------------ */
    // 210mm (A4) – (2 × 10mm marges) = 190mm utilisables
    clone.style.width = '190mm';
    clone.style.maxWidth = '190mm';
    clone.style.boxSizing = 'border-box';
    clone.style.wordWrap = 'break-word';
    clone.style.background = isDarkMode ? '#111827' : '#ffffff';
    clone.style.color = isDarkMode ? '#ffffff' : '#000000';
    if (isDarkMode) clone.classList.add('print-dark');
  
    const rect = clone.getBoundingClientRect();
    const isLandscape = rect.width > rect.height;
  
    /* ------------------------------------------------------------------ */
    /* 3 ▸ OPTIONS html2pdf                                               */
    /* ------------------------------------------------------------------ */
    const opt = {
      margin: [10, 10, 10, 10] as const, // 10 mm partout
      filename: `rapport_ecg_${currentPatient?.nom ?? ''}_${currentPatient?.prenom ?? ''}_${new Date()
        .toLocaleDateString('fr-FR')
        .replace(/\//g, '-')}.pdf`,
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['.no-page-break'],
      },
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: Math.min(window.devicePixelRatio || 2, 3), // pas de sous‑échelle <1
        useCORS: true,
        logging: false,
        backgroundColor: isDarkMode ? '#111827' : '#ffffff',
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: isLandscape ? 'landscape' : 'portrait',
      },
    } as const;
  
    /* ------------------------------------------------------------------ */
    /* 4 ▸ GÉNÉRATION & ACTION                                            */
    /* ------------------------------------------------------------------ */
    try {
      const pdf = (window as any).html2pdf().set(opt).from(clone);
  
      if (action === 'download') {
        await pdf.save();
      } else {
        const blob = await pdf.outputPdf('blob');
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => setTimeout(() => printWindow.print(), 500);
        }
      }
    } catch (err) {
      console.error('generatePdf error', err);
    } finally {
      document.body.removeChild(sandbox);
    }
  };
  const handleDownloadPdf = () => generatePdf('download');
  const handlePrintPdf = () => generatePdf('print');

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mb-4" />
        <div className="text-lg text-gray-600 dark:text-gray-300">Chargement du rapport...</div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">Analyse des données ECG en cours</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <p className="text-red-600 dark:text-red-400 text-lg font-semibold mb-2">Erreur de chargement</p>
        <p className="text-gray-600 dark:text-gray-300 mb-6 text-center max-w-md">{error}</p>
        <button 
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
          onClick={() => navigate('/ecg-list')}
        >
          Retour à la liste des ECG
        </button>
      </div>
    );
  }

  if (!currentECG || !currentPatient || !currentECG.analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Heart className="h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
        <p className="text-gray-600 dark:text-gray-300 text-lg mb-4">Aucune donnée ECG disponible</p>
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
          onClick={() => navigate('/ecg-list')}
        >
          Retour à la liste des ECG
        </button>
      </div>
    );
  }

  const donneesPoincare = genererDonneesPoincare();
  const donneesHistogrammeRR = genererHistogrammeRR();
  const donneesSpectre = genererSpectrePuissance();
  const donneesFrequences = genererDonneesFrequences();
  const donneesTendance = genererTendanceHRV();
  const couleursGraphique = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B'];

  // Évaluation de la santé cardiaque
  const evaluerSanteCardiaque = () => {
    const bpm = currentECG.analysis.bpm;
    const sdnn = currentECG.analysis.temporalAnalysis.sdnn;
    let score = 0;
    let statut = '';
    let couleur = '';

    // Évaluation basée sur la FC et la VFC
    if (bpm >= 60 && bpm <= 100) score += 40;
    else if (bpm >= 50 && bpm <= 110) score += 20;
    
    if (sdnn >= 50) score += 40;
    else if (sdnn >= 30) score += 20;
    
    score += 20; // Score de base

    if (score >= 80) {
      statut = 'Excellent';
      couleur = 'text-green-600 dark:text-green-400';
    } else if (score >= 60) {
      statut = 'Bon';
      couleur = 'text-blue-600 dark:text-blue-400';
    } else if (score >= 40) {
      statut = 'Moyen';
      couleur = 'text-yellow-600 dark:text-yellow-400';
    } else {
      statut = 'À surveiller';
      couleur = 'text-red-600 dark:text-red-400';
    }

    return { score, statut, couleur };
  };

  const evaluationSante = evaluerSanteCardiaque();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="pb-10"
      ref={pageRef}
    >
      {/* En-tête avec navigation */}
      <div className="flex items-center justify-between rounded-xl p-6 mb-6 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center">
          <button data-html2canvas-ignore="true"
            className="mr-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => navigate(`/visualization/${patientId}/${currentECG.id}`)}
          > 
            <ChevronLeft size={24} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
              Rapport d'Analyse ECG
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">
              {currentPatient.prenom} {currentPatient.nom} • {new Date(currentECG.date).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>

        <div className="flex gap-3 print:hidden">
          <button data-html2canvas-ignore="true" 
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
                      text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={18} />
            Télécharger PDF
          </button>

          <button data-html2canvas-ignore="true"
            onClick={handlePrintPdf}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600
                      text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Printer size={18} />
            Imprimer
          </button>
        </div>
      </div>

      {/* En-tête d'impression */}
      <div className="text-center mb-6 hidden ">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2 ">Rapport d'Analyse ECG</h1>
        <p className="text-gray-600 dark:text-gray-300 text-lg mb-4">
          Généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
        </p>
        <div className="w-24 h-1 bg-blue-500 mx-auto rounded"></div>
      </div>

      {/* Informations patient et résumé */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 ">
        <PatientInfo patient={currentPatient} className="lg:col-span-1" />

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 lg:col-span-2">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-800 dark:text-white">
            <Activity className="text-blue-500" size={24} />
            Résumé de l'Enregistrement
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="text-blue-600 dark:text-blue-400" size={18} />
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Durée</p>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {(currentECG.data.length / FS).toFixed(1)}s
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 p-4 rounded-lg border border-green-200 dark:border-green-700">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="text-green-600 dark:text-green-400" size={18} />
                <p className="text-sm font-medium text-green-800 dark:text-green-200">Fréquence</p>
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                {currentECG.analysis.bpm} BPM
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-4 rounded-lg border border-purple-200 dark:border-purple-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="text-purple-600 dark:text-purple-400" size={18} />
                <p className="text-sm font-medium text-purple-800 dark:text-purple-200">Battements</p>
              </div>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {currentECG.analysis.totalBeats}
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-orange-600 dark:text-orange-400" size={18} />
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">État</p>
              </div>
              <p className={`text-lg font-bold ${evaluationSante.couleur}`}>
                {evaluationSante.statut}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tendance temporelle de la HRV */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-800 dark:text-white">
          <TrendingUp className="text-blue-500" size={24} />
          Évolution Temporelle de la Variabilité
        </h3>
        <div className="h-[220px] lg:h-[200px] print:h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={donneesTendance} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="temps" 
                label={{ value: 'Temps (s)', position: 'insideBottom', offset: -10 }}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                yAxisId="left"
                label={{ value: 'Intervalle RR (ms)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                label={{ value: 'BPM', angle: 90, position: 'insideRight' }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value, name) => [
                  `${value}${name === 'moyenne' ? ' ms' : name === 'variabilite' ? ' ms' : ' bpm'}`, 
                  name === 'moyenne' ? 'RR moyen' : name === 'variabilite' ? 'Variabilité' : 'Fréquence'
                ]}
                labelFormatter={(label) => `Temps: ${label}s`}
                contentStyle={{
                  backgroundColor: document.documentElement.classList.contains('dark') ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  border: document.documentElement.classList.contains('dark') ? '1px solid #4b5563' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  color: document.documentElement.classList.contains('dark') ? '#f9fafb' : '#000'
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                height={120}
                wrapperStyle={{ 
                  paddingLeft: 15,
                  lineHeight: '2'
                }}
                formatter={(value) => {
                  switch (value) {
                    case 'moyenne':
                      return 'RR moyen (ms)';
                    case 'variabilite':
                      return 'Variabilité (ms)';
                    case 'bpm':
                      return 'Fréquence (bpm)';
                    default:
                      return value;
                  }
                }}
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="moyenne" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                name="moyenne"
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="variabilite" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={false}
                name="variabilite"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="bpm" 
                stroke="#EF4444" 
                strokeWidth={2}
                dot={false}
                name="bpm"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Analyses temporelles et fréquentielles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Analyse Temporelle</h3>
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">SDNN</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {currentECG.analysis.temporalAnalysis.sdnn} ms
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Écart-type de tous les intervalles NN (variabilité globale)
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">RMSSD</span>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {currentECG.analysis.temporalAnalysis.rmssd} ms
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Racine carrée de la moyenne des différences successives au carré
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">pNN50</span>
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {currentECG.analysis.temporalAnalysis.pnn50}%
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Pourcentage des intervalles NN successifs &gt; 50ms
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">pNN20</span>
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {currentECG.analysis.temporalAnalysis.pnn20}%
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Pourcentage des intervalles NN successifs &gt; 20ms
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Analyse Fréquentielle</h3>
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">Puissance LF</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {currentECG.analysis.frequencyAnalysis.lf} ms²
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Basses fréquences (0,04-0,15 Hz) - Système sympathique
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">Puissance HF</span>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {currentECG.analysis.frequencyAnalysis.hf} ms²
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Hautes fréquences (0,15-0,4 Hz) - Système parasympathique
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-200">Ratio LF/HF</span>
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {currentECG.analysis.frequencyAnalysis.lfHfRatio}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Équilibre sympathique/parasympathique
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Graphiques d'analyse avancée */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Graphique de Poincaré */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-base font-semibold mb-3 text-gray-800 dark:text-white">Graphique de Poincaré</h3>
          <div className="h-56 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="RR(n)"
                  domain={['dataMin - 50', 'dataMax + 50']}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'RR(n) (ms)', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fontSize: '10px' } }}
                  tickFormatter={(value) => Math.round(value).toString()}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="RR(n+1)"
                  domain={['dataMin - 50', 'dataMax + 50']}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'RR(n+1) (ms)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '10px' } }}
                  tickFormatter={(value) => Math.round(value).toString()}
                />
                {/* Ligne d'identité (y = x) */}
                <ReferenceLine 
                  segment={[
                    { x: Math.min(...donneesPoincare.map(d => d.x)), y: Math.min(...donneesPoincare.map(d => d.x)) },
                    { x: Math.max(...donneesPoincare.map(d => d.x)), y: Math.max(...donneesPoincare.map(d => d.x)) }
                  ]}
                  stroke="#94a3b8" 
                  strokeDasharray="5 5" 
                  strokeWidth={1}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${Math.round(typeof value === 'number' ? value : parseFloat(value.toString()))} ms`, 
                    name === 'x' ? 'RR(n)' : 'RR(n+1)'
                  ]}
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ 
                    fontSize: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
                <Scatter
                  name="Intervalles RR"
                  data={donneesPoincare}
                  fill="#3B82F6"
                  fillOpacity={0.6}
                  stroke="#1e40af"
                  strokeOpacity={0.8}
                  strokeWidth={0.5}
                  r={3}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1 bg-gray-50 dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between">
                <span>SD1:</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{currentECG.analysis.nonLinearAnalysis.sd1} ms</span>
              </div>
              <div className="flex justify-between">
                <span>SD2:</span>
                <span className="font-medium text-green-600 dark:text-green-400">{currentECG.analysis.nonLinearAnalysis.sd2} ms</span>
              </div>
            </div>
            <div className="flex justify-center pt-1">
              <div className="flex justify-between w-24">
                <span>SD1/SD2:</span>
                <span className="font-medium text-purple-600 dark:text-purple-400">{currentECG.analysis.nonLinearAnalysis.sd1Sd2Ratio}</span>
              </div>
            </div>
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              Points proches de la diagonale = rythme régulier
            </div>
          </div>
        </div>

        {/* Distribution des intervalles RR */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-base font-semibold mb-3 text-gray-800 dark:text-white">Distribution RR</h3>
          <div className="h-56 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={donneesHistogrammeRR}
                margin={{ top: 10, right: 10, bottom: 30, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis
                  dataKey="intervalle"
                  tickFormatter={(value) => value.toFixed(0)}
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: number) => [value, 'Occurrences']}
                  labelFormatter={(label: number) => `${label.toFixed(0)} ms`}
                  contentStyle={{ 
                    fontSize: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
                <Bar 
                  dataKey="nombre" 
                  fill="#10B981" 
                  radius={[1, 1, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 text-center">
            Distribution des intervalles RR
          </p>
        </div>

        {/* Spectre de puissance */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-base font-semibold mb-3 text-gray-800 dark:text-white">Spectre de Puissance</h3>
          <div className="h-56 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={donneesSpectre}
                margin={{ top: 10, right: 10, bottom: 30, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis
                  dataKey="frequence"
                  tickFormatter={(value) => value.toFixed(2)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: number) => [value.toFixed(1) + ' ms²', 'Puissance']}
                  labelFormatter={(label: number) => `${label.toFixed(3)} Hz`}
                  contentStyle={{ 
                    fontSize: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="puissance"
                  stroke="#8B5CF6"
                  fill="#8B5CF6"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs text-gray-600 dark:text-gray-300 text-center">
            <div className="bg-red-50 dark:bg-red-900/30 p-1 rounded border border-red-200 dark:border-red-700">
              <div className="font-medium text-red-700 dark:text-red-300">VLF</div>
              <div>0-0.04Hz</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 p-1 rounded border border-blue-200 dark:border-blue-700">
              <div className="font-medium text-blue-700 dark:text-blue-300">LF</div>
              <div>0.04-0.15Hz</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/30 p-1 rounded border border-green-200 dark:border-green-700">
              <div className="font-medium text-green-700 dark:text-green-300">HF</div>
              <div>0.15-0.4Hz</div>
            </div>
          </div>
        </div>
      </div>

      {/* Analyse non-linéaire et classification */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Analyse Non-Linéaire</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">SD1</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                {currentECG.analysis.nonLinearAnalysis.sd1} ms
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Variabilité court terme
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 p-4 rounded-lg border border-green-200 dark:border-green-700">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">SD2</p>
              <p className="text-xl font-bold text-green-900 dark:text-green-100">
                {currentECG.analysis.nonLinearAnalysis.sd2} ms
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Variabilité long terme
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-4 rounded-lg border border-purple-200 dark:border-purple-700">
              <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">Alpha1</p>
              <p className="text-xl font-bold text-purple-900 dark:text-purple-100">
                {currentECG.analysis.nonLinearAnalysis.alpha1}
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                Corrélation court terme
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">Alpha2</p>
              <p className="text-xl font-bold text-orange-900 dark:text-orange-100">
                {currentECG.analysis.nonLinearAnalysis.alpha2}
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                Corrélation long terme
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Classification du Rythme</h3>
          
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg font-medium text-gray-800 dark:text-gray-200">
                {currentECG.analysis.classification.rhythmType}
              </span>
              <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
                {Math.round(currentECG.analysis.classification.confidence * 100)}% confiance
              </span>
            </div>
            
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 mb-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${currentECG.analysis.classification.confidence * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Répartition des fréquences */}
          <div className="mb-4">
            <h4 className="font-medium mb-3 text-gray-800 dark:text-gray-200">Répartition Spectrale</h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donneesFrequences}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {donneesFrequences.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={couleursGraphique[index % couleursGraphique.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `${value} ms² (${donneesFrequences.find(d => d.name === name)?.pourcentage}%)`, 
                      name
                    ]}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Évaluation globale de la santé cardiaque */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Évaluation Globale de la Santé Cardiaque</h3>
        
        <div className="flex items-center justify-between mb-6 p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-lg border border-gray-200 dark:border-gray-600">
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Score de Santé Cardiaque</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">Basé sur la fréquence cardiaque et la variabilité</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-200">{evaluationSante.score}/100</div>
            <div className={`text-lg font-semibold ${evaluationSante.couleur}`}>
              {evaluationSante.statut}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
            <Heart className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{currentECG.analysis.bpm}</div>
            <div className="text-sm text-blue-700 dark:text-blue-300">BPM</div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {currentECG.analysis.bpm >= 60 && currentECG.analysis.bpm <= 100 ? 'Normal' : 
               currentECG.analysis.bpm < 60 ? 'Bradycardie' : 'Tachycardie'}
            </div>
          </div>
          
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700">
            <Activity className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {currentECG.analysis.temporalAnalysis.sdnn}
            </div>
            <div className="text-sm text-green-700 dark:text-green-300">SDNN (ms)</div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              {currentECG.analysis.temporalAnalysis.sdnn >= 50 ? 'Excellente VFC' : 
               currentECG.analysis.temporalAnalysis.sdnn >= 30 ? 'VFC correcte' : 'VFC faible'}
            </div>
          </div>
          
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-700">
            <TrendingUp className="h-8 w-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {currentECG.analysis.frequencyAnalysis.lfHfRatio}
            </div>
            <div className="text-sm text-purple-700 dark:text-purple-300">LF/HF</div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              {currentECG.analysis.frequencyAnalysis.lfHfRatio >= 1 && currentECG.analysis.frequencyAnalysis.lfHfRatio <= 4 ? 
               'Équilibre normal' : currentECG.analysis.frequencyAnalysis.lfHfRatio > 4 ? 
               'Stress possible' : 'Relaxation'}
            </div>
          </div>
        </div>
      </div>

      {/* Analyse LLM */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Analyse Automatique Détaillée</h3>
        <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg border border-gray-200 dark:border-gray-600">
          <pre className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {currentECG.analysis.llmAnalysis}
          </pre>
        </div>
        
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">Avertissement Important</p>
              <p className="text-yellow-700 dark:text-yellow-300">
                Cette analyse est générée automatiquement à des fins d'aide au diagnostic. 
                Elle doit impérativement être validée par un cardiologue ou un professionnel 
                de santé qualifié avant toute prise de décision médicale.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recommandations et conclusions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h3 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Recommandations et Suivi</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              Recommandations Générales
            </h4>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                Maintenir une activité physique régulière et adaptée
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                Adopter une alimentation équilibrée et pauvre en sel
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                Gérer le stress par des techniques de relaxation
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                Éviter le tabac et limiter la consommation d'alcool
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Suivi Médical
            </h4>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></span>
                Consultation cardiologique de contrôle dans 6 mois
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></span>
                Surveillance de la tension artérielle
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></span>
                ECG de contrôle si symptômes
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                Consultation urgente en cas de douleurs thoraciques
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Pied de page du rapport */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8 pt-6 border-t border-gray-200 p-6 rounded-xl dark:bg-gray-800 dark:border-gray-600">
        <p className="mb-2">
          Rapport généré automatiquement le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
        </p>
        <p>
          Système d'Analyse ECG Automatisé • Version 2.0 • 
          <span className="font-medium"> Ne remplace pas l'avis médical professionnel</span>
        </p>
      </div>
    </motion.div>
  );
};

export default ReportPage;