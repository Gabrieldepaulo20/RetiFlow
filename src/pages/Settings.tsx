import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Calendar,
  FileClock,
  FileText,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Lock,
  Palette,
  Settings as SettingsIcon,
  Shield,
  Calculator,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MfaSettingsCard from '@/components/auth/MfaSettingsCard';
import { CompanySettingsPanel } from '@/components/settings/CompanySettingsPanel';
import { DocumentAppearancePanel } from '@/components/settings/DocumentAppearancePanel';
import { DocumentTemplatesPanel } from '@/components/settings/DocumentTemplatesPanel';
import { DocumentThemesPanel } from '@/components/settings/DocumentThemesPanel';
import { SettingsAuditPanel } from '@/components/settings/SettingsAuditPanel';
import StatusGlossarySection from '@/components/settings/StatusGlossarySection';
import { PlanoDeContasPanel } from '@/components/settings/PlanoDeContasPanel';
import { callAdminUsersFunction } from '@/api/supabase/admin-users';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { DEFAULT_ROLE_MODULE_CONFIG } from '@/services/auth/moduleAccess';
import {
  isOtherConfiguredSuperAdminEmail,
  isSuperAdmin as checkIsSuperAdmin,
} from '@/services/auth/superAdmin';
import { normalizeEmail } from '@/services/domain/textNormalization';
import type { AppModuleKey, SystemUser } from '@/types';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

const MODULE_DEFS: { key: AppModuleKey; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Indicadores operacionais do sistema.', icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', description: 'Cadastro e consulta de clientes.', icon: Users },
  { key: 'notes', label: 'Notas de Entrada', description: 'Ordens de serviço, edição, preview e PDF.', icon: FileText },
  { key: 'kanban', label: 'Kanban', description: 'Acompanhamento da produção por status.', icon: KanbanSquare },
  { key: 'closing', label: 'Fechamento', description: 'Geração de fechamento mensal.', icon: Calendar },
  { key: 'payables', label: 'Financeiro', description: 'Central financeira, saídas, anexos e importação com IA.', icon: Wallet },
  { key: 'marketing', label: 'Crescimento', description: 'Site, leads e campanhas por tenant.', icon: TrendingUp },
  { key: 'settings', label: 'Configurações', description: 'Ajustes e prévias do sistema.', icon: SettingsIcon },
  { key: 'admin', label: 'Admin', description: 'Usuários e permissões administrativas.', icon: Shield },
];

const SETTINGS_TAB_ITEMS = [
  { key: 'empresa', label: 'Dados da empresa', icon: Building2 },
  { key: 'aparencia', label: 'Aparência', icon: Palette },
  { key: 'modelos', label: 'Modelos', icon: FileText },
  { key: 'temas', label: 'Temas', icon: Palette },
  { key: 'historico', label: 'Histórico', icon: FileClock },
  { key: 'modulos', label: 'Módulos', icon: LayoutGrid },
  { key: 'status', label: 'Status & Fluxo', icon: Workflow },
  { key: 'plano-contas', label: 'Plano de contas', icon: Calculator },
  { key: 'seguranca', label: 'Segurança', icon: Lock },
  { key: 'usuarios', label: 'Usuários', icon: Users },
] as const;

const SETTINGS_TABS = new Set<string>(SETTINGS_TAB_ITEMS.map((item) => item.key));

