import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import BelegeDetailPage from './pages/BelegeDetailPage';
import BelegeListPage from './pages/BelegeListPage';
import BelegeUploadPage from './pages/BelegeUploadPage';
import ChatDetailPage from './pages/ChatDetailPage';
import ChatsPage from './pages/ChatsPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import SettingsPage from './pages/SettingsPage';
import TenantsPage from './pages/TenantsPage';

/**
 * Interne Mitarbeiter-Webapp (admin.prozesspilot.net).
 * A3-Reboot (T059): nur die lebende belege-Welt — Geister-Routen (receipts/
 * customers/plugins/communications/reports/stats/advisor/users) entfernt.
 */
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Öffentliche Route — kein Auth erforderlich */}
            <Route path="/login" element={<LoginPage />} />

            {/* Alle geschützten Routen — erfordern eingeloggten Mitarbeiter */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorBoundary>
                      <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/belege" element={<BelegeListPage />} />
                        <Route path="/belege/upload" element={<BelegeUploadPage />} />
                        <Route path="/belege/:id" element={<BelegeDetailPage />} />
                        <Route path="/chats" element={<ChatsPage />} />
                        <Route path="/chats/:id" element={<ChatDetailPage />} />
                        <Route path="/tenants" element={<TenantsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </ErrorBoundary>
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
