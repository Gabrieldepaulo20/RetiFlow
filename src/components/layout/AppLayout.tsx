import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AnimatedPage } from './AnimatedPage';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { getSupportTickets, markSupportTicketsRead, submitSupportTicket, type SupportTicket, type SupportTicketStatus } from '@/api/supabase/support';
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { preloadRouteModule } from '@/routes/routeModules';
import { getMarketingResumo, getMarketingResumoQueryKey, DEFAULT_MARKETING_RESUMO_PERIOD_DAYS } from '@/api/supabase/marketing';
import { MARKETING_RESUMO_CACHE_TTL_MS } from '@/api/supabase/marketingCache';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { getInitials } from '@/lib/avatarInitials';
import { isSuperAdmin } from '@/services/auth/superAdmin';
import {
  LayoutDashboard, Users, FileText, KanbanSquare, Calendar, Settings, Wallet,
  Menu, Search, Bell, LogOut, ChevronLeft, ChevronRight, Wrench, ChevronDown, MessageSquarePlus,
  AlertCircle, BellOff, Palette, FileCog, TrendingUp, MessageSquareReply,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', moduleKey: 'dashboard' },
  { label: 'Clientes', icon: Users, path: '/clientes', moduleKey: 'clients' },
  { label: 'Notas de Entrada', icon: FileText, path: '/notas-entrada', moduleKey: 'notes' },
  { label: 'Kanban', icon: KanbanSquare, path: '/kanban', moduleKey: 'kanban' },
  { label: 'Fechamento', icon: Calendar, path: '/fechamento', moduleKey: 'closing' },
  { label: 'Contas a Pagar', icon: Wallet, path: '/contas-a-pagar', moduleKey: 'payables' },
  { label: 'Crescimento', icon: TrendingUp, path: '/crescimento', moduleKey: 'marketing' },
  { label: 'Configurações', icon: Settings, path: '/configuracoes', moduleKey: 'settings' },
] as const;

