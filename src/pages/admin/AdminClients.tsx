import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  AlertTriangle,
  KeyRound,
  LayoutGrid,
  Mail,
  Palette,
  Phone,
  Power,
  Search,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { AppModuleKey, SystemUser, UserRole, UserModuleOverrides } from '@/types';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { useRoleModuleConfig, useUserModuleOverrides } from '@/hooks/useRoleModuleConfig';
import { saveSystemUsers } from '@/services/auth/systemUsers';
import { saveUserModuleOverrides } from '@/services/auth/moduleAccess';
import { callAdminUsersFunction } from '@/api/supabase/admin-users';
import { useAuth } from '@/contexts/AuthContext';
import { isConfiguredSuperAdminEmail, isSuperAdmin as checkIsSuperAdmin } from '@/services/auth/superAdmin';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ALL_MODULES: { key: AppModuleKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clients', label: 'Clientes' },
  { key: 'notes', label: 'Notas de Entrada' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'closing', label: 'Fechamento' },
  { key: 'payables', label: 'Contas a Pagar' },
  { key: 'invoices', label: 'Nota Fiscal' },
  { key: 'settings', label: 'Configurações' },
  { key: 'admin', label: 'Admin' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  FINANCEIRO: 'Financeiro',
  PRODUCAO: 'Produção',
  RECEPCAO: 'Recepção',
};

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
const MASTER_MODULE_ACCESS: Record<AppModuleKey, boolean> = {
  dashboard: true,
  clients: true,
  notes: true,
  kanban: true,
  closing: true,
  payables: true,
  invoices: false,
  settings: true,
  admin: true,
};

type NewAccountKind = 'client' | 'master';

function buildUserId() {
  return `user-local-${Date.now()}`;
}

export default function AdminClients() {
  const { data: systemUsersData = [], isLoading } = useSystemUsersQuery();
  const { user: currentUser } = useAuth();
  const roleModuleConfig = useRoleModuleConfig();
  const storedOverrides = useUserModuleOverrides();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [systemUsers, setSystemUsers] = useState<SystemUser[]>(systemUsersData);
  const [userModuleOverrides, setUserModuleOverrides] = useState<UserModuleOverrides>(storedOverrides);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showModulesDialog, setShowModulesDialog] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('RECEPCAO');
  const [newAccountKind, setNewAccountKind] = useState<NewAccountKind>('client');

  useEffect(() => {
    setSystemUsers(systemUsersData);
  }, [systemUsersData]);

  useEffect(() => {
    setUserModuleOverrides(storedOverrides);
  }, [storedOverrides]);

  const persistSystemUsers = (nextUsers: SystemUser[]) => {
    setSystemUsers(nextUsers);
    if (!IS_REAL_AUTH) {
      saveSystemUsers(nextUsers);
    }
    queryClient.invalidateQueries({ queryKey: ['auth', 'system-users'] });
  };

  const persistUserOverrides = (nextOverrides: UserModuleOverrides) => {
    setUserModuleOverrides(nextOverrides);
    saveUserModuleOverrides(nextOverrides);
  };

  const filteredUsers = useMemo(() => {
    let list = systemUsers;
    if (search) {
      const query = search.toLowerCase();
      list = list.filter((user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query));
    }
    if (statusFilter === 'active') {
      list = list.filter((user) => user.isActive);
    }
    if (statusFilter === 'inactive') {
      list = list.filter((user) => !user.isActive);
    }
    return list;
  }, [search, statusFilter, systemUsers]);

  const activeCount = systemUsers.filter((user) => user.isActive).length;
  const inactiveCount = systemUsers.filter((user) => !user.isActive).length;
  const isSuperAdmin = checkIsSuperAdmin(currentUser);
  const canUseSensitiveAdminActions = !IS_REAL_AUTH || (currentUser?.role === 'ADMIN' && currentUser.isActive);
  const isCurrentUserMegaMaster = isSuperAdmin;
  const isMegaMasterUser = (targetUser: SystemUser) => isConfiguredSuperAdminEmail(targetUser.email);

  const getEffectiveModules = (user: SystemUser) => {
    return ALL_MODULES.reduce<Record<AppModuleKey, boolean>>((accumulator, module) => {
      if (IS_REAL_AUTH) {
        accumulator[module.key] = user.moduleAccess?.[module.key] ?? roleModuleConfig[user.role]?.[module.key] ?? false;
        return accumulator;
      }

      const roleAllowsModule = roleModuleConfig[user.role]?.[module.key] !== false;
      const userAllowsModule = userModuleOverrides[user.id]?.[module.key] !== false;
      accumulator[module.key] = roleAllowsModule && userAllowsModule;
      return accumulator;
    }, {} as Record<AppModuleKey, boolean>);
  };

  const handleToggleActive = async (userId: string) => {
    const targetUser = systemUsers.find((user) => user.id === userId);
    if (!targetUser) return;
    if (IS_REAL_AUTH && !canUseSensitiveAdminActions) {
      toast({
        title: 'Ação restrita a administradores',
        description: 'Ativar ou inativar usuários exige acesso administrativo.',
        variant: 'destructive',
      });
      return;
    }
    if (IS_REAL_AUTH && !isCurrentUserMegaMaster && isMegaMasterUser(targetUser)) {
      toast({
        title: 'Mega Master protegido',
        description: 'Usuários Master não podem alterar o status do Mega Master.',
        variant: 'destructive',
      });
      return;
    }

    setPendingAction(`active-${userId}`);
    try {
      if (IS_REAL_AUTH) {
        await callAdminUsersFunction({
          action: targetUser.isActive ? 'deactivate_user' : 'reactivate_user',
          userId,
        });
      }

      const nextUsers = systemUsers.map((user) =>
        user.id === userId ? { ...user, isActive: !user.isActive } : user,
      );
      const updatedUser = nextUsers.find((user) => user.id === userId);
      persistSystemUsers(nextUsers);
      toast({
        title: updatedUser?.isActive ? 'Usuário ativado' : 'Usuário desativado',
        description: updatedUser ? `${updatedUser.name} teve o acesso atualizado.` : undefined,
      });
    } catch (error) {
      toast({
        title: 'Não foi possível atualizar o usuário',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleResetPassword = async (userId: string) => {
    const user = systemUsers.find((candidate) => candidate.id === userId);
    if (!user) return;

    if (IS_REAL_AUTH && !canUseSensitiveAdminActions) {
      toast({
        title: 'Ação restrita a administradores',
        description: 'Reset de senha exige acesso administrativo.',
        variant: 'destructive',
      });
      return;
    }
    if (IS_REAL_AUTH && !isCurrentUserMegaMaster && isMegaMasterUser(user)) {
      toast({
        title: 'Mega Master protegido',
        description: 'Usuários Master não podem resetar a senha do Mega Master.',
        variant: 'destructive',
      });
      return;
    }

    setPendingAction(`reset-${userId}`);
    try {
      if (IS_REAL_AUTH) {
        await callAdminUsersFunction({
          action: 'reset_password',
          userId,
          email: user.email,
        });
        toast({
          title: 'E-mail de recuperação enviado',
          description: `${user.name} receberá o link para definir uma nova senha. Nenhuma senha foi exibida ou armazenada.`,
        });
      } else {
        toast({
          title: 'Reset de senha em desenvolvimento',
          description: `${user.name} continua usando a senha de desenvolvimento demo123 até o backend real entrar.`,
        });
      }
      setShowResetDialog(null);
    } catch (error) {
      toast({
        title: 'Não foi possível resetar a senha',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreateUser = async () => {
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!newName.trim() || !normalizedEmail) {
      toast({ title: 'Preencha nome e e-mail', variant: 'destructive' });
      return;
    }

    if (systemUsers.some((user) => user.email.toLowerCase() === normalizedEmail)) {
      toast({ title: 'E-mail já cadastrado', variant: 'destructive' });
      return;
    }

    const accountRole = newAccountKind === 'master' ? 'ADMIN' : newRole;

    if (accountRole === 'ADMIN' && IS_REAL_AUTH && !isCurrentUserMegaMaster) {
      toast({
        title: 'Ação restrita ao Mega Master',
        description: 'Somente Gabriel pode criar outro usuário Master.',
        variant: 'destructive',
      });
      return;
    }

    if (IS_REAL_AUTH && !canUseSensitiveAdminActions) {
      toast({
        title: 'Ação restrita a administradores',
        description: 'Criar usuários exige acesso administrativo.',
        variant: 'destructive',
      });
      return;
    }

    setPendingAction('create-user');
    try {
      const result = IS_REAL_AUTH
        ? await callAdminUsersFunction({
            action: accountRole === 'ADMIN' ? 'create_admin' : 'create_user',
            name: newName.trim(),
            email: normalizedEmail,
            phone: newPhone.trim(),
            role: accountRole,
            modules: accountRole === 'ADMIN' ? MASTER_MODULE_ACCESS : roleModuleConfig[accountRole],
          })
        : null;

      const createdId = result?.id_usuarios ?? buildUserId();

      const newUser: SystemUser = {
        id: createdId,
        name: newName.trim(),
        email: normalizedEmail,
        phone: newPhone.trim() || undefined,
        role: accountRole,
        isActive: true,
        createdAt: new Date().toISOString(),
        moduleAccess: IS_REAL_AUTH
          ? accountRole === 'ADMIN' ? MASTER_MODULE_ACCESS : roleModuleConfig[accountRole]
          : undefined,
      };

      persistSystemUsers([newUser, ...systemUsers]);
      toast({
        title: IS_REAL_AUTH ? 'Convite enviado por e-mail' : 'Usuário do sistema criado',
        description: IS_REAL_AUTH
          ? `${newUser.name} receberá o convite para criar a própria senha como ${accountRole === 'ADMIN' ? 'Master' : 'cliente/usuário operacional'}.`
          : `${newUser.name} já pode acessar o ambiente de desenvolvimento com a senha demo123.`,
      });
      setShowCreateDialog(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewRole('RECEPCAO');
      setNewAccountKind('client');
    } catch (error) {
      toast({
        title: 'Não foi possível criar o usuário',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const toggleUserModule = async (user: SystemUser, moduleKey: AppModuleKey) => {
    if (!IS_REAL_AUTH && roleModuleConfig[user.role]?.[moduleKey] === false) {
      return;
    }

    if (IS_REAL_AUTH && !canUseSensitiveAdminActions) {
      toast({
        title: 'Ação restrita a administradores',
        description: 'Alterar módulos exige acesso administrativo.',
        variant: 'destructive',
      });
      return;
    }
    if (IS_REAL_AUTH && !isCurrentUserMegaMaster && isMegaMasterUser(user)) {
      toast({
        title: 'Mega Master protegido',
        description: 'Usuários Master não podem alterar módulos do Mega Master.',
        variant: 'destructive',
      });
      return;
    }

    if (IS_REAL_AUTH) {
      const currentModules = getEffectiveModules(user);
      const nextModuleAccess = {
        ...currentModules,
        [moduleKey]: !currentModules[moduleKey],
      };

      try {
        setPendingAction(`modules-${user.id}`);
        await callAdminUsersFunction({
          action: 'set_modules',
          userId: user.id,
          modules: nextModuleAccess,
        });
        setSystemUsers((previous) =>
          previous.map((candidate) =>
            candidate.id === user.id ? { ...candidate, moduleAccess: nextModuleAccess } : candidate,
          ),
        );
        queryClient.setQueryData<SystemUser[]>(['auth', 'system-users'], (previous) =>
          previous?.map((candidate) =>
            candidate.id === user.id ? { ...candidate, moduleAccess: nextModuleAccess } : candidate,
          ) ?? previous,
        );
        queryClient.invalidateQueries({ queryKey: ['auth', 'system-users'] });
        toast({
          title: nextModuleAccess[moduleKey] ? 'Módulo ativado' : 'Módulo desativado',
          description: `${moduleKey === 'notes' ? 'Notas de Entrada' : ALL_MODULES.find((module) => module.key === moduleKey)?.label} atualizado para ${user.name}.`,
        });
      } catch (error) {
        toast({
          title: 'Não foi possível salvar módulos',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setPendingAction(null);
      }
      return;
    }

    const currentUserOverrides = userModuleOverrides[user.id] ?? {};
    const isCurrentlyEnabled = currentUserOverrides[moduleKey] !== false;
    const nextUserOverrides = {
      ...currentUserOverrides,
      [moduleKey]: isCurrentlyEnabled ? false : true,
    };

    if (nextUserOverrides[moduleKey] === true) {
      delete nextUserOverrides[moduleKey];
    }

    const nextOverrides = {
      ...userModuleOverrides,
      [user.id]: nextUserOverrides,
    };

    if (Object.keys(nextUserOverrides).length === 0) {
      delete nextOverrides[user.id];
    }

    persistUserOverrides(nextOverrides);
  };

  if (isLoading) {
    return (
      <LoadingScreen
        compact
        className="min-h-[48vh]"
        label="Carregando usuários"
        description="Buscando permissões, status e acessos do sistema."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Usuários do Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie contas internas, status de acesso e restrições adicionais por usuário.
          </p>
        </div>
        {canUseSensitiveAdminActions ? (
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2 rounded-xl h-11 px-5 shadow-lg shadow-primary/20">
            <UserPlus className="w-4 h-4" /> Novo Usuário
          </Button>
        ) : null}
      </div>

      {IS_REAL_AUTH && !canUseSensitiveAdminActions ? (
        <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ações administrativas restritas</AlertTitle>
          <AlertDescription>
            Você pode consultar usuários, mas criar contas, resetar senhas, ativar/inativar e alterar módulos exige acesso administrativo.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: systemUsers.length, color: 'text-foreground' },
          { label: 'Ativos', value: activeCount, color: 'text-success' },
          { label: 'Inativos', value: inactiveCount, color: 'text-destructive' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
              <p className={`text-2xl font-display font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((filter) => (
            <Button
              key={filter}
              variant={statusFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(filter)}
              className="rounded-xl"
            >
              {filter === 'all' ? 'Todos' : filter === 'active' ? 'Ativos' : 'Inativos'}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredUsers.map((user, index) => {
          const modules = getEffectiveModules(user);
          const activeModules = Object.values(modules).filter(Boolean).length;
          const isExpanded = expandedId === user.id;
          const isMutatingUser = pendingAction?.endsWith(user.id);
          const isProtectedMegaMaster = IS_REAL_AUTH && !isCurrentUserMegaMaster && isMegaMasterUser(user);

          return (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <Card className={cn('transition-all duration-200 hover:shadow-md', !user.isActive && 'opacity-60')}>
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 p-4">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0',
                        user.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {user.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{user.name}</p>
                        <Badge variant={user.isActive ? 'default' : 'secondary'} className="text-[10px] h-5">
                          {user.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {isMegaMasterUser(user) ? 'Mega Master' : user.role === 'ADMIN' ? 'Master' : ROLE_LABELS[user.role]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        {activeModules} módulos
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canUseSensitiveAdminActions ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={isMutatingUser || isProtectedMegaMaster}
                                onClick={() => setShowModulesDialog(user.id)}
                              >
                                <LayoutGrid className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Módulos</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => navigate(`/configuracoes?tab=modelos&user=${user.id}`)}
                              >
                                <Palette className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Modelos e cores</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={isMutatingUser || isProtectedMegaMaster}
                                onClick={() => setShowResetDialog(user.id)}
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Resetar Senha</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn('h-8 w-8', !user.isActive && 'text-success')}
                                disabled={isMutatingUser || isProtectedMegaMaster}
                                onClick={() => handleToggleActive(user.id)}
                              >
                                <Power className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{user.isActive ? 'Desativar' : 'Ativar'}</TooltipContent>
                          </Tooltip>
                        </>
                      ) : null}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      >
                        <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="border-t px-4 py-4 bg-muted/20"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="w-4 h-4" /> {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-4 h-4" /> {user.phone || 'Não informado'}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Shield className="w-4 h-4" /> Criado em: {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">MÓDULOS EFETIVOS</p>
                        <div className="flex flex-wrap gap-2">
                          {ALL_MODULES.map((module) => (
                            <Badge
                              key={module.key}
                              variant={modules[module.key] ? 'default' : 'outline'}
                              className={cn('text-xs', !modules[module.key] && 'opacity-50')}
                            >
                              {module.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum usuário encontrado</p>
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Novo Usuário do Sistema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do usuário" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="email@exemplo.com" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="(00) 00000-0000" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de conta</Label>
              <Select
                value={newAccountKind}
                onValueChange={(value) => {
                  const nextKind = value as NewAccountKind;
                  setNewAccountKind(nextKind);
                  if (nextKind === 'master') {
                    setNewRole('ADMIN');
                  } else if (newRole === 'ADMIN') {
                    setNewRole('RECEPCAO');
                  }
                }}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Cliente / usuário operacional</SelectItem>
                  {isCurrentUserMegaMaster || !IS_REAL_AUTH ? (
                    <SelectItem value="master">Master administrador</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Master tem acesso administrativo amplo. Apenas o Mega Master pode criar outro Master.
              </p>
            </div>

            {newAccountKind === 'client' ? (
              <div className="space-y-2">
                <Label>Perfil de Acesso</Label>
                <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECEPCAO">Recepção</SelectItem>
                    <SelectItem value="PRODUCAO">Produção</SelectItem>
                    <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                Este convite criará um usuário Master com acesso administrativo. Ele não poderá alterar o usuário Mega Master.
              </div>
            )}
            {IS_REAL_AUTH ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                O usuário será convidado pelo Supabase Auth. Nenhuma senha é criada ou exibida nesta tela.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} className="gap-2" disabled={pendingAction === 'create-user'}>
              <UserPlus className="w-4 h-4" /> Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showModulesDialog} onOpenChange={() => setShowModulesDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5" /> Restrições por Usuário
            </DialogTitle>
          </DialogHeader>
          {showModulesDialog && (() => {
            const user = systemUsers.find((candidate) => candidate.id === showModulesDialog);
            if (!user) {
              return null;
            }

            return (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Ajuste restrições adicionais para <strong>{user.name}</strong>. Módulos desligados no perfil base continuam bloqueados aqui.
                </p>
                <div className="space-y-3">
                  {ALL_MODULES.map((module) => {
                    const isEnabled = getEffectiveModules(user)[module.key];
                    const isAdminModuleLocked = module.key === 'admin' && user.role !== 'ADMIN';
                    const isOwnAdminLock = module.key === 'admin' && user.id === currentUser?.id;
                    const isDisabled = pendingAction === `modules-${user.id}` || isAdminModuleLocked || isOwnAdminLock;

                    return (
                      <div key={module.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div>
                          <span className="text-sm font-medium">{module.label}</span>
                          {isAdminModuleLocked && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">Admin só pode ser ligado para usuários administradores.</p>
                          )}
                          {isOwnAdminLock && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">Você não pode remover o próprio acesso admin por aqui.</p>
                          )}
                        </div>
                        <Switch
                          checked={isEnabled}
                          disabled={isDisabled}
                          onCheckedChange={() => void toggleUserModule(user, module.key)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button onClick={() => setShowModulesDialog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showResetDialog} onOpenChange={() => setShowResetDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" /> Resetar Senha
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja resetar a senha de <strong>{systemUsers.find((user) => user.id === showResetDialog)?.name}</strong>?
            {IS_REAL_AUTH ? (
              <span className="mt-2 block text-xs">
                O Supabase enviará um e-mail de recuperação diretamente para o usuário. Nenhuma senha será exibida ou salva.
              </span>
            ) : null}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!!showResetDialog && pendingAction === `reset-${showResetDialog}`}
              onClick={() => showResetDialog && void handleResetPassword(showResetDialog)}
            >
              Resetar Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
