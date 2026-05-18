import { BrowserRouter, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import UploadPage from './pages/UploadPage';
import ReceiptsPage from './pages/ReceiptsPage';
import ReceiptDetailPage from './pages/ReceiptDetailPage';
import BelegeListPage from './pages/BelegeListPage';
import BelegeUploadPage from './pages/BelegeUploadPage';
import BelegeDetailPage from './pages/BelegeDetailPage';
import StatsPage from './pages/StatsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AdvisorPortalPage from './pages/AdvisorPortalPage';
import CommunicationsPage from './pages/CommunicationsPage';
import PluginsPage from './pages/PluginsPage';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import UsersPage from './pages/UsersPage';
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
            {/* Eingeloggt, aber Forced-Change-Password */}
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePasswordPage />
                </ProtectedRoute>
              }
            />

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
                        {/* T014 — Belege (neue /belege-API, unterscheidet sich von /receipts) */}
                        <Route path="/belege" element={<BelegeListPage />} />
                        <Route path="/belege/upload" element={<BelegeUploadPage />} />
                        <Route path="/belege/:id" element={<BelegeDetailPage />} />
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
                        {/* M14 Benutzer-Verwaltung */}
                        <Route
                          path="/users"
                          element={
                            <ProtectedRoute requirePermission="users.read">
                              <UsersPage />
                            </ProtectedRoute>
                          }
                        />
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