export default function AppLayout() {
  const { user, realUser, operationalUser, isAdmin, isSupportImpersonating, endSupportImpersonation, logout, canAccessModule } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);

  // ─── Must be before any conditional return (Rules of Hooks) ───
  const isKanbanRoute = location.pathname.startsWith('/kanban');
  const kanbanSearchValue = useMemo(() => {
    if (!isKanbanRoute) return '';
    return new URLSearchParams(location.search).get('q') ?? '';
  }, [isKanbanRoute, location.search]);

  const isActive = (path: string) => location.pathname.startsWith(path);
  const initials = getInitials(user?.name);
  const canReturnToAdmin = isSuperAdmin(user);
  const isAdminOperationalPortal = canReturnToAdmin && !isSupportImpersonating;

  const supportUnreadCount = supportTickets.filter((ticket) => ticket.resposta && !ticket.lida_em).length;

  const handleOpenNotif = (open: boolean) => {
    setNotifOpen(open);
  };

  const loadSupportTickets = useCallback(async (showLoading = false, notifyOnError = false) => {
    if (showLoading) setSupportLoading(true);
    try {
      setSupportTickets(await getSupportTickets());
    } catch (error) {
      if (notifyOnError) {
        toast({
          title: 'Não foi possível carregar seus chamados',
          description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
          variant: 'destructive',
        });
      }
    } finally {
      if (showLoading) setSupportLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSupportTickets();
    const interval = window.setInterval(() => void loadSupportTickets(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadSupportTickets, user?.email]);

  useEffect(() => {
    if (!supportOpen) return;
    setSupportLoading(true);
    markSupportTicketsRead()
      .then(() => loadSupportTickets())
      .catch((error) => {
        toast({
          title: 'Não foi possível atualizar seus chamados',
          description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
          variant: 'destructive',
        });
      })
      .finally(() => setSupportLoading(false));
  }, [loadSupportTickets, supportOpen, toast]);

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

  const handleEndSupportMode = async () => {
    await endSupportImpersonation();
    toast({
      title: 'Modo suporte encerrado',
      description: 'Você voltou para sua conta master.',
    });
    navigate('/admin/usuarios');
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

  const isModuleVisible = (item: typeof navItems[number]) => {
    if (!user) return false;
    if (isSupportImpersonating && item.moduleKey === 'settings') return false;
    return canAccessModule(item.moduleKey);
  };

  const canWarmMarketing = Boolean(user && canAccessModule('marketing'));
  const hasPrivateMarketingAccess = isSuperAdmin(realUser);
  const { data: marketingWarmupUsers = [] } = useSystemUsersQuery({
    enabled: canWarmMarketing && isAdmin && hasPrivateMarketingAccess,
  });
  const marketingWarmupTargetUserId = useMemo(() => {
    if (!canWarmMarketing || !isAdmin || !hasPrivateMarketingAccess) return null;
    if (isSupportImpersonating && operationalUser?.moduleAccess?.marketing === true) {
      return operationalUser.id;
    }

    return marketingWarmupUsers.find((candidate) => (
      candidate.isActive
      && candidate.role !== 'ADMIN'
      && candidate.moduleAccess?.marketing === true
    ))?.id ?? null;
  }, [canWarmMarketing, hasPrivateMarketingAccess, isAdmin, isSupportImpersonating, marketingWarmupUsers, operationalUser]);
  const canWarmMarketingData = canWarmMarketing
    && (!hasPrivateMarketingAccess || Boolean(marketingWarmupTargetUserId));

  const warmMarketingGrowth = useCallback(() => {
    void preloadRouteModule('/crescimento');
    if (!canWarmMarketingData) return;

    const targetUserId = hasPrivateMarketingAccess ? marketingWarmupTargetUserId : null;
    void queryClient.prefetchQuery({
      queryKey: getMarketingResumoQueryKey(DEFAULT_MARKETING_RESUMO_PERIOD_DAYS, targetUserId, realUser!.id),
      queryFn: () => getMarketingResumo(DEFAULT_MARKETING_RESUMO_PERIOD_DAYS, targetUserId, realUser!.id),
      staleTime: MARKETING_RESUMO_CACHE_TTL_MS,
      gcTime: 60 * 60 * 1000,
    }).catch(() => {
      // O prefetch nao pode atrapalhar a navegacao; a tela mostra erro se o usuario abrir o modulo.
    });
  }, [canWarmMarketingData, hasPrivateMarketingAccess, marketingWarmupTargetUserId, queryClient, realUser]);

  const warmRoute = useCallback((path: string) => {
    void preloadRouteModule(path);
    if (path === '/crescimento') {
      warmMarketingGrowth();
    }
  }, [warmMarketingGrowth]);

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
              onMouseEnter={() => warmRoute(item.path)}
              onFocus={() => warmRoute(item.path)}
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
              <Avatar className="w-9 h-9">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold tracking-wide">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user?.name}</p>
                    <p className="text-xs text-sidebar-foreground/60 truncate">{user?.role}</p>
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
              <span className="block truncate text-sm">{user?.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isAdminOperationalPortal ? (
              <DropdownMenuItem onClick={() => navigate('/admin')}>
                <LayoutDashboard className="w-4 h-4 mr-2" /> Voltar para o ADM
              </DropdownMenuItem>
            ) : !isSupportImpersonating && canAccessModule('settings') ? (
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
            {!isSupportImpersonating && !isAdminOperationalPortal && canAccessModule('admin') && canReturnToAdmin ? (
              <DropdownMenuItem onClick={() => navigate('/admin/usuarios')}>
                <Users className="w-4 h-4 mr-2" /> Acessos de funcionários
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {isSupportImpersonating ? (
              <DropdownMenuItem onClick={() => void handleEndSupportMode()}>
                <AlertCircle className="w-4 h-4 mr-2" /> Sair do suporte
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => setSupportOpen(true)}>
              <MessageSquarePlus className="w-4 h-4 mr-2" /> Sugestões / Chamado
              {supportUnreadCount > 0 ? (
                <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
                  {supportUnreadCount > 9 ? '9+' : supportUnreadCount}
                </span>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

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
      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-col overflow-x-hidden',
          isMobile
            ? 'w-full'
            : collapsed
              ? 'ml-[68px] w-[calc(100vw-68px)]'
              : 'ml-64 w-[calc(100vw-16rem)]',
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card px-4 shadow-sm">
          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" aria-label="Abrir menu de navegação">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(86vw,18rem)] p-0 bg-sidebar border-sidebar-border">
                <SheetTitle className="sr-only">Menu de navegação operacional</SheetTitle>
                <NavContent onNav={() => setMobileMenuOpen(false)} />
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
            {isSupportImpersonating ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 border-amber-300 bg-amber-50 px-3 text-amber-900 hover:bg-amber-100"
                onClick={() => void handleEndSupportMode()}
              >
                Sair do suporte
              </Button>
            ) : null}
            <Popover open={notifOpen} onOpenChange={handleOpenNotif}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-xl border border-border/60 bg-background shadow-sm">
                  <Bell className="w-5 h-5" />
                  {supportUnreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {supportUnreadCount > 9 ? '9+' : supportUnreadCount}
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
                      {supportUnreadCount > 0 ? `${supportUnreadCount} nova${supportUnreadCount > 1 ? 's' : ''}` : 'Tudo lido'}
                    </p>
                  </div>
                </div>

                <ScrollArea className="max-h-[400px]">
                  {supportUnreadCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                        <BellOff className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Sem notificações</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Respostas do suporte aparecerão aqui.
                      </p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {supportUnreadCount > 0 ? (
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
                          onClick={() => {
                            setNotifOpen(false);
                            setSupportOpen(true);
                          }}
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <MessageSquareReply className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium leading-relaxed text-foreground">
                              {supportUnreadCount === 1 ? 'O suporte respondeu ao seu chamado.' : `O suporte respondeu a ${supportUnreadCount} chamados.`}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">Abra para ver a resposta</p>
                          </div>
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        </button>
                      ) : null}
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-10 rounded-xl border border-border/60 bg-background px-2.5 text-foreground shadow-sm hover:bg-muted/70 hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold tracking-wide">
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
                {isSupportImpersonating ? (
                  <DropdownMenuItem onClick={() => void handleEndSupportMode()}>
                    <AlertCircle className="w-4 h-4 mr-2" /> Sair do suporte
                  </DropdownMenuItem>
                ) : null}
                {isAdminOperationalPortal ? (
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <LayoutDashboard className="w-4 h-4 mr-2" /> Voltar para o ADM
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => setSupportOpen(true)}>
                  <MessageSquarePlus className="w-4 h-4 mr-2" /> Sugestões / Chamado
                  {supportUnreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
                      {supportUnreadCount > 9 ? '9+' : supportUnreadCount}
                    </span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
                  <LogOut className="w-4 h-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4 md:p-6">
          <AnimatePresence initial={false}>
            <AnimatedPage key={location.pathname}>
              <Outlet />
            </AnimatedPage>
          </AnimatePresence>
        </main>
      </div>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-h-[92dvh] max-w-lg gap-0 overflow-hidden p-0">
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
                        {ticket.resposta ? (
                          <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                                <MessageSquareReply className="h-3.5 w-3.5" />
                                Resposta do suporte
                              </p>
                              {ticket.respondido_em ? (
                                <p className="text-[10px] tabular-nums text-muted-foreground">
                                  {new Date(ticket.respondido_em).toLocaleString('pt-BR', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                  })}
                                </p>
                              ) : null}
                            </div>
                            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/85">{ticket.resposta}</p>
                          </div>
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
