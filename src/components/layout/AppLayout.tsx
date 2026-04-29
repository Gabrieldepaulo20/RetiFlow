import { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AnimatedPage } from './AnimatedPage';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRoleModuleConfig, useUserModuleOverrides } from '@/hooks/useRoleModuleConfig';
import { cn } from '@/lib/utils';
import { getSupportTickets, submitSupportTicket, type SupportTicket, type SupportTicketStatus } from '@/api/supabase/support';
import { validateSupportMessage } from '@/services/domain/supportTickets';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { preloadRouteModule, preloadRouteModules } from '@/routes/routeModules';
import {
  LayoutDashboard, Users, FileText, KanbanSquare, Calendar, Settings, Wallet,
  Menu, Search, Bell, LogOut, ChevronLeft, ChevronRight, MoreHorizontal, Wrench, ChevronDown, MessageSquarePlus,
  CheckCircle2, AlertCircle, PlusCircle, ArrowRightLeft, Paperclip, BellOff, Palette, FileCog,
} from 'lucide-react';

// ─── Notification helpers ───────────────────────────────────────────────────

function getActivityIcon(message: string) {
  const m = message.toLowerCase();
  if (m.includes('criada') || m.includes('cadastr') || m.includes('adicionad')) return PlusCircle;
  if (m.includes('status') || m.includes('movida') || m.includes('aprovad') || m.includes('entregue') || m.includes('finaliz')) return ArrowRightLeft;
  if (m.includes('anexo') || m.includes('arquivo') || m.includes('pdf') || m.includes('foto')) return Paperclip;
  if (m.includes('cancelad') || m.includes('descartad') || m.includes('erro')) return AlertCircle;
  if (m.includes('concluíd') || m.includes('pronta') || m.includes('pront')) return CheckCircle2;
  return FileText;
}

