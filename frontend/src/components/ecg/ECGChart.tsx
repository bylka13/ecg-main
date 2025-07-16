import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, ReferenceArea, Legend} from "recharts";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { ChevronLeft, ChevronRight, ZoomOut, RotateCcw, Play } from "lucide-react";
import { motion } from "framer-motion";
import { getBeatClassification, BeatClassification, } from "../../services/api";

interface ECGChartProps {
  patientId: number;
  ecgId: number;
  data: number[];
  rPeaks: number[]; // temps en secondes
  rrIntervals: { timestamp: number; duration: number }[];
  sampling: number;
  segmentDuration?: number; // durée segment (en secondes)
}

type LegendPayload = {
  value: string;
  id?: string;
  type?: "line" | "rect" | "circle" | "cross" | "diamond" | "star" | "triangle" | "wye" | undefined;
  color?: string;
  inactive?: boolean;
};

const formatTime = (v: number) => `${v.toFixed(3)}s`;

const TriangleMarker = (props: any) => {
  const { cx, cy, fill, onClick } = props;
  const size = 16;
  const points = [
    [cx, cy - size / 2],
    [cx - size / 2, cy + size / 2],
    [cx + size / 2, cy + size / 2],
  ].map((p) => p.join(",")).join(" ");

  return (
    <polygon
      points={points}
      fill={fill}
      pointerEvents="auto"
      style={{ cursor: 'pointer' }}
      data-peak 
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    />
  );
};

