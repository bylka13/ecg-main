from __future__ import annotations
import neurokit2 as nk
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Form, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware   
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, File
import shutil
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload, Session as DBSession
from ecg_database import Session, Patient, ECGRecord
from utils import parse_date_flex, sanitize
from schemas import PatientOut   
from tensorflow import keras
from keras import models
from scipy.signal import resample
from sklearn.preprocessing import MinMaxScaler
import json
import os
import requests

# -----------------------------------------------------------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[                 
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],            
    allow_headers=["*"],
)

UPLOAD_DIR = Path("data_csv")
UPLOAD_DIR.mkdir(exist_ok=True)
SEGMENT_DURATION = 3 * 60 
MODEL = models.load_model("best_model.h5")

def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()

# LLM Mistral 7B -------------------------------------------------------------
LLM_MODEL_NAME = os.environ.get(
    "LLM_MODEL_NAME",
    "mistral-small-latest",
)
# Clé API pour accéder au service Mistral
MISTRAL_API_KEY = "8fWxVunBiXCPoFgWoe4le18KS8QsF7Qd"  # Ta vraie clé
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MODEL_NAME = "mistral-small-latest"

def generate_llm_report(metrics: dict) -> str:
    prompt = (
        "Vous êtes un professionnel de santé spécialisé en électrocardiographie.\n"
        "Rédigez un compte rendu médical clair, concis et structuré en français à partir des métriques ECG suivantes :\n\n"
        f"{json.dumps(metrics, ensure_ascii=False, indent=2)}\n\n"
        "N'incluez pas toutes les métriques ligne par ligne, mais synthétisez les informations utiles.\n"
        "Utilisez un ton professionnel et médical.\n"
        "Commencez par une phrase d'introduction générale, puis détaillez les éléments remarquables si nécessaire.\n"
        "Terminez si besoin par une recommandation ou une conclusion clinique.\n\n"
        "IMPORTANT : Ne pas inclure de date, de nom de médecin, de service ou de signature à la fin du rapport.\n"
        "Le rapport doit se terminer par la conclusion clinique uniquement.\n\n"
        "Compte rendu :"
    )
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 6000,
    }
    response = requests.post(MISTRAL_API_URL, headers=headers, json=payload)
    response.raise_for_status()
    
    # Récupérer le contenu de la réponse
    content = response.json()["choices"][0]["message"]["content"].strip()
    
    # Post-traitement pour s'assurer qu'il n'y a pas de signature/date
    # Supprimer les lignes contenant des patterns de signature
    lines = content.split('\n')
    filtered_lines = []
    
    for line in lines:
        line_lower = line.lower().strip()
        # Ignorer les lignes avec des patterns de signature
        if not any(pattern in line_lower for pattern in [
            'médecin', 'docteur', 'dr.', 'service', 'date', 
            'signature', 'signé', '[nom', 'praticien'
        ]):
            filtered_lines.append(line)
    
    # Rejoindre les lignes et nettoyer les espaces en fin
    cleaned_content = '\n'.join(filtered_lines).strip()
    
    return cleaned_content


def get_analysis_cache_path(csv_file_path: Path) -> Path:
    """Retourne le chemin vers le fichier d'analyse basé sur le nom du fichier CSV"""
    # Extraire le nom du fichier sans extension
    base_name = csv_file_path.stem  # Pour 101.csv -> 101
    # Créer le nom du fichier d'analyse
    analysis_filename = f"{base_name}_analyse.json"
    # Retourner le chemin complet dans le même dossier
    return csv_file_path.parent / analysis_filename

def save_analysis_to_db(db: DBSession, ecg_record: ECGRecord, analysis_data: dict):
    """Sauvegarde l'analyse dans la base de données"""
    try:
        # Créer le chemin d'analyse basé sur le fichier CSV
        csv_path = Path(ecg_record.fichier_csv)
        analysis_path = get_analysis_cache_path(csv_path)
        
        # Sauvegarder le fichier JSON
        with open(analysis_path, 'w', encoding='utf-8') as f:
            json.dump(analysis_data, f, ensure_ascii=False, indent=2)
        
        # Mettre à jour le chemin dans la base
        ecg_record.analyse_fichier_csv = str(analysis_path)
        db.commit()
        
    except Exception as e:
        print(f"Erreur lors de la sauvegarde de l'analyse : {e}")

