"""ecg_database.py

This script defines a lightweight SQLite database for storing patient information and their
associated ECG recordings using SQLAlchemy⁠—an elegant Python ORM that works out‑of‑the‑box
with SQLite (no external server required).  

Schema
------
patients
    id                  INTEGER  primary‑key, auto‑incremented
    nom                 TEXT      NOT NULL
    prenom              TEXT      NOT NULL
    date_naissance      DATE
    age                 INTEGER   (years)
    poids               FLOAT     (kg)
    taille              FLOAT     (cm)
    adresse             TEXT
    antecedant          TEXT      (antécédents médicaux)
    prise_medoc         BOOLEAN   (True/False)
    allergies           TEXT

ecg_records
    id                  INTEGER  primary‑key, auto‑incremented
    patient_id          INTEGER  foreign‑key → patients(id) ON DELETE CASCADE
    fichier_csv         TEXT     (chemin vers le fichier .csv ou nom dans un répertoire dédié)
    analyse_fichier_csv TEXT     
    lieu                TEXT     (lieu où l’ECG a été réalisé)
    frequence_hz        INTEGER  (fréquence d’échantillonnage, en Hz)
    date_prise          DATETIME (optionnel – date de l’examen)

Usage rapide
------------
1.  Exécutez ce fichier une première fois pour créer « ecg_data.db ».
2.  Importez `Session` puis :
        with Session() as session:
            nouveau_patient = Patient(nom="Dupont", prenom="Anne", ...)
            session.add(nouveau_patient)
            session.commit()

3.  Pour attacher un ECG :
        record = ECGRecord(patient=nouveau_patient,
                          fichier_csv="/chemin/ecg1.csv",
                          lieu="Hôpital Bichat",
                          frequence_hz=500)
        session.add(record)
        session.commit()

Feel free to adapt/extend: e.g. store the CSV as BLOB, add validation, etc.
"""

from datetime import datetime, date
from pathlib import Path

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
DATABASE_URL = "sqlite:///ecg_data.db"  # change to 'postgresql://user:pass@/dbname' if needed
ECHO_SQL = False                        # True → affiche les requêtes SQL dans la console

engine = create_engine(DATABASE_URL, echo=ECHO_SQL, future=True)
Session = sessionmaker(bind=engine, autoflush=False, future=True)
Base = declarative_base()

# -----------------------------------------------------------------------------
# Modèles
# -----------------------------------------------------------------------------
class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nom = Column(String, nullable=False)
    prenom = Column(String, nullable=False)
    date_naissance = Column(Date)
    age = Column(Integer)  # Conservé fixe pour l’instant; peut être calculé dynamiquement si voulu
    poids = Column(Float)
    taille = Column(Float)  # en centimètres
    adresse = Column(String)
    antecedant = Column(String)
    prise_medoc = Column(Boolean)
    allergies = Column(String)

    # Relation ORM vers les ECG de ce patient
    ecg_records = relationship(
        "ECGRecord",
        back_populates="patient",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return (
            f"<Patient(id={self.id}, nom='{self.nom}', prenom='{self.prenom}', "
            f"date_naissance={self.date_naissance})>"
        )


class ECGRecord(Base):
    __tablename__ = "ecg_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)

    fichier_csv = Column(String, nullable=False)
    analyse_fichier_csv = Column(String)
    lieu = Column(String)
    frequence_hz = Column(Integer)  # Fréquence d’échantillonnage (Hz)
    date_prise = Column(Date, default=datetime.utcnow)

    # Relation vers Patient
    patient = relationship("Patient", back_populates="ecg_records")

    def __repr__(self):
        return (
            f"<ECGRecord(id={self.id}, patient_id={self.patient_id}, "
            f"fichier='{Path(self.fichier_csv).name}', frequence={self.frequence_hz} Hz)>"
        )


# -----------------------------------------------------------------------------
# Initialisation de la base
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    print("→ Création des tables (si elles n’existent pas déjà)…")
    Base.metadata.create_all(engine)
    print("Base de données prête : ecg_data.db")
