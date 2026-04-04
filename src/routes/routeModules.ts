export const loadLoginPage = () => import('@/pages/Login');
export const loadAdminLoginPage = () => import('@/pages/AdminLogin');
export const loadDashboardPage = () => import('@/pages/Dashboard');
export const loadClientsPage = () => import('@/pages/Clients');
export const loadClientFormPage = () => import('@/pages/ClientForm');
export const loadClientDetailPage = () => import('@/pages/ClientDetail');
export const loadIntakeNotesPage = () => import('@/pages/IntakeNotes');
export const loadIntakeNoteFormPage = () => import('@/pages/IntakeNoteForm');
export const loadIntakeNoteDetailPage = () => import('@/pages/IntakeNoteDetail');
export const loadKanbanPage = () => import('@/pages/Kanban');
export const loadMonthlyClosingPage = () => import('@/pages/MonthlyClosing');
export const loadInvoicesPage = () => import('@/pages/Invoices');
export const loadSettingsPage = () => import('@/pages/Settings');
export const loadAdminDashboardPage = () => import('@/pages/admin/AdminDashboard');
export const loadAdminUsersPage = () => import('@/pages/admin/AdminClients');
export const loadAccessDeniedPage = () => import('@/pages/AccessDenied');
export const loadNotFoundPage = () => import('@/pages/NotFound');

type RouteLoaderEntry = {
  matches: (pathname: string) => boolean;
  load: () => Promise<unknown>;
};

const routeLoaderEntries: RouteLoaderEntry[] = [
  { matches: (pathname) => pathname === '/login', load: loadLoginPage },
  { matches: (pathname) => pathname === '/admin/login', load: loadAdminLoginPage },
  { matches: (pathname) => pathname === '/acesso-negado', load: loadAccessDeniedPage },
  { matches: (pathname) => pathname === '/dashboard', load: loadDashboardPage },
  { matches: (pathname) => pathname === '/clientes', load: loadClientsPage },
  { matches: (pathname) => pathname === '/clientes/novo', load: loadClientFormPage },
  {
    matches: (pathname) =>
      pathname.startsWith('/clientes/') && pathname !== '/clientes/novo',
    load: loadClientDetailPage,
  },
  { matches: (pathname) => pathname === '/notas-entrada', load: loadIntakeNotesPage },
  { matches: (pathname) => pathname === '/notas-entrada/nova', load: loadIntakeNoteFormPage },
  {
    matches: (pathname) => /^\/notas-entrada\/[^/]+\/editar$/.test(pathname),
    load: loadIntakeNoteFormPage,
  },
  {
    matches: (pathname) =>
      pathname.startsWith('/notas-entrada/') &&
      pathname !== '/notas-entrada/nova' &&
      !pathname.endsWith('/editar'),
    load: loadIntakeNoteDetailPage,
  },
  { matches: (pathname) => pathname === '/kanban', load: loadKanbanPage },
  { matches: (pathname) => pathname === '/fechamento', load: loadMonthlyClosingPage },
  { matches: (pathname) => pathname === '/nota-fiscal', load: loadInvoicesPage },
  { matches: (pathname) => pathname === '/configuracoes', load: loadSettingsPage },
  { matches: (pathname) => pathname === '/admin', load: loadAdminDashboardPage },
  { matches: (pathname) => pathname === '/admin/clientes', load: loadAdminUsersPage },
  { matches: (pathname) => pathname === '/admin/usuarios', load: loadAdminUsersPage },
  { matches: (pathname) => pathname === '/admin/configuracoes', load: loadSettingsPage },
];

export function preloadRouteModule(pathname: string): Promise<void> {
  const normalizedPath = pathname.split('?')[0] ?? pathname;
  const match = routeLoaderEntries.find((entry) => entry.matches(normalizedPath));

  if (!match) {
    return Promise.resolve();
  }

  return match.load().then(() => undefined);
}

export function preloadRouteModules(paths: string[]): Promise<void> {
  const uniquePaths = Array.from(new Set(paths));
  return Promise.all(uniquePaths.map((path) => preloadRouteModule(path))).then(() => undefined);
}
