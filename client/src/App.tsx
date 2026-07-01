import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AssetDetailPage } from './pages/AssetDetailPage';
import { DashboardPage } from './pages/DashboardPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/assets/:ticker" element={<AssetDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
