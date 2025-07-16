import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ImportPage from './pages/ImportPage';
import VisualizationPage from './pages/VisualizationPage';
import ECGListPage from './pages/ECGListPage';
import ReportPage from './pages/ReportPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<ImportPage />} />
        <Route path="add-ecg/:patientId" element={<ImportPage/>} />
        <Route path="ecg-list" element={<ECGListPage />} />
        <Route path="visualization" element={<Navigate to="/ecg-list\" replace />} />
        <Route path="visualization/:patientId/:ecgId" element={<VisualizationPage />} />
        <Route path="report/:patientId/:ecgId" element={<ReportPage />} />
      </Route>
    </Routes>
  );
}

export default App;