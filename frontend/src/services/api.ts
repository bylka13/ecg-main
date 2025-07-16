import axios from "axios";

const API_BASE = "http://localhost:8000/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Interface décrivant un objet ECGRecord renvoyé par FastAPI
**/
export interface ECGRecordOut {
  id: number;
  patient_id: number;
  fichier_csv: string;
  lieu: string;
  frequence_hz: number;
  date_prise: string | null; 
}
/**
 * Interface décrivant l’objet Patient renvoyé par GET /patients et /patients/{id}
**/
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

/**
 * GET patients 
**/
export async function listPatients(
    skip = 0,
    limit = 1000
): Promise<PatientOut[]> {
    const response = await api.get<PatientOut[]>('/patients',{
        params: {skip, limit},
    });
    return response.data
}

/**
 * GET /patients/{patient_id}
**/
export async function getPatient(patient_id : number):Promise<PatientOut>{
    const response  = await api.get<PatientOut>(`/patients/${patient_id}`);
    return response.data;
}

/**
 * Typage du segment renvoyé par GET /{patient_id}/{ecg_id}/segment?t0=…&t1=…
**/
export interface HRVDomainMetrics {
  [key: string]: number | null;
}
export interface SegmentResponse {
  patient_id: number;
  ecg_id: number;
  sampling_rate: number;
  t0: number;
  t1: number;
  ecg_data: [number, number][];       
  r_peaks: [number, number][];         
  rr_intervals: [number, number][];    
  metrics: {
    time_domain: HRVDomainMetrics;
    frequency_domain: HRVDomainMetrics;
    non_linear_domain: HRVDomainMetrics;
  };
  segment_length: number;
}

/**
 * GET /{patient_id}/{ecg_id}/segment
**/
export async function getECGSegment(
    patient_id : number,
    ecg_id : number,
    t0 : number,
    t1 : number,
): Promise<SegmentResponse> {
    const response = await api.get(`${patient_id}/${ecg_id}/segment`,
        {
            params : { t0, t1},
        }
    );
    return response.data
}

/**
 * GET /{patient_id}/{ecg_id}
**/
export async function getData(
    patient_id : number,
    ecg_id : number,
): Promise<SegmentResponse> {
    const response = await api.get(`${patient_id}/${ecg_id}`);
    return response.data
}

/**
 * Typage du segment renvoyé par GET /{patient_id}/{ecg_id}/beat
**/
export interface BeatResponse{
    patient_id : number,
    ecg_id : number,
    beat_index : number,
    pre : number,
    post : number,
    r_time : number,
    beat : [number, number][]
}

/**
 * GET /{patient_id}/{ecg_id}/beat
**/
export async function getBeat(
    patient_id : number,
    ecg_id :number,
    beat_index : number
): Promise<BeatResponse> {
    const response = await api.get(`/${patient_id}/${ecg_id}/beat`, 
        {
            params: { beat_index },
        }
    )
    return response.data;
}

/**
 * GET /{ecg_id}/fs
**/
export async function getFS( patient_id : number, ecg_id : number){
    const response = await api.get(`/${patient_id}/${ecg_id}/fs`);
    return response.data;
}

/**
 * DELETE /{patient_id}/{ecg_id}/
**/
export function deleteECG( patient_id : number, ecg_id : number){
  return api.delete(`/${patient_id}/${ecg_id}`);
}

/**
 * DELETE /{patient_id}/
**/
export function deletePatient( patient_id : number){
  return api.delete(`/${patient_id}`);
}

/**
 * Typage du segment renvoyé par POST /beat-classification/{patient_id}/{ecg_id}/
**/
export interface BeatClassification{
  patient_id : number,
  ecg_id : number,
  nb_beats : number,
  beatsPrediction : Array<[string, string]>,
}

/**
 * POST /beat-classification/{patient_id}/{ecg_id}
**/
export async function getBeatClassification(
  patient_id : number,
  ecg_id :number, 
): Promise<BeatClassification> {
  const response = await api.post(`/beat-classification/${patient_id}/${ecg_id}`, {});
  return response.data;
}

/***
 *  sert à exporter les données qu'on rentre dans la page ImportPage.tsx vers la base de données ou tout sera stocké
***/

import type { Patient, ECG } from '../types/index'; 

export interface EcgUploadResponse {
  status: 'ok';
  patient_id: number;
  ecg_id: number;
  csv_path: string;
}

export const isoToFr = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};

export async function uploadEcg(
  patient: Patient,
  files: File[],
  ecg: Pick<ECG, 'date' | 'location' | 'samplingRate'>,
  convertDatesToFr = false,
): Promise<EcgUploadResponse[]> {
  const results: EcgUploadResponse[] = [];

  const dd = (d: string) => convertDatesToFr && /^\d{4}-\d{2}-\d{2}$/.test(d) ? isoToFr(d) : d;

  for (const file of files){
    const fd = new FormData();
      
      // Patient fields ------------------------------------------------------
    fd.append('firstName',      patient.firstName);
    fd.append('lastName',       patient.lastName);
    fd.append('dateOfBirth',    dd(patient.dateOfBirth));
    fd.append('age',            String(patient.age));
    fd.append('weight',         String(patient.weight));
    fd.append('height',         String(patient.height));
    fd.append('address',        patient.address);
    fd.append('medicalHistory', patient.medicalHistory);
    fd.append('medication',     String(patient.medication));
    fd.append('allergies',      patient.allergies);

    // ECG meta ------------------------------------------------------------
    fd.append('date',           dd(ecg.date));
    fd.append('location',       ecg.location);
    fd.append('samplingRate',   String(ecg.samplingRate));

    // CSV file ------------------------------------------------------------
    fd.append('file', file, file.name);
    
    const res = await fetch(`${API_BASE}/import_ecg`, { method: 'POST', body: fd });

    if (!res.ok) {
      const detail = (await res.json().catch(() => null))?.detail || res.statusText;
      throw new Error(`Erreur ${res.status} : ${detail}`);
    }

    results.push(await res.json());
  }
  
  
  return results;
}


export const writeCache = (key: string, data: unknown) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error('Cache write error', err);
  }
};

export const readCache = <T>(key: string): T | null => {
  const item = sessionStorage.getItem(key);
  if (!item) return null;
  try {
    return JSON.parse(item) as T;
  } catch (err) {
    console.error('Cache read error', err);
    return null;
  }
};


export async function generateLLMAnalysis(
  patientId: number,
  ecgId: number,
  metrics: any,
): Promise<string> {
  const response = await api.post<{ analysis: string }>(
    `/${patientId}/${ecgId}/llm_analysis`,
    { metrics },
  );
  return response.data.analysis;
}