def load_analysis_from_db(ecg_record: ECGRecord) -> Optional[dict]:
    """Charge l'analyse depuis le fichier référencé dans la base"""
    if not ecg_record.analyse_fichier_csv:
        return None
    
    analysis_path = Path(ecg_record.analyse_fichier_csv)
    if not analysis_path.exists():
        return None
    
    try:
        with open(analysis_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

@app.post('/api/import_ecg')
async def import_data(
    firstName: str = Form(...),
    lastName: str = Form(...),
    dateOfBirth: str = Form(...),
    age: int = Form(...),
    weight: float = Form(...),
    height: float = Form(...),
    address: str = Form(""),
    medicalHistory: str = Form(""),
    medication: bool = Form(False),
    allergies: str = Form(""),
    date: Optional[str] = Form(None),
    location: str = Form(...),
    samplingRate: int = Form(...),
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db)
):
    folder = f'{firstName}_{lastName}_{dateOfBirth}'
    target = UPLOAD_DIR / folder
    target.mkdir(exist_ok=True)

    safe_filename = file.filename.replace(" ", "_")
    dest_path = target / safe_filename

    try:
        with dest_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(500, f"Erreur sauvegarde fichier : {exc}")
    finally:
        await file.close()

    try:
        # Parse dates
        try:
            dob_parsed = parse_date_flex(dateOfBirth)
        except ValueError as e:
            raise HTTPException(422, str(e))

        date_ecg_parsed = None
        if date:
            try:
                date_ecg_parsed = parse_date_flex(date)
            except ValueError as e:
                raise HTTPException(422, str(e))

        # Rechercher patient existant
        patient = db.query(Patient).filter_by(
            nom=lastName.strip(),
            prenom=firstName.strip(),
            date_naissance=dob_parsed
        ).first()

        if not patient:
            # Créer patient s'il n'existe pas
            patient = Patient(
                nom=lastName.strip(),
                prenom=firstName.strip(),
                date_naissance=dob_parsed,
                age=age,
                poids=weight,
                taille=height,
                adresse=address.strip(),
                antecedant=medicalHistory.strip(),
                prise_medoc=medication,
                allergies=allergies.strip(),
            )
            db.add(patient)
            db.flush()  # génère patient.id

        # Ajouter un ECG pour ce patient
        ecg = ECGRecord(
            patient_id=patient.id,
            fichier_csv=str(dest_path),
            analyse_fichier_csv=None,  # Sera rempli lors de la première analyse
            lieu=location.strip(),
            frequence_hz=samplingRate,
            date_prise=date_ecg_parsed,
        )
        db.add(ecg)
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        dest_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Erreur base de données : {exc}")

    return JSONResponse({
        "status": "ok",
        "patient_id": patient.id,
        "ecg_id": ecg.id,
        "csv_path": str(dest_path)
    })

