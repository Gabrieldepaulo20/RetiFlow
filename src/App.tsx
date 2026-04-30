import { lazy, ReactNode, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import AppLayout from '@/components/layout/AppLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import {
  loadAccessDeniedPage,
  loadAdminDashboardPage,
  loadAdminLoginPage,
  loadAdminUsersPage,
  loadClientDetailPage,
  loadClientFormPage,
  loadClientsPage,
  loadContasAPagarPage,
  loadContaPagarFormPage,
  loadImportarContaPagarPage,
  loadDashboardPage,
  loadIntakeNoteDetailPage,
  loadIntakeNoteFormPage,
  loadIntakeNotesPage,
  loadInvoicesPage,
  loadKanbanPage,
  loadLoginPage,
  loadMonthlyClosingPage,
  loadNotFoundPage,
  loadResetPasswordPage,
  loadSettingsPage,
} from '@/routes/routeModules';

const Login = lazy(loadLoginPage);
const AdminLogin = lazy(loadAdminLoginPage);
const ResetPassword = lazy(loadResetPasswordPage);
const Dashboard = lazy(loadDashboardPage);
const Clients = lazy(loadClientsPage);
const ClientForm = lazy(loadClientFormPage);
const ClientDetail = lazy(loadClientDetailPage);
const IntakeNotes = lazy(loadIntakeNotesPage);
const IntakeNoteForm = lazy(loadIntakeNoteFormPage);
const IntakeNoteDetail = lazy(loadIntakeNoteDetailPage);
const Kanban = lazy(loadKanbanPage);
const MonthlyClosing = lazy(loadMonthlyClosingPage);
const Invoices = lazy(loadInvoicesPage);
const ContasAPagar = lazy(loadContasAPagarPage);
const ContaPagarForm = lazy(loadContaPagarFormPage);
const ImportarContaPagar = lazy(loadImportarContaPagarPage);
const SettingsPage = lazy(loadSettingsPage);
const AdminDashboard = lazy(loadAdminDashboardPage);
const AdminUsers = lazy(loadAdminUsersPage);
const AccessDenied = lazy(loadAccessDeniedPage);
const NotFound = lazy(loadNotFoundPage);

const queryClient = new QueryClient();

function PageFallback() {
  return (
    <LoadingScreen
      className="min-h-[calc(100vh-10rem)]"
      label="Abrindo tela"
      description="Carregando os dados e componentes da página."
    />
  );
}

function SuspendedPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <DataProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<SuspendedPage><Login /></SuspendedPage>} />
                <Route path="/admin/login" element={<SuspendedPage><AdminLogin /></SuspendedPage>} />
                <Route path="/definir-senha" element={<SuspendedPage><ResetPassword /></SuspendedPage>} />
                <Route path="/acesso-negado" element={<SuspendedPage><AccessDenied /></SuspendedPage>} />

                <Route
                  element={(
                    <ProtectedRoute
                      moduleKey="admin"
                      allowedRoles={['ADMIN']}
                      redirectTo="/dashboard"
                    />
                  )}
                >
                  <Route element={<AdminLayout />}>
                    <Route path="/admin" element={<SuspendedPage><AdminDashboard /></SuspendedPage>} />
                    <Route path="/admin/clientes" element={<Navigate to="/admin/usuarios" replace />} />
                    <Route path="/admin/usuarios" element={<SuspendedPage><AdminUsers /></SuspendedPage>} />
                    <Route path="/admin/configuracoes" element={<SuspendedPage><SettingsPage /></SuspendedPage>} />
                  </Route>
                </Route>

                <Route
                  element={(
                    <ProtectedRoute
                      allowedRoles={['ADMIN', 'FINANCEIRO', 'PRODUCAO', 'RECEPCAO']}
                      redirectTo="/admin"
                    />
                  )}
                >
                  <Route element={<AppLayout />}>
                    <Route element={<ProtectedRoute moduleKey="dashboard" />}>
                      <Route path="/dashboard" element={<SuspendedPage><Dashboard /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="clients" />}>
                      <Route path="/clientes" element={<SuspendedPage><Clients /></SuspendedPage>} />
                      <Route path="/clientes/novo" element={<SuspendedPage><ClientForm /></SuspendedPage>} />
                      <Route path="/clientes/:id" element={<SuspendedPage><ClientDetail /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="notes" />}>
                      <Route path="/notas-entrada" element={<SuspendedPage><IntakeNotes /></SuspendedPage>} />
                      <Route path="/notas-entrada/nova" element={<SuspendedPage><IntakeNoteForm /></SuspendedPage>} />
                      <Route path="/notas-entrada/:id/editar" element={<SuspendedPage><IntakeNoteForm /></SuspendedPage>} />
                      <Route path="/notas-entrada/:id" element={<SuspendedPage><IntakeNoteDetail /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="kanban" />}>
                      <Route path="/kanban" element={<SuspendedPage><Kanban /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="closing" />}>
                      <Route path="/fechamento" element={<SuspendedPage><MonthlyClosing /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="invoices" />}>
                      <Route path="/nota-fiscal" element={<SuspendedPage><Invoices /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="payables" />}>
                      <Route path="/contas-a-pagar" element={<SuspendedPage><ContasAPagar /></SuspendedPage>} />
                      <Route path="/contas-a-pagar/nova" element={<SuspendedPage><ContaPagarForm /></SuspendedPage>} />
                      <Route path="/contas-a-pagar/importar" element={<SuspendedPage><ImportarContaPagar /></SuspendedPage>} />
                    </Route>
                    <Route element={<ProtectedRoute moduleKey="settings" />}>
                      <Route path="/configuracoes" element={<SuspendedPage><SettingsPage /></SuspendedPage>} />
                    </Route>
                  </Route>
                </Route>

                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<SuspendedPage><NotFound /></SuspendedPage>} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
