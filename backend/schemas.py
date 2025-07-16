from __future__ import annotations
from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class ECGRecordOut(BaseModel):
    id: int
    fichier_csv: str
    lieu: Optional[str] = None
    frequence_hz: int
    date_prise: Optional[date] = None

    class Config:
        orm_mode = True


class PatientOut(BaseModel):
    id: int
    nom: str
    prenom: str
    date_naissance: Optional[date] = None
    age: Optional[int] = None
    poids: Optional[float] = None
    taille: Optional[float] = None
    adresse: Optional[str] = None
    antecedant: Optional[str] = None
    prise_medoc: Optional[bool] = None
    allergies: Optional[str] = None
    ecg_records: List[ECGRecordOut] = []

    class Config:
        orm_mode = True