@app.get("/api/patients", response_model=list[PatientOut])
def list_patients(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: DBSession = Depends(get_db),
):
    patients = (
        db.query(Patient)
        .options(selectinload(Patient.ecg_records))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return patients

@app.get("/api/patients/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, db: DBSession = Depends(get_db)):
    patient = (
        db.query(Patient)
        .options(selectinload(Patient.ecg_records))
        .get(patient_id)
    )
    if patient is None:
        raise HTTPException(404, f"Patient {patient_id} introuvable")
    return patient

# ------------------------------------------------------------------
#  ECG pour un patient / ECG donné -----------------------
# ------------------------------------------------------------------
@app.get("/api/{patient_id}/{ecg_id}")
async def get_data(
    patient_id: int,
    ecg_id: int,
    db: DBSession = Depends(get_db)
):
    # 1) BD : vérifier appartenance patient / ECG --------------------
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(
            404, f"ECG {ecg_id} appartenant au patient {patient_id} introuvable"
        )

    t0 = 0
    t1 = t0 + SEGMENT_DURATION
    return await get_segment(patient_id, ecg_id, t0=t0, t1=t1, db=db)

# ------------------------------------------------------------------
#  SEGMENT d'ECG pour un patient / ECG donné -----------------------
# ------------------------------------------------------------------
@app.get(
    "/api/{patient_id}/{ecg_id}/segment",
    summary="Renvoie le segment [t0-t1] et HRV associée"
)
async def get_segment(
    patient_id: int,
    ecg_id: int,
    t0: float = Query(..., ge=0, description="Début du segment (s)"),
    t1: float = Query(..., gt=0, description="Fin du segment (s)"),
    db: DBSession = Depends(get_db),
):
    if t1 <= t0:
        raise HTTPException(422, "t1 doit être strictement supérieur à t0")

    # Vérifier que l'ECG appartient bien au patient
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")

    FS = record.frequence_hz
    path = Path(record.fichier_csv)
    if not path.exists():
        raise HTTPException(404, "Fichier CSV introuvable sur le disque")

    # Lecture CSV et extraction du signal MLII
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        raise HTTPException(500, f"Erreur lecture CSV : {exc}")
    if "MLII" not in df.columns:
        raise HTTPException(400, "La dérivation 'MLII' n'existe pas dans ce fichier")

    values = df["MLII"]
    times = df.index.to_series() / FS
    ecg_values = values.values

    # Nettoyage + R-peaks
    clean = nk.ecg_clean(values, sampling_rate=FS)
    _, info = nk.ecg_peaks(clean, sampling_rate=FS, method="neurokit")
    r_idx = np.asarray(info["ECG_R_Peaks"], dtype=int)
    r_times = r_idx / FS
    r_ampl = ecg_values[r_idx]

    # Segment du signal 
    mask_sig = (times >= t0) & (times <= t1)
    ecg_data = [[float(t), float(v)] for t, v in zip(times[mask_sig], values[mask_sig])]
     
    # Filtre des R-peaks & RR dans la fenêtre
    mask_r = (r_times >= t0) & (r_times <= t1)
    r_seg = r_idx[mask_r]
    r_times_seg = r_times[mask_r]
    r_ampl_seg = r_ampl[mask_r]

    if len(r_seg) < 3:
        raise HTTPException(400, "Pas assez de R-peaks pour le calcul HRV")

    r_peaks = np.column_stack((r_times_seg, r_ampl_seg)).tolist()

    rr_int = np.diff(r_times_seg)
    rr_ts = r_times_seg[1:]
    rr_seg = [
        [float(t), float(i)] for t, i in zip(rr_ts, rr_int)
    ]

    # HRV sur le segment
    hrv_time = nk.hrv_time(r_seg, sampling_rate=FS, show=False)
    hrv_freq = nk.hrv_frequency(r_seg, sampling_rate=FS, show=False, normalize=False)
    hrv_nl = nk.hrv_nonlinear(r_seg, sampling_rate=FS, show=False)

    metrics = {
        "time_domain": {c: float(hrv_time[c].iloc[0]) for c in hrv_time.columns},
        "frequency_domain": {c: float(hrv_freq[c].iloc[0]) for c in hrv_freq.columns},
        "non_linear_domain": {c: float(hrv_nl[c].iloc[0]) for c in hrv_nl.columns},
    }

    result = {
        "patient_id": patient_id,
        "ecg_id": ecg_id,
        "sampling_rate": FS,
        "t0": t0,
        "t1": t1,
        "ecg_data": ecg_data,
        "r_peaks": r_peaks,
        "rr_intervals": rr_seg,
        "metrics": metrics,
        "segment_length": t1 - t0,
    }
    return JSONResponse(content=jsonable_encoder(sanitize(result)))

# ------------------------------------------------------------------
#  EXTRACTION d'un battement spécifique ----------------------------
# ------------------------------------------------------------------
@app.get(
    "/api/{patient_id}/{ecg_id}/beat",
    summary="Extrait un battement autour du R-peak choisi"
)
async def get_beat(
    patient_id: int,
    ecg_id: int,
    beat_index: int = Query(..., ge=0, description="Index du R-peak voulu"),
    pre: float = Query(0.2, gt=0, description="Fenêtre avant le pic (s)"),
    post: float = Query(0.4, gt=0, description="Fenêtre après le pic (s)"),
    db: DBSession = Depends(get_db),
):
    # Vérifier appartenance ECG ↔ patient
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")

    FS = record.frequence_hz
    path = Path(record.fichier_csv)
    if not path.exists():
        raise HTTPException(404, "Fichier CSV introuvable sur le disque")

    # Lecture signal
    df = pd.read_csv(path)
    if "MLII" not in df.columns:
        raise HTTPException(400, "La dérivation 'MLII' n'existe pas dans ce fichier")

    values = df["MLII"]
    clean = nk.ecg_clean(values, sampling_rate=FS)

    # Détection R-peaks
    _, info = nk.ecg_peaks(clean, sampling_rate=FS, method="neurokit")
    r_idx = np.asarray(info["ECG_R_Peaks"], dtype=int)

    if beat_index >= len(r_idx):
        raise HTTPException(422, "beat_index trop élevé pour cet enregistrement")

    # Création de l'epoch autour du R-peak demandé
    epochs = nk.epochs_create(
        clean, events=r_idx, sampling_rate=FS,
        epochs_start=-pre, epochs_end=post,
        baseline_correction=False
    )

    key = list(epochs.keys())[beat_index]
    epoch_df = epochs[key]

    beat = np.column_stack((
        epoch_df.index.values,       # temps relatifs (s)
        epoch_df["Signal"].values    # amplitude
    )).tolist()

    result = {
        "patient_id": patient_id,
        "ecg_id": ecg_id,
        "beat_index": beat_index,
        "pre": pre,
        "post": post,
        "r_time": float(r_idx[beat_index] / FS),
        "beat": beat,
    }
    return JSONResponse(content=jsonable_encoder(sanitize(result)))

@app.get("/api/{patient_id}/{ecg_id}/fs", response_model=int)
def get_fs(patient_id: int, ecg_id: int, db: DBSession = Depends(get_db)) -> int:
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")

    return record.frequence_hz

@app.delete("/api/{patient_id}/{ecg_id}")
def delete_ecg(
    patient_id: int,
    ecg_id: int,
    db: DBSession = Depends(get_db)
):    
    # Vérifier appartenance ECG ↔ patient
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")
    
    # Supprimer le fichier CSV
    csv_path = Path(record.fichier_csv)
    try:
        if csv_path.exists():
            csv_path.unlink()
    except Exception as exc:
        pass  # Log l'erreur si nécessaire

    # Supprimer le fichier d'analyse s'il existe
    if record.analyse_fichier_csv:
        analysis_path = Path(record.analyse_fichier_csv)
        try:
            if analysis_path.exists():
                analysis_path.unlink()
        except Exception as exc:
            pass  # Log l'erreur si nécessaire

    # Supprime l'ECG de la base
    try:
        db.delete(record)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(500, f"Erreur base de données : {exc}")

    return JSONResponse({"status": "ok", "message": "ECG supprimé avec succès"})

@app.delete("/api/{patient_id}")
def delete_patient(
    patient_id: int,
    db: DBSession = Depends(get_db)
):    
    # Vérifier que le patient existe
    patient = db.query(Patient).filter(Patient.id == patient_id).first()

    if patient is None:
        raise HTTPException(404, f"Patient {patient_id} introuvable")
    
    # Supprimer tous les fichiers ECG et d'analyse associés
    for ecg in patient.ecg_records:
        # Supprimer le fichier CSV
        csv_path = Path(ecg.fichier_csv)
        try:
            if csv_path.exists():
                csv_path.unlink()
        except Exception:
            pass  # Log l'erreur si nécessaire

        # Supprimer le fichier d'analyse
        if ecg.analyse_fichier_csv:
            analysis_path = Path(ecg.analyse_fichier_csv)
            try:
                if analysis_path.exists():
                    analysis_path.unlink()
            except Exception:
                pass  # Log l'erreur si nécessaire

    # Supprimer le dossier patient
    try:
        folder = f"{patient.prenom}_{patient.nom}_{patient.date_naissance}"
        patient_dir = UPLOAD_DIR / folder
        if patient_dir.exists() and patient_dir.is_dir():
            shutil.rmtree(patient_dir)
    except Exception:
        pass  # Log l'erreur si nécessaire

    # Supprime le patient (et grâce au ondelete=cascade, tous ses ECG aussi en base)
    try:
        db.delete(patient)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(500, f"Erreur base de données : {exc}")

    return JSONResponse({"status": "ok", "message": "Patient supprimé avec succès"})

@app.post("/api/beat-classification/{patient_id}/{ecg_id}")
async def classify_beat(
    patient_id: int,
    ecg_id: int,
    force_refresh: bool = Query(False, description="Force la régénération de l'analyse"),
    db: DBSession = Depends(get_db)
):
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")
    
    # Vérifier si l'analyse existe déjà et si on ne force pas le refresh
    if not force_refresh:
        cached_result = load_analysis_from_db(record)
        if cached_result:
            return cached_result
    
    # Effectuer l'analyse
    FS = record.frequence_hz
    path = Path(record.fichier_csv)
    
    if not path.exists():
        raise HTTPException(404, "Fichier CSV introuvable sur le disque")
    
    df = pd.read_csv(path)
    if "MLII" not in df.columns:
        raise HTTPException(400, "La dérivation 'MLII' n'existe pas dans ce fichier")
    
    values = df["MLII"]
    ecg_data = values.values
    
    # Normalisation des données
    scaler = MinMaxScaler()
    ecg_data_normalized = scaler.fit_transform(ecg_data.reshape(-1, 1)).flatten()
    
    # Traitement ECG avec NeuroKit
    signals, info = nk.ecg_process(ecg_data_normalized, sampling_rate=FS, method="neurokit")
    cleaned_ecg = signals["ECG_Clean"]
    epochs = nk.ecg_segment(cleaned_ecg, rpeaks=None, sampling_rate=FS, show=False)
    
    # Préparation des données pour le modèle
    X_test = pd.concat([pd.Series(resample(epochs[i]['Signal'], 186)) for i in epochs.keys()], axis=1).T
    X_test = np.expand_dims(X_test, axis=2)
    
    # Prédiction
    predY = MODEL.predict(X_test)
    y_pred = np.argmax(predY, axis=1)
    
    # Classification des battements
    Label = {}
    for j, i in enumerate(epochs.keys()):
        classify_beat = int(y_pred[j])
        cases = {
            0: "Battement normal",
            1: "Battement ectopique supraventriculaire",
            2: "Battement ectopique ventriculaire",
            3: "Battement de fusion",
            4: "Battement inconnu",
        }
        Label[i] = cases.get(classify_beat, "Inconnu")
    
    # Préparer le résultat
    result = {
        "patient_id": patient_id,
        "ecg_id": ecg_id,
        "nombre_de_battements": len(epochs),
        "beatsPrediction": [[str(i), Label[i]] for i in Label],
        "analysis_timestamp": pd.Timestamp.now().isoformat()
    }
    
    # Sauvegarder l'analyse
    save_analysis_to_db(db, record, result)
    
    return result

@app.get("/api/{patient_id}/{ecg_id}/analysis")
async def get_analysis(
    patient_id: int,
    ecg_id: int,
    db: DBSession = Depends(get_db)
):
    """Récupère l'analyse existante d'un ECG"""
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")
    
    # Charger l'analyse depuis la base
    analysis = load_analysis_from_db(record)
    if analysis is None:
        raise HTTPException(404, "Aucune analyse trouvée pour cet ECG")
    
    return analysis

@app.get("/api/{patient_id}/{ecg_id}/analysis/status")
async def get_analysis_status(
    patient_id: int,
    ecg_id: int,
    db: DBSession = Depends(get_db)
):
    """Vérifie si une analyse existe pour un ECG donné"""
    record = (
        db.query(ECGRecord)
        .filter(ECGRecord.id == ecg_id, ECGRecord.patient_id == patient_id)
        .first()
    )
    if record is None:
        raise HTTPException(404, f"ECG {ecg_id} introuvable pour le patient {patient_id}")
    
    has_analysis = record.analyse_fichier_csv is not None
    analysis_path_exists = False
    
    if has_analysis:
        analysis_path = Path(record.analyse_fichier_csv)
        analysis_path_exists = analysis_path.exists()
    
    return {
        "patient_id": patient_id,
        "ecg_id": ecg_id,
        "has_analysis": has_analysis,
        "analysis_file_exists": analysis_path_exists,
        "analysis_path": record.analyse_fichier_csv
    }

# ------------------------------------------------------------------
#  Analyse LLM -----------------------------------------------------
# ------------------------------------------------------------------
import re
def nettoyer_rapport_hrv(texte: str) -> str:
    # Enlever les étoiles (Markdown)
    texte = re.sub(r'\*+', '', texte)

    # Supprimer les espaces multiples
    texte = re.sub(r'\s{2,}', ' ', texte)

    # Enlever les lignes vides inutiles
    lignes = [ligne.strip() for ligne in texte.split('\n') if ligne.strip()]
    return '\n'.join(lignes)


@app.post("/api/{patient_id}/{ecg_id}/llm_analysis")
async def llm_analysis(patient_id: int, ecg_id: int, payload: dict):
    """Génère un compte rendu grâce au modèle Mistral 7B"""
    metrics = payload.get("metrics")
    if not MISTRAL_API_KEY:
        raise HTTPException(503, "MISTRAL_API_KEY non configurée")
    if metrics is None:
        raise HTTPException(422, "Champ 'metrics' manquant")

    try:
        text = generate_llm_report(metrics)
    except Exception as exc:
        raise HTTPException(500, f"Erreur génération LLM : {exc}")

    return {"analysis": nettoyer_rapport_hrv(text)}

# -----------------------------------------------------------------------------
app.mount("/", StaticFiles(directory=".", html=True), name="static")