export default function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: systemUsers = [], isLoading: usersLoading } = useSystemUsersQuery();
  const isSuperAdmin = checkIsSuperAdmin(user);
  const activeTab = SETTINGS_TABS.has(searchParams.get('tab') ?? '') ? searchParams.get('tab') ?? 'empresa' : 'empresa';

  const [selectedSettingsUserId, setSelectedSettingsUserId] = useState('');
  const [selectedModuleUserId, setSelectedModuleUserId] = useState('');
  const [moduleSavingKey, setModuleSavingKey] = useState<AppModuleKey | null>(null);
  const [selectedResetUserId, setSelectedResetUserId] = useState('');
  const [resetConfirmationEmail, setResetConfirmationEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [tabRailEdges, setTabRailEdges] = useState({ left: false, right: false });

  const updateTabRailEdges = useCallback(() => {
    const rail = tabsListRef.current;
    if (!rail) return;
    setTabRailEdges({
      left: rail.scrollLeft > 2,
      right: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    if (selectedSettingsUserId) return;
    if (isSuperAdmin && systemUsers.length > 0) {
      setSelectedSettingsUserId(systemUsers[0].id);
      return;
    }
    if (user?.id) setSelectedSettingsUserId(user.id);
  }, [isSuperAdmin, selectedSettingsUserId, systemUsers, user?.id]);

  useEffect(() => {
    if (!selectedModuleUserId && systemUsers.length > 0) setSelectedModuleUserId(systemUsers[0].id);
  }, [selectedModuleUserId, systemUsers]);

  useEffect(() => {
    if (!selectedResetUserId && systemUsers.length > 0) setSelectedResetUserId(systemUsers[0].id);
  }, [selectedResetUserId, systemUsers]);

  useEffect(() => {
    const rail = tabsListRef.current;
    if (!rail) return undefined;

    const frame = window.requestAnimationFrame(updateTabRailEdges);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateTabRailEdges);
    resizeObserver?.observe(rail);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [updateTabRailEdges]);

  useEffect(() => {
    const rail = tabsListRef.current;
    const selectedTab = rail?.querySelector<HTMLElement>(`[data-settings-tab="${activeTab}"]`);
    if (!rail || !selectedTab) return undefined;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const left = selectedTab.offsetLeft - ((rail.clientWidth - selectedTab.offsetWidth) / 2);
    const nextLeft = Math.max(0, left);
    if (typeof rail.scrollTo === 'function') {
      rail.scrollTo({
        left: nextLeft,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    } else {
      rail.scrollLeft = nextLeft;
    }
    const frame = window.requestAnimationFrame(updateTabRailEdges);
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, updateTabRailEdges]);

  const selectedSettingsUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedSettingsUserId) ?? user ?? null,
    [selectedSettingsUserId, systemUsers, user],
  );
  const selectedModuleUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedModuleUserId) ?? null,
    [selectedModuleUserId, systemUsers],
  );
  const selectedResetUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedResetUserId) ?? null,
    [selectedResetUserId, systemUsers],
  );
  const selectedModuleUserIsProtected = isOtherConfiguredSuperAdminEmail(
    user?.email,
    selectedModuleUser?.email,
  );
  const selectedResetUserIsProtected = isOtherConfiguredSuperAdminEmail(
    user?.email,
    selectedResetUser?.email,
  );

  const handleTabChange = (tab: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tab);
    setSearchParams(nextParams, { replace: true });
  };

  const getModulesForUser = (targetUser: SystemUser) => {
    return MODULE_DEFS.reduce<Record<AppModuleKey, boolean>>((accumulator, module) => {
      accumulator[module.key] = targetUser.moduleAccess?.[module.key] ?? DEFAULT_ROLE_MODULE_CONFIG[targetUser.role]?.[module.key] ?? false;
      return accumulator;
    }, {} as Record<AppModuleKey, boolean>);
  };

  const toggleModule = async (moduleKey: AppModuleKey) => {
    if (!selectedModuleUser) return;
    if (!isSuperAdmin) {
      toast({
        title: 'Ação restrita ao Super Admin',
        description: 'Apenas o Super Admin autorizado pode alterar módulos.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedModuleUserIsProtected) {
      toast({
        title: 'Mega Master protegido',
        description: 'Um Mega Master não pode alterar os módulos de outro Mega Master.',
        variant: 'destructive',
      });
      return;
    }

    const currentModules = getModulesForUser(selectedModuleUser);
    const nextModules = { ...currentModules, [moduleKey]: !currentModules[moduleKey] };

    setModuleSavingKey(moduleKey);
    try {
      await callAdminUsersFunction({
        action: 'set_modules',
        userId: selectedModuleUser.id,
        modules: nextModules,
      });
      queryClient.setQueryData<SystemUser[]>(['auth', 'system-users'], (previous) =>
        previous?.map((candidate) =>
          candidate.id === selectedModuleUser.id ? { ...candidate, moduleAccess: nextModules } : candidate,
        ) ?? previous,
      );
      await queryClient.invalidateQueries({ queryKey: ['auth', 'system-users'] });
      if (selectedModuleUser.id === user?.id) await refreshProfile({ keepCurrentSessionOnTransientError: true });
      toast({ title: nextModules[moduleKey] ? 'Módulo ativado' : 'Módulo desativado' });
    } catch (error) {
      toast({
        title: 'Não foi possível atualizar o módulo',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setModuleSavingKey(null);
    }
  };

  const handleAdminPasswordReset = async () => {
    const targetUser = selectedResetUser;
    if (!targetUser) {
      toast({ title: 'Selecione um cliente/usuário', variant: 'destructive' });
      return;
    }
    if (selectedResetUserIsProtected) {
      toast({
        title: 'Mega Master protegido',
        description: 'Um Mega Master não pode resetar a senha de outro Mega Master.',
        variant: 'destructive',
      });
      return;
    }
    if (!isSuperAdmin) {
      toast({
        title: 'Ação restrita ao Admin master',
        description: 'Somente o Super Admin autorizado pode reenviar recuperação de senha.',
        variant: 'destructive',
      });
      return;
    }

    setResetSending(true);
    try {
      const result = await callAdminUsersFunction({
        action: 'reset_password',
        userId: targetUser.id,
        confirmationEmail: normalizeEmail(resetConfirmationEmail) || undefined,
      });
      toast({
        title: 'Reset de senha enviado',
        description: result.confirmationSent
          ? `Link enviado para ${targetUser.email}; confirmação enviada para ${normalizeEmail(resetConfirmationEmail)}.`
          : result.confirmationWarning
            ? `Link enviado para ${targetUser.email}. Confirmação extra não foi enviada: ${result.confirmationWarning}`
            : `Link enviado para ${targetUser.email}.`,
      });
      setResetConfirmationEmail('');
    } catch (error) {
      toast({
        title: 'Não foi possível enviar reset',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setResetSending(false);
    }
  };

  const targetUserId = selectedSettingsUser?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-display font-bold">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Empresa, documentos e controles administrativos do Retiflow.
          </p>
        </div>
        {isSuperAdmin && (
          <div className="w-full space-y-2 xl:w-[360px]">
            <Label>Conta configurada</Label>
            <Select value={selectedSettingsUserId} onValueChange={setSelectedSettingsUserId} disabled={usersLoading || systemUsers.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={usersLoading ? 'Carregando contas...' : 'Selecione uma conta'} />
              </SelectTrigger>
              <SelectContent>
                {systemUsers.map((systemUser) => (
                  <SelectItem key={systemUser.id} value={systemUser.id}>
                    {systemUser.name} · {systemUser.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!IS_REAL_AUTH && (
        <Alert>
          <SettingsIcon className="h-4 w-4" />
          <AlertTitle>Configurações reais e prévias locais</AlertTitle>
          <AlertDescription>
            Aparência e segurança ainda não persistem no backend. O que aparecer como prévia local não deve ser considerado configuração real de produção.
          </AlertDescription>
        </Alert>
      )}

      {!IS_REAL_AUTH && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Badge variant="outline">Prévia local</Badge>
          <Button disabled>Atualizar</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <div className="relative min-w-0" data-settings-tab-rail>
          <TabsList
            ref={tabsListRef}
            aria-label="Seções de configurações"
            onScroll={updateTabRailEdges}
            className="flex h-auto min-h-12 w-full min-w-0 snap-x snap-proximity flex-nowrap justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-xl bg-muted/80 p-1 pb-2 scroll-px-1 scroll-smooth touch-pan-x motion-reduce:scroll-auto [scrollbar-width:thin]"
          >
            {SETTINGS_TAB_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.key}
                  value={item.key}
                  data-settings-tab={item.key}
                  className="min-h-11 shrink-0 snap-start gap-1.5 rounded-lg px-3"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {tabRailEdges.left ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl bg-gradient-to-r from-background via-background/85 to-transparent" />
          ) : null}
          {tabRailEdges.right ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-background via-background/85 to-transparent" />
          ) : null}
        </div>

        <TabsContent value="empresa">
          <CompanySettingsPanel targetUserId={targetUserId} targetUserName={selectedSettingsUser?.name} />
        </TabsContent>

        <TabsContent value="aparencia">
          <DocumentAppearancePanel targetUserId={targetUserId} />
        </TabsContent>

        <TabsContent value="modelos">
          <DocumentTemplatesPanel targetUserId={targetUserId} />
        </TabsContent>

        <TabsContent value="temas">
          <DocumentThemesPanel targetUserId={targetUserId} />
        </TabsContent>

        <TabsContent value="historico">
          <SettingsAuditPanel targetUserId={targetUserId} />
        </TabsContent>

        <TabsContent value="modulos">
          <ModulesPanel
            usersLoading={usersLoading}
            systemUsers={systemUsers}
            selectedModuleUserId={selectedModuleUserId}
            setSelectedModuleUserId={setSelectedModuleUserId}
            selectedModuleUser={selectedModuleUser}
            moduleSavingKey={moduleSavingKey}
            isSuperAdmin={isSuperAdmin}
            currentUserId={user?.id}
            selectedUserIsProtected={selectedModuleUserIsProtected}
            getModulesForUser={getModulesForUser}
            toggleModule={toggleModule}
          />
        </TabsContent>

        <TabsContent value="status">
          <StatusGlossarySection />
        </TabsContent>

        <TabsContent value="plano-contas">
          <PlanoDeContasPanel />
        </TabsContent>

        <TabsContent value="seguranca">
          <SecurityPanel
            isSuperAdmin={isSuperAdmin}
            usersLoading={usersLoading}
            systemUsers={systemUsers}
            selectedResetUserId={selectedResetUserId}
            setSelectedResetUserId={setSelectedResetUserId}
            resetConfirmationEmail={resetConfirmationEmail}
            setResetConfirmationEmail={setResetConfirmationEmail}
            resetSending={resetSending}
            selectedUserIsProtected={selectedResetUserIsProtected}
            handleAdminPasswordReset={handleAdminPasswordReset}
          />
        </TabsContent>

        <TabsContent value="usuarios">
          <UsersPanel userRole={user?.role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ModulesPanelProps {
  usersLoading: boolean;
  systemUsers: SystemUser[];
  selectedModuleUserId: string;
  setSelectedModuleUserId: (userId: string) => void;
  selectedModuleUser: SystemUser | null;
  moduleSavingKey: AppModuleKey | null;
  isSuperAdmin: boolean;
  currentUserId?: string;
  selectedUserIsProtected: boolean;
  getModulesForUser: (targetUser: SystemUser) => Record<AppModuleKey, boolean>;
  toggleModule: (moduleKey: AppModuleKey) => Promise<void>;
}

function ModulesPanel({
  usersLoading,
  systemUsers,
  selectedModuleUserId,
  setSelectedModuleUserId,
  selectedModuleUser,
  moduleSavingKey,
  isSuperAdmin,
  currentUserId,
  selectedUserIsProtected,
  getModulesForUser,
  toggleModule,
}: ModulesPanelProps) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
          <LayoutGrid className="h-5 w-5" />
          Controle de Módulos
          <Badge variant="outline">Supabase</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-3 pt-0 sm:space-y-5 sm:p-6 sm:pt-0">
        <Alert className="py-3">
          <Shield className="h-4 w-4" />
          <AlertTitle>Controle real por cliente/usuário</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">
            Apenas o Super Admin autorizado pode alterar módulos.
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <Label>Cliente / usuário</Label>
            <Select value={selectedModuleUserId} onValueChange={setSelectedModuleUserId} disabled={usersLoading || systemUsers.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={usersLoading ? 'Carregando usuários...' : 'Selecione um usuário'} />
              </SelectTrigger>
              <SelectContent>
                {systemUsers.map((systemUser) => (
                  <SelectItem key={systemUser.id} value={systemUser.id}>
                    {systemUser.name} · {systemUser.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5 sm:p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Módulos ativos</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl">
              {selectedModuleUser ? Object.values(getModulesForUser(selectedModuleUser)).filter(Boolean).length : 0}
              <span className="text-sm font-medium text-muted-foreground"> / {MODULE_DEFS.length}</span>
            </p>
          </div>
        </div>

        {usersLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando usuários e permissões...
          </div>
        ) : selectedModuleUser ? (
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            {MODULE_DEFS.map((module) => {
              const Icon = module.icon;
              const modules = getModulesForUser(selectedModuleUser);
              const isEnabled = modules[module.key];
              const isSaving = moduleSavingKey === module.key;
              const isAdminModuleLocked = module.key === 'admin' && selectedModuleUser.role !== 'ADMIN';
              const isOwnAdminLock = module.key === 'admin' && selectedModuleUser.id === currentUserId;

              return (
                <div key={module.key} className="flex min-w-0 items-start justify-between gap-2 rounded-lg border bg-background p-2.5 sm:gap-4 sm:p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-8 sm:w-8">
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold sm:text-sm">{module.label}</p>
                        <Badge variant={isEnabled ? 'default' : 'secondary'} className="mt-1 h-5 text-[10px]">
                          {isEnabled ? 'Ativo' : 'Bloqueado'}
                        </Badge>
                      </div>
                    </div>
                    <p className="hidden text-xs leading-relaxed text-muted-foreground sm:block">{module.description}</p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={isEnabled}
                      disabled={!isSuperAdmin || isSaving || isAdminModuleLocked || isOwnAdminLock || selectedUserIsProtected}
                      onCheckedChange={() => void toggleModule(module.key)}
                      aria-label={`${isEnabled ? 'Desativar' : 'Ativar'} módulo ${module.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum usuário encontrado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SecurityPanelProps {
  isSuperAdmin: boolean;
  usersLoading: boolean;
  systemUsers: SystemUser[];
  selectedResetUserId: string;
  setSelectedResetUserId: (userId: string) => void;
  resetConfirmationEmail: string;
  setResetConfirmationEmail: (email: string) => void;
  resetSending: boolean;
  selectedUserIsProtected: boolean;
  handleAdminPasswordReset: () => Promise<void>;
}

function SecurityPanel({
  isSuperAdmin,
  usersLoading,
  systemUsers,
  selectedResetUserId,
  setSelectedResetUserId,
  resetConfirmationEmail,
  setResetConfirmationEmail,
  resetSending,
  selectedUserIsProtected,
  handleAdminPasswordReset,
}: SecurityPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-5">
      {isSuperAdmin && (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
              <KeyRound className="h-5 w-5" />
              Reset de senha de cliente
              <Badge variant="outline">Supabase Auth</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:space-y-5 sm:p-6 sm:pt-0">
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-2">
                <Label>Cliente / usuário</Label>
                <Select value={selectedResetUserId} onValueChange={setSelectedResetUserId} disabled={usersLoading || systemUsers.length === 0 || resetSending}>
                  <SelectTrigger>
                    <SelectValue placeholder={usersLoading ? 'Carregando usuários...' : 'Selecione um usuário'} />
                  </SelectTrigger>
                  <SelectContent>
                    {systemUsers.map((systemUser) => (
                      <SelectItem key={systemUser.id} value={systemUser.id}>
                        {systemUser.name} · {systemUser.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Destino</p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {systemUsers.find((candidate) => candidate.id === selectedResetUserId)?.email ?? '—'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>E-mail alternativo de confirmação</Label>
              <Input
                type="email"
                value={resetConfirmationEmail}
                onChange={(event) => setResetConfirmationEmail(event.target.value)}
                onBlur={() => setResetConfirmationEmail(normalizeEmail(resetConfirmationEmail))}
                disabled={resetSending}
              />
            </div>

            <Button
              variant="destructive"
              onClick={() => void handleAdminPasswordReset()}
              disabled={resetSending || !selectedResetUserId || selectedUserIsProtected}
              className="w-full gap-2 sm:w-auto"
            >
              {resetSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Reenviar reset de senha
            </Button>
          </CardContent>
        </Card>
      )}

      <MfaSettingsCard />

      <Card>
        <CardHeader className="p-3.5 sm:p-6">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
            <Lock className="h-5 w-5" />
            Alterar Senha
            <Badge variant="outline">Indisponível</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3.5 pt-0 sm:max-w-md sm:space-y-4 sm:p-6 sm:pt-0">
          <Alert className="py-2.5 sm:py-3">
            <Shield className="h-4 w-4" />
            <AlertTitle className="text-sm">Fluxo ainda indisponível</AlertTitle>
            <AlertDescription className="hidden text-xs sm:block sm:text-sm">
              A troca de senha nesta tela ainda não conversa com o provedor real de autenticação.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Senha Atual</Label>
              <Input type="password" disabled placeholder="••••••••" className="h-9" />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Nova Senha</Label>
              <Input type="password" disabled placeholder="Mínimo 6 caracteres" className="h-9" />
            </div>
          </div>
          <Button disabled className="w-full sm:w-auto">
            <span className="sm:hidden">Em implementação</span>
            <span className="hidden sm:inline">Integração em implementação</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersPanel({ userRole }: { userRole?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Usuários do Sistema
          <Badge variant="outline">Admin real</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Gestão real centralizada no Admin</AlertTitle>
          <AlertDescription>
            Convites, resets, ativação e módulos ficam no módulo administrativo conectado ao Supabase.
          </AlertDescription>
        </Alert>
        {userRole === 'ADMIN' ? (
          <Button asChild className="gap-2">
            <Link to="/admin/usuarios">
              <Users className="h-4 w-4" />
              Abrir usuários no Admin
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Apenas administradores podem acessar a gestão real de usuários.</p>
        )}
      </CardContent>
    </Card>
  );
}