const ECGChart: React.FC<ECGChartProps> = ({
  patientId,
  ecgId,
  data,
  rPeaks,
  rrIntervals,
  sampling,
  segmentDuration = 30,
}) => {
  const [selectedBeat, setSelectedBeat] = useState<number | null>(null);
  const [selectedBeatIndex, setSelectedBeatIndex] = useState<number | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [isDragZoomActive, setIsDragZoomActive] = useState(false);
  const [showRRTrace, setShowRRTrace] = useState(false);
  const [beatClassification, setBeatClassification] = useState<BeatClassification | null>(null);
  const [isLoadingClassification, setIsLoadingClassification] = useState(false);

  // Nouveaux états pour la saisie de segment
  const [segmentStart, setSegmentStart] = useState<string>("");
  const [segmentEnd, setSegmentEnd] = useState<string>("");
  const [segmentError, setSegmentError] = useState<string>("");

  const fullDuration = data.length / sampling;

  // Fenêtre d'affichage en indices
  const [viewWindow, setViewWindow] = useState<[number, number]>([
    0,
    Math.min(segmentDuration * sampling, data.length)
  ]);
  const initialView: [number, number] = [
    0,
    Math.min(segmentDuration * sampling, data.length)
  ];

  // Données pour le graphe ECG
  const chartData = useMemo(
    () =>
      data.map((value, index) => ({
        index,
        value,
        time: index / sampling
      })),
    [data, sampling]
  );

  // Données pour le tracé des RR intervals
  const rrTraceData = useMemo(() => {
    if (!showRRTrace) return [];
    
    const rrData: Array<{time: number, rrDuration: number}> = [];
    
    // Créer un tracé continu des RR intervals
    for (let i = 0; i < rrIntervals.length; i++) {
      const interval = rrIntervals[i];
      rrData.push({
        time: interval.timestamp,
        rrDuration: interval.duration * 1000 // Convertir en ms pour une meilleure visualisation
      });
    }
    
    return rrData;
  }, [rrIntervals, showRRTrace]);

  const visibleData = chartData.slice(viewWindow[0], viewWindow[1]);

  // Obtenir la classification des batements entre t0 - t1
  const fetchBeatClassification = useCallback(async () => {
    setIsLoadingClassification(true);
    try {
      const result = await getBeatClassification(patientId, ecgId);
      setBeatClassification(result);
    } catch (error) {
      console.error("Error fetching beat classification:", error);
      setBeatClassification(null);
    } finally {
      setIsLoadingClassification(false);
    }
  }, [patientId, ecgId, viewWindow, sampling]);

  useEffect(() => {
    fetchBeatClassification();
  }, [fetchBeatClassification]);

  // R-peaks visibles
  const visibleRPeaks = useMemo(() =>
    rPeaks.filter(time => {
      const idx = Math.round(time * sampling);
      return idx >= viewWindow[0] && idx <= viewWindow[1];
    }), [rPeaks, viewWindow, sampling]
  );

  // RRIntervals visibles (décalés vers le premier R-peak)
  const visibleRRIntervals = useMemo(
    () =>
      rrIntervals.filter(interval => {
        const idx = Math.round(interval.timestamp * sampling);
        return idx >= viewWindow[0] && idx <= viewWindow[1];
      }),
    [rrIntervals, viewWindow, sampling]
  );

  // Calculer la position Y pour les RR intervals (décalée vers le bas)
  const getYPositionForRRInterval = (timestamp: number) => {
    const idx = Math.round(timestamp * sampling);
    const baseValue = data[idx] || 0;
    const yRange = Math.max(...data.slice(viewWindow[0], viewWindow[1])) - Math.min(...data.slice(viewWindow[0], viewWindow[1]));
    return baseValue - (yRange * 0.3); // Décaler de 30% vers le bas
  };

  // Calculer le domaine Y basé sur les données ECG visibles pour maintenir l'axe Y stable
  const yDomain = useMemo(() => {
    if (showRRTrace) {
      return ["dataMin - 50", "dataMax + 50"];
    }
    
    // Toujours calculer le domaine basé sur les données ECG visibles, même si ECG est masqué
    const visibleECGData = data.slice(viewWindow[0], viewWindow[1]);
    if (visibleECGData.length === 0) return ["auto", "auto"];
    
    const minVal = Math.min(...visibleECGData);
    const maxVal = Math.max(...visibleECGData);
    const padding = (maxVal - minVal) * 0.1; // 10% de padding
    
    return [minVal - padding, maxVal + padding];
  }, [data, viewWindow, showRRTrace]);

  // Slider
  const sliderMin = 0;
  const sliderMax = fullDuration;
  const sliderStep = 0.05;
  const sliderVals: [number, number] = [
    viewWindow[0] / sampling,
    viewWindow[1] / sampling,
  ];

  const handleSliderChange = (vals: number | number[]) => {
    const [start, end] = vals as number[];
    setViewWindow([
      Math.max(0, Math.floor(start * sampling)),
      Math.min(data.length, Math.ceil(end * sampling)),
    ]);
  };

  // Fonction pour appliquer le segment saisi
  const handleApplySegment = () => {
    setSegmentError("");
    
    const start = parseFloat(segmentStart);
    const end = parseFloat(segmentEnd);

    // Validation
    if (isNaN(start) || isNaN(end)) {
      setSegmentError("Les valeurs doivent être des nombres valides");
      return;
    }

    if (start < 0 || end > fullDuration) {
      setSegmentError(`Les valeurs doivent être entre 0 et ${fullDuration.toFixed(3)}s`);
      return;
    }

    if (start >= end) {
      setSegmentError("Le début doit être inférieur à la fin");
      return;
    }

    // Appliquer le segment
    const startIndex = Math.max(0, Math.floor(start * sampling));
    const endIndex = Math.min(data.length, Math.ceil(end * sampling));
    
    setViewWindow([startIndex, endIndex]);
  };

  // Statistiques du segment visible
  const segmentStats = useMemo(() => {
    if (!beatClassification?.beatsPrediction) {
      return { normal: 0, ventricular: 0, supraventricular: 0, fusion: 0, unknown: 0, bpm: 0 };
    }

    // Trouver les indices globaux des R-peaks dans le segment visible
    const visibleRPeakGlobalIndices: number[] = [];
    rPeaks.forEach((peakTime, globalIndex) => {
      const peakIndex = Math.round(peakTime * sampling);
      if (peakIndex >= viewWindow[0] && peakIndex <= viewWindow[1]) {
        visibleRPeakGlobalIndices.push(globalIndex);
      }
    });

    // Compter les classifications
    const stats = { normal: 0, ventricular: 0, supraventricular: 0, fusion: 0, unknown: 0 };
    
    visibleRPeakGlobalIndices.forEach(globalIndex => {
      if (globalIndex < beatClassification.beatsPrediction.length) {
        const classification = beatClassification.beatsPrediction[globalIndex];
        if (Array.isArray(classification) && classification.length >= 2) {
          const label = classification[1].toLowerCase();
          if (label.includes('normal')) {
            stats.normal++;
          } else if (label.includes('ventriculaire') && !label.includes('supraventriculaire')) {
            stats.ventricular++;
          } else if (label.includes('supraventriculaire')) {
            stats.supraventricular++;
          } else if (label.includes('fusion')) {
            stats.fusion++;
          } else {
            stats.unknown++;
          }
        }
      }
    });

    // Calculer BPM basé sur les RR intervals visibles du segment
    const visibleRRIntervalsForBPM = rrIntervals.filter(interval => {
      const idx = Math.round(interval.timestamp * sampling);
      return idx >= viewWindow[0] && idx <= viewWindow[1];
    });

    let bpm = 0;
    if (visibleRRIntervalsForBPM.length > 0) {
      const avgRRDuration = visibleRRIntervalsForBPM.reduce((sum, interval) => sum + interval.duration, 0) / visibleRRIntervalsForBPM.length;
      bpm = avgRRDuration > 0 ? Math.round(60 / avgRRDuration) : 0;
    }

    return { ...stats, bpm };
  }, [beatClassification, rPeaks, viewWindow, sampling, rrIntervals]);

  // Navigation/zoom
  const handlePrevious = () => {
    const duration = viewWindow[1] - viewWindow[0];
    const newStart = Math.max(0, viewWindow[0] - duration);
    setViewWindow([newStart, newStart + duration]);
  };
  const handleNext = () => {
    const duration = viewWindow[1] - viewWindow[0];
    const newStart = Math.min(data.length - duration, viewWindow[0] + duration);
    setViewWindow([newStart, newStart + duration]);
  };
  const handleZoomOut = () => {
    const center = (viewWindow[0] + viewWindow[1]) / 2;
    const newDuration = Math.min(data.length, (viewWindow[1] - viewWindow[0]) * 2);
    setViewWindow([
      Math.max(0, Math.floor(center - newDuration / 2)),
      Math.min(data.length, Math.ceil(center + newDuration / 2)),
    ]);
  };
  const handleReset = () => {
    setViewWindow(initialView);
    setSelectedBeat(null);
    setSelectedBeatIndex(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setSegmentStart("");
    setSegmentEnd("");
    setSegmentError("");
  };

  // Drag-to-zoom
  const handleMouseDown = useCallback((e: any) => {
    if (!isDragZoomActive) return;
    if (e?.target?.closest("[data-peak]")) return;
    if (e?.activeLabel) setRefAreaLeft(e.activeLabel);
  }, [isDragZoomActive]);

  const handleMouseMove = useCallback((e: any) => {
    if (!isDragZoomActive) return;
    if (refAreaLeft && e && e.activeLabel) setRefAreaRight(e.activeLabel);
  }, [refAreaLeft, isDragZoomActive]);

  const handleMouseUp = useCallback(() => {
    if (!isDragZoomActive) return;
    if (refAreaLeft && refAreaRight) {
      const [left, right] = [refAreaLeft, refAreaRight].sort((a, b) => a - b);
      const leftIndex = Math.max(0, Math.round(left * sampling));
      const rightIndex = Math.min(data.length - 1, Math.round(right * sampling));
      setViewWindow([leftIndex, rightIndex]);
      setRefAreaLeft(null);
      setRefAreaRight(null);
    }
  }, [isDragZoomActive, refAreaLeft, refAreaRight, data.length, sampling]);

  // Tooltip formatters
  const tooltipFormatter = (value: number, name: string) => {
    if (name === 'RR Trace') {
      return [`${value.toFixed(1)} ms`, 'RR Interval'];
    }
    return [`${value.toFixed(3)} mV`, 'Amplitude'];
  };
  const labelFormatter = (label: number) => `Time: ${label.toFixed(3)}s`;

  // show/hide controls
  const [showECGSignal, setShowECGSignal] = useState(true);
  const [showRPeaks, setShowRPeaks] = useState(true);
  const [showRRIntervals, setShowRRIntervals] = useState(true);

  // Legend avec gestion des couleurs grises
  const legendPayload: LegendPayload[] = [
    { 
      value: "ECG Signal", 
      type: "line", 
      color: showECGSignal ? "#2563eb" : "#9ca3af", 
      id: "ECG Signal",
      inactive: !showECGSignal
    },
    { 
      value: "R-Peaks", 
      type: "triangle", 
      color: showRPeaks ? "#ef4444" : "#9ca3af", 
      id: "rPeaks",
      inactive: !showRPeaks
    },
    { 
      value: "RR Intervals", 
      type: "circle", 
      color: showRRIntervals ? "#22c55e" : "#9ca3af", 
      id: "rrIntervals",
      inactive: !showRRIntervals
    },
  ];
  
  const handleLegendClick = (o: any) => {
    if (o && o.id === "ECG Signal") {
      if (showRRTrace) {
        // Si RR Trace est actif, on désactive RR Trace et on réactive tout
        setShowRRTrace(false);
        setShowECGSignal(true);
        setShowRPeaks(true);
        setShowRRIntervals(true);
      } else {
        // Sinon, on toggle normalement ECG Signal
        setShowECGSignal(v => !v);
      }
    }
    if (o && o.id === "rPeaks") {
      if (showRRTrace) {
        // Si RR Trace est actif, on désactive RR Trace et on réactive tout
        setShowRRTrace(false);
        setShowECGSignal(true);
        setShowRPeaks(true);
        setShowRRIntervals(true);
      } else {
        // Sinon, on toggle normalement R-Peaks
        setShowRPeaks(v => !v);
      }
    }
    if (o && o.id === "rrIntervals") {
      if (showRRTrace) {
        // Si RR Trace est actif, on désactive RR Trace et on réactive tout
        setShowRRTrace(false);
        setShowECGSignal(true);
        setShowRPeaks(true);
        setShowRRIntervals(true);
      } else {
        // Sinon, on toggle normalement RR Intervals
        setShowRRIntervals(v => !v);
      }
    }
  };

  // Handle RR Trace toggle
  const handleRRTraceToggle = () => {
    if (!showRRTrace) {
      // Active RR Trace et met les autres en gris
      setShowRRTrace(true);
      setShowECGSignal(false);
      setShowRPeaks(false);
      setShowRRIntervals(false);
    } else {
      // Désactive RR Trace et réactive tout
      setShowRRTrace(false);
      setShowECGSignal(true);
      setShowRPeaks(true);
      setShowRRIntervals(true);
    }
  };

  // Fonction pour obtenir la classification d'un beat spécifique
  const getBeatClassificationLabel = (beatIndex: number | null): string => {
    if (!beatClassification || !beatClassification.beatsPrediction) {  
      console.log("Pas de classification disponible:", beatClassification);
      return "Classification non disponible";
    }

    if (beatIndex === null) {
      return "Beat non sélectionné";
    }

    const predictions = beatClassification.beatsPrediction;  

    // Vérifier si l'index est valide
    if (beatIndex >= 0 && beatIndex < predictions.length) {
      const classification = predictions[beatIndex];
      
      if (Array.isArray(classification)) {
        return classification[1]; // Retourne le label (second élément du tableau)
      }
      return "Format invalide";
    }

    return "Beat hors limites";
  };
  const handleRPeakClick = (peakTime: number) => {
    const peakIndex = Math.round(peakTime * sampling);

    const globalRPeakIndex = rPeaks.findIndex(
      (time) => Math.abs(time - peakTime) < 0.001
    );

    setSelectedBeat(peakIndex);
    setSelectedBeatIndex(globalRPeakIndex);
  };

  function computeSDNN(rrIntervals: { duration: number }[]): number | null {
    if (!rrIntervals || rrIntervals.length < 2) return null;
    // On récupère les durées (déjà en secondes ?) → convertir en ms si besoin
    const values = rrIntervals.map(rr => rr.duration * 1000); // ms
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
  const sdnn = useMemo(() => computeSDNN(
    rrIntervals.filter(interval => {
      const idx = Math.round(interval.timestamp * sampling);
      return idx >= viewWindow[0] && idx <= viewWindow[1];
    })
  ), [rrIntervals, viewWindow, sampling]);

  return (
    <div className="p-6 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      {/* Titre */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Électrocardiogramme (ECG)
        </h2>
        {isLoadingClassification && (
          <div className="flex items-center text-sm text-blue-600 dark:text-blue-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400 mr-2"></div>
            Chargement des classifications...
          </div>
        )}
      </div>

      {/* Section de saisie de segment */}
      <div className="dark:border-blue-600 dark:bg-blue-900/20 mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <h3 className="text-lg font-semibold text-blue-800 mb-3 dark:text-blue-300">Sélection de segment</h3>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-blue-700 dark:text-blue-300">Début (s):</label>
            <input
              type="number"
              value={segmentStart}
              onChange={(e) => setSegmentStart(e.target.value)}
              placeholder="0.000"
              step="0.001"
              min="0"
              max={fullDuration}
              className="w-24 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-blue-500 dark:bg-blue-800 dark:text-white dark:focus:ring-blue-400"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-blue-700">Fin (s):</label>
            <input
              type="number"
              value={segmentEnd}
              onChange={(e) => setSegmentEnd(e.target.value)}
              placeholder={fullDuration.toFixed(3)}
              step="0.001"
              min="0"
              max={fullDuration}
              className="dark:border-blue-500 dark:bg-blue-800 dark:text-white dark:focus:ring-blue-400 w-24 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={handleApplySegment}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-1"
            title="Appliquer le segment"
          >
            <Play size={16} />
            <span>Afficher</span>
          </button>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Durée totale: {fullDuration.toFixed(3)}s
          </div>
        </div>
        {segmentError && (
          <div className="dark:text-red-300 dark:bg-red-900/30 mt-2 text-sm text-red-600 bg-red-100 px-2 py-1 rounded">
            {segmentError}
          </div>
        )}
      </div>

      {/* Contrôles haut */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex space-x-2">
          <button 
            onClick={handlePrevious} 
            disabled={viewWindow[0] <= 0} 
            className="dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-gray-700 dark:disabled:text-gray-500 dark:text-white px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Précédent"
          >
            <ChevronLeft size={18} />
          </button>
          <button 
            onClick={handleZoomOut} 
            className="dark:bg-green-600 dark:hover:bg-green-700 dark:text-white px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            title="Zoom arrière"
          >
            <ZoomOut size={18} />
          </button>
          <button 
            onClick={handleReset} 
            className="dark:bg-gray-600 dark:hover:bg-gray-700 dark:text-white px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            title="Réinitialiser"
          >
            <RotateCcw size={18} />
          </button>
          <button 
            onClick={handleNext} 
            disabled={viewWindow[1] >= data.length} 
            className="dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-gray-700 dark:disabled:text-gray-500 dark:text-white px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Suivant"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setIsDragZoomActive(v => !v)}
            className={`px-2 py-2 rounded-md border transition-colors 
              ${isDragZoomActive
                ? "bg-yellow-400 border-yellow-500 text-yellow-900 dark:bg-yellow-600 dark:text-yellow-100"
                : "dark:bg-gray-700 bg-gray-200 dark:border-gray-600 border-gray-300 text-gray-600 dark:text-gray-300 hover:bg-yellow-100 dark:hover:bg-yellow-800"
              }`}
            title="Activer/Désactiver Drag-to-Zoom"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="10" cy="10" r="6" stroke={isDragZoomActive ? "#92400e" : "#888"} strokeWidth="2" fill="none" />
              <line x1="14" y1="14" x2="20" y2="20" stroke={isDragZoomActive ? "#92400e" : "#888"} strokeWidth="2" strokeLinecap="round" />
              <rect x="6" y="16" width="6" height="3" rx="1" fill={isDragZoomActive ? "#fde68a" : "#f3f4f6"} stroke={isDragZoomActive ? "#92400e" : "#888"} strokeWidth="1"/>
            </svg>
          </button>
          <button
            onClick={handleRRTraceToggle}
            className={`px-3 py-2 rounded-md border transition-colors 
              ${showRRTrace
                ? "bg-amber-400 border-amber-500 text-amber-900 dark:bg-amber-600 dark:border-amber-500 dark:text-amber-100"
                : "dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-amber-800 bg-gray-200 border-gray-300 text-gray-600 hover:bg-amber-100"
              }`}
            title="Afficher/Masquer le tracé RR"
          >
            RR Intervals Trace
          </button>
        </div>
        <div className="dark:text-gray-300 dark:bg-gray-800 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
          {formatTime(viewWindow[0] / sampling)} - {formatTime(viewWindow[1] / sampling)}
        </div>
      </div>

      {/* Slider avec style personnalisé */}
      <div className="mb-6 flex items-center space-x-4">
        <span className="text-sm dark:text-gray-400 text-gray-500 min-w-fit">{formatTime(sliderMin)}</span>
        <div className="flex-1">
          <style>
            {`
              .custom-slider .rc-slider-track {
                height: 6px !important;
                background-color: #2563eb !important;
              }
              .custom-slider .rc-slider-rail {
                height: 6px !important;
                background-color: #e5e7eb !important;
              }
              .custom-slider .rc-slider-handle {
                height: 16px !important;
                width: 16px !important;
                margin-top: -5px !important;
                border-color: #2563eb !important;
                background-color: #2563eb !important;
              }
            `}
          </style>
          <Slider
            className="custom-slider"
            range
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={sliderVals}
            onChange={handleSliderChange}
            allowCross={false}
          />
        </div>
        <span className="dark:text-gray-400 text-sm text-gray-500 min-w-fit">{formatTime(sliderMax)}</span>
      </div>

      {/* Chart */}
      <div className="dark:border-gray-600 dark:bg-gray-800 h-80 mb-6 border border-gray-200 rounded-lg p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={showRRTrace ? rrTraceData.filter(d => d.time >= viewWindow[0]/sampling && d.time <= viewWindow[1]/sampling) : visibleData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="time"
              type="number"
              domain={[
                viewWindow[0] / sampling,
                viewWindow[1] / sampling,
              ]}
              label={{ value: "Temps (s)", position: "insideBottom", offset: -10 }}
              tickFormatter={(value) => value.toFixed(2)}
              stroke="#666"
            />
            <YAxis
              domain={yDomain}
              label={{ 
                value: showRRTrace ? "RR Interval (ms)" : "Amplitude (mV)", 
                angle: -90, 
                position: "insideLeft" 
              }}
              stroke="#666"
              tickFormatter={(value) => {
                if (showRRTrace) {
                  return value.toFixed(0);
                }
                // Pour les valeurs ECG, utiliser un format approprié
                if (Math.abs(value) < 0.001) {
                  return (value * 1000).toFixed(1) + 'µV';
                } else if (Math.abs(value) < 1) {
                  return value.toFixed(3);
                } else {
                  return value.toFixed(2);
                }
              }}
            />
            <Tooltip
              formatter={tooltipFormatter}
              labelFormatter={labelFormatter}
              cursor={{ stroke: "#8884d8", strokeDasharray: "3 3" }}
              isAnimationActive={false}
              contentStyle={{
                backgroundColor: document.documentElement.classList.contains('dark') ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                border: document.documentElement.classList.contains('dark') ? '1px solid #4b5563' : '1px solid #e5e7eb',
                borderRadius: '6px',
                color: document.documentElement.classList.contains('dark') ? '#f9fafb' : '#000'
              }}
            />
            <Legend
              payload={legendPayload}
              verticalAlign="top"
              height={36}
              iconSize={14}
              onClick={handleLegendClick}
              wrapperStyle={{ cursor: "pointer" }}
            />

            {/* Tracé RR intervals */}
            {showRRTrace && (
              <Line
                type="monotone"
                dataKey="rrDuration"
                name="RR Trace"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f59e0b" }}
                isAnimationActive={false}
              />
            )}

            {/* Série ECG (seulement si pas en mode RR trace) */}
            {!showRRTrace && showECGSignal && (
              <Line
                type="monotone"
                dataKey="value"
                name="ECG Signal"
                stroke="#2563eb"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {/* Reference area for zoom selection */}
            {refAreaLeft && refAreaRight && (
              <ReferenceArea
                x1={Math.min(refAreaLeft, refAreaRight)}
                x2={Math.max(refAreaLeft, refAreaRight)}
                strokeOpacity={0.3}
                fill="#2563eb"
                fillOpacity={0.2}
              />
            )}

            {/* Mark RR-Intervals with circles (seulement si pas en mode RR trace) */}
            {!showRRTrace && showRRIntervals && visibleRRIntervals.map((interval, index) => {
              // Décaler le timestamp vers la gauche (position du R-peak précédent)
              const adjustedTimestamp = interval.timestamp - interval.duration;
              const yPosition = getYPositionForRRInterval(adjustedTimestamp);
              
              return (
                <ReferenceDot
                  key={`rr-${index}-${interval.timestamp}`}
                  x={adjustedTimestamp}
                  y={yPosition}
                  r={5}
                  fill="#22c55e"
                  stroke="#fff"
                  strokeWidth={2}
                  label={{
                    position: "bottom",
                    fill: "#16a34a",
                    fontSize: 10
                  }}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}

            {/* Mark R-Peaks with triangles (seulement si pas en mode RR trace) */}
            {!showRRTrace && showRPeaks && visibleRPeaks.map((peakTime, index) => {
              const peakIndex = Math.round(peakTime * sampling);
              const peakValue = data[peakIndex];
              return (
                <ReferenceDot
                  key={`peak-${index}-${peakTime}`}
                  x={peakTime}
                  y={peakValue}
                  r={8}
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth={2}
                  shape={(props: any) => (
                    <TriangleMarker
                      {...props}
                      onClick={() => handleRPeakClick(peakTime)}
                    />
                  )}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Affichage Beat sélectionné */}
      {selectedBeat !== null && selectedBeatIndex !== null && (
        <motion.div
          className=" dark:bg-gray-800  mt-6 p-4 border border-red-200 dark:border-red-700 rounded-lg bg-red-50"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Beat Sélectionné</h3>
            <button 
              className="dark:text-gray-500 dark:bg-gray-700 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors" 
              onClick={() => {
                setSelectedBeat(null);
                setSelectedBeatIndex(null);
              }}
            >
              ✕ Fermer
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="text-sm text-red-700 dark:text-red-300">
              <div><strong>Position:</strong> {formatTime(selectedBeat / sampling)}</div>
              <div><strong>Amplitude:</strong> {data[selectedBeat]?.toFixed(3)} mV</div>
              <div><strong>Index du beat:</strong> {selectedBeatIndex}</div>
            </div>
            
            <div className="text-sm">
              <div className="p-3 rounded-lg border">
                <div className="font-semibold text-blue-800 dark:text-blue-400 mb-1">Classification:</div>
                <div className={`px-2 py-1 rounded text-center font-medium ${
                  getBeatClassificationLabel(selectedBeatIndex).includes('normal') 
                    ? 'bg-green-100 text-green-800 dark:text-green-400 dark:bg-green-900/30' 
                    : getBeatClassificationLabel(selectedBeatIndex).includes('supraventriculaire')
                    ? 'bg-yellow-100 text-yellow-800 dark:text-yellow-400 dark:bg-yellow-900/30'
                    : getBeatClassificationLabel(selectedBeatIndex).includes('ventriculaire')
                    ? 'bg-red-100 text-red-800 dark:text-red-400 dark:bg-red-900/30'
                    : getBeatClassificationLabel(selectedBeatIndex).includes('fusion')
                    ? 'bg-purple-100 text-purple-800 dark:text-purple-400 dark:bg-purple-900/30'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {getBeatClassificationLabel(selectedBeatIndex)}
                </div>
              </div>
            </div>
          </div>
          <div className="h-40 border border-red-300 dark:border-red-700 rounded bg-white dark:border-red-600 dark:bg-gray-800">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData.slice(
                  Math.max(0, selectedBeat - Math.floor(sampling / 2)),
                  Math.min(data.length, selectedBeat + Math.ceil(sampling / 2))
                )}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#fecaca" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => value.toFixed(3)}
                  stroke="#991b1b"
                />
                <YAxis 
                  domain={["auto", "auto"]} 
                  stroke="#991b1b"
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(3)} mV`, 'Amplitude']}
                  labelFormatter={(label: number) => `Time: ${label.toFixed(3)}s`}
                  contentStyle={{
                    backgroundColor: 'rgba(254, 242, 242, 0.95)',
                    border: '1px solid #f87171',
                    borderRadius: '6px'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <ReferenceDot
                  x={selectedBeat / sampling}
                  y={data[selectedBeat]}
                  r={6}
                  fill="#dc2626"
                  stroke="#fff"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Résumé infos */}
      <div className="mt-6 space-y-3">
        {/* Infos générales */}
        <div className="dark:text-gray-300 dark:bg-gray-800 flex justify-between text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
          <span><strong>Total R-Peaks:</strong> {rPeaks.length}</span>
          <span><strong>Durée:</strong> {fullDuration.toFixed(1)}s</span>
          <span><strong>Fréquence d'échantillonnage:</strong> {sampling} Hz</span>
        </div>
        
        {/* Statistiques du segment visible */}
        <div className="dark:bg-blue-900/20 dark:border-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
          <h4 className="dark:text-blue-300 text-sm font-semibold text-blue-800 mb-2">Statistiques du segment visible</h4>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-sm">
            <div className="dark:bg-green-900/30 bg-green-100 p-2 rounded text-center">
              <div className="font-bold text-green-800 dark:text-green-300">{segmentStats.normal}</div>
              <div className="text-green-600 text-xs dark:text-green-400">Normaux</div>
            </div>
            <div className="dark:bg-red-900/30 bg-red-100 p-2 rounded text-center">
              <div className="dark:text-red-300 font-bold text-red-800">{segmentStats.ventricular}</div>
              <div className="dark:text-red-400 text-red-600 text-xs">Ventriculaires</div>
            </div>
            <div className=" dark:bg-yellow-900/30 bg-yellow-100 p-2 rounded text-center">
              <div className="dark:text-yellow-300 font-bold text-yellow-800">{segmentStats.supraventricular}</div>
              <div className="dark:text-yellow-400 text-yellow-600 text-xs">Supravent.</div>
            </div>
            <div className="dark:bg-purple-900/30 bg-purple-100 p-2 rounded text-center">
              <div className="dark:text-purple-300 font-bold text-purple-800">{segmentStats.fusion}</div>
              <div className="dark:text-purple-400 text-purple-600 text-xs">Fusion</div>
            </div>
            <div className="dark:bg-gray-900/30 bg-gray-100 p-2 rounded text-center">
              <div className="dark:text-gray-300 font-bold text-gray-800">{segmentStats.unknown}</div>
              <div className="dark:text-gray-400 text-gray-600 text-xs">Inconnus</div>
            </div>
            <div className="dark:bg-indigo-900/30 bg-indigo-100 p-2 rounded text-center">
              <div className="dark:text-indigo-300 font-bold text-indigo-800">{segmentStats.bpm}</div>
              <div className="dark:text-indigo-400 text-indigo-600 text-xs">BPM</div>
            </div>
            <div className="dark:bg-teal-900/30 bg-teal-100 p-2 rounded text-center">
              <div className="dark:text-teal-300 font-bold text-teal-800">{sdnn ? sdnn.toFixed(1) : 'N/A'}</div>
              <div className="dark:text-teal-400 text-teal-600 text-xs">SDNN (ms)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ECGChart;