import { BrowserRouter, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import UploadPage from './pages/UploadPage';
import ReceiptsPage from './pages/ReceiptsPage';
import ReceiptDetailPage from './pages/ReceiptDetailPage';
import StatsPage from './pages/StatsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AdvisorPortalPage from './pages/AdvisorPortalPage';
import CommunicationsPage from './pages/CommunicationsPage';
import PluginsPage from './pages/PluginsPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import Layout from './components/Layout';
import OnboardingModal from './components/OnboardingModal';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Öffentliche Route — kein Auth erforderlich */}
            <Route path="/login" element={<LoginPage />} />

            {/* Alle geschützten Routen — erfordern eingeloggten User */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorBoundary>
                      <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/upload" element={<UploadPage />} />
                        <Route path="/receipts" element={<ReceiptsPage />} />
                        <Route path="/receipts/:receiptId" element={<ReceiptDetailPage />} />
                        <Route path="/stats" element={<StatsPage />} />
                        <Route path="/tenants" element={<TenantsPage />} />
                        <Route path="/tenants/:tenantId/customers" element={<CustomersPage />} />
                        <Route path="/tenants/:tenantId/customers/:customerId" element={<CustomerDetailPage />} />
                        <Route path="/tenants/:tenantId/customers/:customerId/profile" element={<CustomerProfilePage />} />
                        <Route path="/tenants/:tenantId/customers/:customerId/receipts" element={<ReceiptsPage />} />
                        {/* M08 Monatsberichte */}
                        <Route path="/customers/:customerId/reports" element={<ReportsPage />} />
                        {/* M06 Steuerberater-Portal (Export-Sicht) */}
                        <Route path="/advisor" element={<AdvisorPortalPage />} />
                        {/* M09 Lieferanten-Kommunikation */}
                        <Route path="/communications" element={<CommunicationsPage />} />
                        {/* Plugin-System */}
                        <Route path="/plugins" element={<PluginsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/settings/dsgvo" element={<SettingsPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </ErrorBoundary>
                    <OnboardingModal />
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
