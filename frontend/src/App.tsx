import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import Layout from '@/components/layout/Layout';
import Dashboard from '@/pages/Dashboard';
import DashboardNeonPulse from '@/pages/DashboardNeonPulse';
import DashboardZen from '@/pages/DashboardZen';
import DashboardCommand from '@/pages/DashboardCommand';
import DashboardApple from '@/pages/DashboardApple';
import DashboardGoogle from '@/pages/DashboardGoogle';
import DashboardIBM from '@/pages/DashboardIBM';
import DashboardAnthropic from '@/pages/DashboardAnthropic';
import DashboardOpenAI from '@/pages/DashboardOpenAI';
import DashboardMicrosoft from '@/pages/DashboardMicrosoft';
import DashboardGoogleLight from '@/pages/DashboardGoogleLight';
import DashboardAurora from '@/pages/DashboardAurora';
import Scans from '@/pages/Scans';
import NewScan from '@/pages/NewScan';
import ScanDetail from '@/pages/ScanDetail';
import FindingDetailPage from '@/pages/FindingDetailPage';
import Settings from '@/pages/Settings';
import ComplianceCorner from '@/pages/ComplianceCorner';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard/neon" element={<DashboardNeonPulse />} />
            <Route path="/dashboard/zen" element={<DashboardZen />} />
            <Route path="/dashboard/command" element={<DashboardCommand />} />
            <Route path="/dashboard/apple" element={<DashboardApple />} />
            <Route path="/dashboard/google" element={<DashboardGoogle />} />
            <Route path="/dashboard/ibm" element={<DashboardIBM />} />
            <Route path="/dashboard/anthropic" element={<DashboardAnthropic />} />
            <Route path="/dashboard/openai" element={<DashboardOpenAI />} />
            <Route path="/dashboard/microsoft" element={<DashboardMicrosoft />} />
            <Route path="/dashboard/google-light" element={<DashboardGoogleLight />} />
            <Route path="/dashboard/aurora" element={<DashboardAurora />} />
            <Route path="/scans" element={<Scans />} />
            <Route path="/scans/new" element={<NewScan />} />
            <Route path="/scans/:id" element={<ScanDetail />} />
            <Route path="/scans/:scanId/findings/:findingId" element={<FindingDetailPage />} />
            <Route path="/compliance" element={<ComplianceCorner />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
