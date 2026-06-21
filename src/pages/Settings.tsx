import { useEffect, useMemo, useState } from 'react';
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
import { isSuperAdmin as checkIsSuperAdmin } from '@/services/auth/superAdmin';
import { normalizeEmail } from '@/services/domain/textNormalization';
import type { AppModuleKey, SystemUser } from '@/types';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

const MODULE_DEFS: { key: AppModuleKey; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Indicadores operacionais do sistema.', icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', description: 'Cadastro e consulta de clientes.', icon: Users },
  { key: 'notes', label: 'Notas de Entrada', description: 'Ordens de serviço, edição, preview e PDF.', icon: FileText },
  { key: 'kanban', label: 'Kanban', description: 'Acompanhamento da produção por status.', icon: KanbanSquare },
  { key: 'closing', label: 'Fechamento', description: 'Geração de fechamento mensal.', icon: Calendar },
  { key: 'payables', label: 'Contas a Pagar', description: 'Financeiro, anexos e importação com IA.', icon: Wallet },
  { key: 'marketing', label: 'Crescimento', description: 'Site, leads e campanhas por tenant.', icon: TrendingUp },
  { key: 'settings', label: 'Configurações', description: 'Ajustes e prévias do sistema.', icon: SettingsIcon },
  { key: 'admin', label: 'Admin', description: 'Usuários e permissões administrativas.', icon: Shield },
];

const SETTINGS_TABS = new Set([
  'empresa',
  'aparencia',
  'modelos',
  'temas',
  'historico',
  'modulos',
  'status',
  'plano-contas',
  'seguranca',
  'usuarios',
]);

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

  const selectedSettingsUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedSettingsUserId) ?? user ?? null,
    [selectedSettingsUserId, systemUsers, user],
  );
  const selectedModuleUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedModuleUserId) ?? null,
    [selectedModuleUserId, systemUsers],
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
    const targetUser = systemUsers.find((candidate) => candidate.id === selectedResetUserId);
    if (!targetUser) {
      toast({ title: 'Selecione um cliente/usuário', variant: 'destructive' });
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-display font-bold">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Empresa, documentos e controles administrativos do Retiflow.
          </p>
        </div>
        {isSuperAdmin && (
          <div className="w-full space-y-2 lg:w-[360px]">
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
        <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto pb-1">
          <TabsTrigger value="empresa" className="shrink-0 gap-1.5"><Building2 className="h-4 w-4" /> Dados da empresa</TabsTrigger>
          <TabsTrigger value="aparencia" className="shrink-0 gap-1.5"><Palette className="h-4 w-4" /> Aparência</TabsTrigger>
          <TabsTrigger value="modelos" className="shrink-0 gap-1.5"><FileText className="h-4 w-4" /> Modelos</TabsTrigger>
          <TabsTrigger value="temas" className="shrink-0 gap-1.5"><Palette className="h-4 w-4" /> Temas</TabsTrigger>
          <TabsTrigger value="historico" className="shrink-0 gap-1.5"><FileClock className="h-4 w-4" /> Histórico</TabsTrigger>
          <TabsTrigger value="modulos" className="shrink-0 gap-1.5"><LayoutGrid className="h-4 w-4" /> Módulos</TabsTrigger>
          <TabsTrigger value="status" className="shrink-0 gap-1.5"><Workflow className="h-4 w-4" /> Status & Fluxo</TabsTrigger>
          <TabsTrigger value="plano-contas" className="shrink-0 gap-1.5"><Calculator className="h-4 w-4" /> Plano de contas</TabsTrigger>
          <TabsTrigger value="seguranca" className="shrink-0 gap-1.5"><Lock className="h-4 w-4" /> Segurança</TabsTrigger>
          <TabsTrigger value="usuarios" className="shrink-0 gap-1.5"><Users className="h-4 w-4" /> Usuários</TabsTrigger>
        </TabsList>

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

        <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
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
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
                      disabled={!isSuperAdmin || isSaving || isAdminModuleLocked || isOwnAdminLock}
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

            <Button variant="destructive" onClick={() => void handleAdminPasswordReset()} disabled={resetSending || !selectedResetUserId} className="w-full gap-2 sm:w-auto">
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-3">
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