function getActivityColor(message: string) {
  const m = message.toLowerCase();
  if (m.includes('cancelad') || m.includes('descartad') || m.includes('erro')) return 'text-destructive bg-destructive/10';
  if (m.includes('concluíd') || m.includes('finaliz') || m.includes('entregue')) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30';
  if (m.includes('aprovad') || m.includes('pronta') || m.includes('pront')) return 'text-green-600 bg-green-50 dark:bg-green-950/30';
  if (m.includes('status') || m.includes('movida')) return 'text-amber-600 bg-amber-50 dark:bg-amber-950/30';
  return 'text-primary bg-primary/10';
}

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return 'Agora mesmo';
  if (diffMin < 60) return `${diffMin}min atrás`;
  if (diffH < 24) return `${diffH}h atrás`;
  if (diffD === 1) return 'Ontem';
  if (diffD < 7) return `${diffD} dias atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', moduleKey: 'dashboard' },
  { label: 'Clientes', icon: Users, path: '/clientes', moduleKey: 'clients' },
  { label: 'Notas de Entrada', icon: FileText, path: '/notas-entrada', moduleKey: 'notes' },
  { label: 'Kanban', icon: KanbanSquare, path: '/kanban', moduleKey: 'kanban' },
  { label: 'Fechamento', icon: Calendar, path: '/fechamento', moduleKey: 'closing' },
  { label: 'Contas a Pagar', icon: Wallet, path: '/contas-a-pagar', moduleKey: 'payables' },
  { label: 'Configurações', icon: Settings, path: '/configuracoes', moduleKey: 'settings' },
] as const;

const mobileNav = navItems.slice(0, 4);

export default function AppLayout() {
  const { user, logout, canAccessModule } = useAuth();
  const { activities } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const roleModuleConfig = useRoleModuleConfig();
  const userModuleOverrides = useUserModuleOverrides();

  // ─── Must be before any conditional return (Rules of Hooks) ───
  const isKanbanRoute = location.pathname.startsWith('/kanban');
  const kanbanSearchValue = useMemo(() => {
    if (!isKanbanRoute) return '';
    return new URLSearchParams(location.search).get('q') ?? '';
  }, [isKanbanRoute, location.search]);

  const isActive = (path: string) => location.pathname.startsWith(path);
  const initials = user?.name.split(' ').map(w => w[0]).join('').slice(0, 2) ?? '';

  const recentActivities = activities.slice(0, 20);
  const unreadCount = Math.max(0, recentActivities.length - readCount);

  const handleOpenNotif = (open: boolean) => {
    setNotifOpen(open);
    if (open) setReadCount(recentActivities.length);
  };

  useEffect(() => {
    if (!supportOpen) return;
    let cancelled = false;

    setSupportLoading(true);
    getSupportTickets()
      .then((tickets) => {
        if (!cancelled) setSupportTickets(tickets);
      })
      .catch((error) => {
        if (!cancelled) {
          toast({
            title: 'Não foi possível carregar seus chamados',
            description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSupportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supportOpen, toast]);

  const submitSupportRequest = async () => {
    const validation = validateSupportMessage(supportMessage);
    if (!validation.ok) {
      toast({
        title: 'Descreva melhor o chamado',
        description: validation.error,
        variant: 'destructive',
      });
      return;
    }

    setSupportSubmitting(true);
    try {
      const result = await submitSupportTicket(validation.message);
      setSupportTickets((previous) => [
        result.ticket,
        ...previous.filter((ticket) => ticket.id_chamados_suporte !== result.ticket.id_chamados_suporte),
      ]);
      toast({
        title: 'Chamado enviado',
        description: 'Recebemos sua mensagem e ela foi enviada para o suporte.',
      });
      setSupportMessage('');
    } catch (error) {
      toast({
        title: 'Não foi possível enviar o chamado',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setSupportSubmitting(false);
    }
  };

  const supportStatusMap: Record<SupportTicketStatus, { label: string; className: string }> = {
    PENDING: {
      label: 'Registrado',
      className: 'bg-amber-50 text-amber-700 border-amber-200/60',
    },
    EMAIL_SENT: {
      label: 'Enviado',
      className: 'bg-blue-50 text-blue-700 border-blue-200/60',
    },
    EMAIL_FAILED: {
      label: 'E-mail pendente',
      className: 'bg-destructive/10 text-destructive border-destructive/30',
    },
    RESOLVED: {
      label: 'Resolvido',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    },
  };

  const isModuleVisible = (item: typeof navItems[0]) => {
    if (!user) return false;
    if (!canAccessModule(item.moduleKey)) return false;
    if (roleModuleConfig[user.role]?.[item.moduleKey] === false) return false;
    if (userModuleOverrides[user.id]?.[item.moduleKey] === false) return false;
    return true;
  };

  const handleKanbanSearchChange = (value: string) => {
    const params = new URLSearchParams(location.search);

    if (value.trim()) {
      params.set('q', value);
    } else {
      params.delete('q');
    }

    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    }, { replace: true });
  };

  const NavContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Wrench className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && <span className="font-display font-bold text-sidebar-primary-foreground text-lg">Retífica Premium</span>}
      </div>
      <nav className="flex-1 px-3 space-y-1 mt-2">
        {navItems.filter(isModuleVisible).map(item => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNav}
              onMouseEnter={() => void preloadRouteModule(item.path)}
              onFocus={() => void preloadRouteModule(item.path)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                collapsed && 'justify-center px-0',
              )}
              aria-label="Abrir menu da conta"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user.name}</p>
                    <p className="text-xs text-sidebar-foreground/60 truncate">{user.role}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-sidebar-foreground/60" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={collapsed ? 'right' : 'top'}
            align="start"
            className="w-64"
          >
            <DropdownMenuLabel className="leading-tight">
              <span className="block truncate text-sm">{user.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canAccessModule('settings') ? (
              <>
                <DropdownMenuItem onClick={() => navigate('/configuracoes?tab=empresa')}>
                  <Settings className="w-4 h-4 mr-2" /> Configurações da empresa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/configuracoes?tab=aparencia')}>
                  <Palette className="w-4 h-4 mr-2" /> Cores do sistema
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/configuracoes?tab=modelos')}>
                  <FileCog className="w-4 h-4 mr-2" /> Modelos e templates
                </DropdownMenuItem>
              </>
            ) : null}
            {canAccessModule('admin') && user.role === 'ADMIN' ? (
              <DropdownMenuItem onClick={() => navigate('/admin/usuarios')}>
                <Users className="w-4 h-4 mr-2" /> Acessos de funcionários
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSupportOpen(true)}>
              <MessageSquarePlus className="w-4 h-4 mr-2" /> Sugestões / Chamado
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const visibleMobileNav = mobileNav.filter(isModuleVisible);
  const visibleMoreNav = navItems.slice(4).filter(isModuleVisible);
  const visibleNavPaths = useMemo(
    () =>
      navItems
        .filter((item) => {
          if (!user) return false;
          if (!canAccessModule(item.moduleKey)) return false;
          if (roleModuleConfig[user.role]?.[item.moduleKey] === false) return false;
          if (userModuleOverrides[user.id]?.[item.moduleKey] === false) return false;
          return true;
        })
        .map((item) => item.path),
    [canAccessModule, roleModuleConfig, user, userModuleOverrides],
  );

  useEffect(() => {
    if (visibleNavPaths.length === 0) {
      return;
    }
    void preloadRouteModules(visibleNavPaths);
  }, [visibleNavPaths]);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className={cn(
          'fixed left-0 top-0 h-full bg-sidebar transition-all duration-300 z-40 flex flex-col',
          collapsed ? 'w-[68px]' : 'w-64'
        )}>
          <NavContent />
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border flex items-center justify-center shadow-sm hover:bg-muted"
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </aside>
      )}

      {/* Main */}
      <div className={cn('flex-1 flex flex-col min-h-screen', !isMobile && (collapsed ? 'ml-[68px]' : 'ml-64'))}>
        {/* Top bar */}
        <header className="h-16 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-30 shadow-sm">
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
                <NavContent onNav={() => {}} />
              </SheetContent>
            </Sheet>
          )}
          <div className="flex-1">
            {isKanbanRoute ? (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={kanbanSearchValue}
                  onChange={(event) => handleKanbanSearchChange(event.target.value)}
                  placeholder="Buscar no Kanban por O.S., cliente, veículo ou placa..."
                  className="h-9 border-0 bg-muted/50 pl-9"
                />
              </div>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Popover open={notifOpen} onOpenChange={handleOpenNotif}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-xl border border-border/60 bg-background shadow-sm">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[380px] p-0" align="end">
                {/* Header */}
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Notificações</p>
                    <p className="text-xs text-muted-foreground">
                      {unreadCount > 0 ? `${unreadCount} nova${unreadCount > 1 ? 's' : ''}` : 'Tudo lido'}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setReadCount(recentActivities.length)}
                    >
                      Marcar todas como lidas
                    </button>
                  )}
                </div>

                <ScrollArea className="max-h-[400px]">
                  {recentActivities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                        <BellOff className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Sem notificações</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        As atividades do sistema aparecerão aqui.
                      </p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {recentActivities.map((a, i) => {
                        const Icon = getActivityIcon(a.message);
                        const color = getActivityColor(a.message);
                        const isUnread = i < unreadCount;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className={cn(
                              'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/60 transition-colors',
                              isUnread && 'bg-primary/5 hover:bg-primary/10',
                            )}
                            onClick={() => {
                              if (a.noteId) {
                                setNotifOpen(false);
                                navigate(`/notas-entrada/${a.noteId}`);
                              }
                            }}
                          >
                            <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', color)}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs leading-relaxed text-foreground">{a.message}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">{formatNotifTime(a.createdAt)}</p>
                            </div>
                            {isUnread && (
                              <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                {recentActivities.length > 0 && (
                  <div className="border-t px-4 py-2.5">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setNotifOpen(false); navigate('/notas-entrada'); }}
                    >
                      Ver todas as notas de entrada →
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-10 rounded-xl border border-border/60 bg-background px-2.5 text-foreground shadow-sm hover:bg-muted/70 hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {!isMobile && (
                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-semibold leading-none text-foreground">{user.name}</p>
                      </div>
                    )}
                    <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-muted-foreground text-xs" disabled>{user.email}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSupportOpen(true)}>
                  <MessageSquarePlus className="w-4 h-4 mr-2" /> Sugestões / Chamado
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
                  <LogOut className="w-4 h-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className={cn('flex-1 p-4 md:p-6', isMobile && 'pb-20')}>
          <AnimatePresence initial={false}>
            <AnimatedPage key={location.pathname}>
              <Outlet />
            </AnimatedPage>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card border-t flex items-center justify-around z-50 px-2">
          {visibleMobileNav.map(item => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onMouseEnter={() => void preloadRouteModule(item.path)}
                onFocus={() => void preloadRouteModule(item.path)}
                className={cn('flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg', active ? 'text-primary' : 'text-muted-foreground')}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
          {visibleMoreNav.length > 0 && (
            <Sheet>
              <SheetTrigger asChild>
                <button className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground">
                  <MoreHorizontal className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Mais</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <div className="grid grid-cols-3 gap-4 py-4">
                  {visibleMoreNav.map(item => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onMouseEnter={() => void preloadRouteModule(item.path)}
                      onFocus={() => void preloadRouteModule(item.path)}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted"
                    >
                      <item.icon className="w-6 h-6 text-primary" />
                      <span className="text-xs font-medium text-center">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </nav>
      )}

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/40">
            <DialogTitle className="text-[16px] font-semibold">Suporte / Chamados</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Registre bugs, sugestões ou dificuldades. Em breve você receberá uma resposta.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="novo" className="flex flex-col">
            <TabsList className="flex h-10 w-full rounded-none border-b border-border/40 bg-transparent p-0 shrink-0">
              <TabsTrigger
                value="novo"
                className="flex-1 h-full rounded-none border-b-2 border-transparent text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Novo chamado
              </TabsTrigger>
              <TabsTrigger
                value="abertos"
                className="flex-1 h-full rounded-none border-b-2 border-transparent text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Meus chamados
                {supportTickets.length > 0 && (
                  <span className="ml-1.5 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {supportTickets.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tab: Novo chamado */}
            <TabsContent value="novo" className="mt-0 p-5 space-y-4">
              <Textarea
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Descreva o problema, melhoria ou dúvida..."
                maxLength={2000}
                className="min-h-[130px] resize-none text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11.5px] text-muted-foreground/60 leading-relaxed hidden sm:block">
                  Sua mensagem será salva e enviada por e-mail ao suporte.
                </p>
                <div className="flex gap-2 ml-auto">
                  <Button variant="ghost" size="sm" onClick={() => setSupportOpen(false)} className="text-muted-foreground">
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => void submitSupportRequest()} disabled={supportSubmitting} className="gap-1.5 px-4">
                    {supportSubmitting ? 'Enviando...' : 'Enviar chamado'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Tab: Chamados abertos */}
            <TabsContent value="abertos" className="mt-0">
              {supportLoading ? (
                <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
                  <p className="text-sm font-medium text-foreground/70">Carregando chamados...</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Buscando registros salvos no sistema.</p>
                </div>
              ) : supportTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                    <MessageSquarePlus className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground/70">Nenhum chamado ainda</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Seus chamados aparecerão aqui após o envio.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-72 overflow-y-auto">
                  {supportTickets.map(ticket => {
                    const s = supportStatusMap[ticket.status] ?? supportStatusMap.PENDING;
                    return (
                      <div key={ticket.id_chamados_suporte} className="px-5 py-3.5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <p className="text-[11px] text-muted-foreground/60 tabular-nums">
                            {new Date(ticket.created_at).toLocaleString('pt-BR', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                          <Badge variant="outline" className={`text-[10px] shrink-0 px-2 py-0.5 leading-none font-semibold ${s.className}`}>
                            {s.label}
                          </Badge>
                        </div>
                        <p className="text-[13px] text-foreground/80 leading-snug line-clamp-2">{ticket.mensagem}</p>
                        {ticket.email_error ? (
                          <p className="mt-1 text-[11px] text-destructive/80 line-clamp-1">{ticket.email_error}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
