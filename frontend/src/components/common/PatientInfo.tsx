import React from 'react';
import { PatientOut } from '../../types';
import { User, Calendar, Weight, Ruler, MapPin, FileText, Pill, AlertCircle } from 'lucide-react';

interface PatientInfoProps {
  patient: PatientOut;
  className?: string;
}

const PatientInfo: React.FC<PatientInfoProps> = ({ patient, className = '' }) => {
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="text-lg font-medium mb-3">Informations du Patient</h3>
      <div className="space-y-3">
        <div className="flex items-center">
          <User size={18} className="text-gray-400 mr-2" />
          <span className="text-sm text-gray-700 font-medium mr-1">Nom&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.prenom} {patient.nom}</strong></span>
        </div>
        
        <div className="flex items-center">
          <Calendar size={18} className="text-gray-400 mr-2" />
          <span className="text-sm text-gray-700 font-medium mr-1">Date de Naissance(Age)&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.date_naissance} ({patient.age} ans)</strong></span>
        </div>
        
        <div className="flex items-center">
          <Weight size={18} className="text-gray-400 mr-2" />
          <span className="text-sm text-gray-700 font-medium mr-1">Poids&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.poids} kg</strong></span>
        </div>
        
        <div className="flex items-center">
          <Ruler size={18} className="text-gray-400 mr-2" />
          <span className="text-sm text-gray-700 font-medium mr-1">Taille&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.taille} cm</strong></span>
        </div>
        
        <div className="flex items-start">
          <MapPin size={18} className="text-gray-400 mr-2 mt-0.5" />
          <span className="text-sm text-gray-700 font-medium mr-1">Adresse&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.adresse}</strong></span>
        </div>
        
        <div className="flex items-start">
          <FileText size={18} className="text-gray-400 mr-2 mt-0.5" />
          <span className="text-sm text-gray-700 font-medium mr-1">Antécédents médicaux&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.antecedant}</strong></span>
        </div>
        
        <div className="flex items-center">
          <Pill size={18} className="text-gray-400 mr-2" />
          <span className="text-sm text-gray-700 font-medium mr-1">Prise de médicaments&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.prise_medoc ? 'Oui' : 'Non'}</strong></span>
        </div>
        
        <div className="flex items-start">
          <AlertCircle size={18} className="text-gray-400 mr-2 mt-0.5" />
          <span className="text-sm text-gray-700 font-medium mr-1">Allergies&#160;:</span>
          <span className="text-sm text-gray-900"><strong>{patient.allergies || 'Aucune'}</strong></span>
        </div>
      </div>
    </div>
  );
};

export default PatientInfo;