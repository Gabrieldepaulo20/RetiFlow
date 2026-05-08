import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import MfaSettingsCard from '@/components/auth/MfaSettingsCard';
import { DEFAULT_ROLE_MODULE_CONFIG } from '@/services/auth/moduleAccess';
import { Wrench, Building2, Users, Palette, Lock, Upload, Check, FileText, Eye, LayoutGrid, LayoutDashboard, KanbanSquare, Calendar, Settings as SettingsIcon, Info, Loader2, Search, Wallet, Shield, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { lookupCnpj, stripDigits } from '@/services/domain/customers';
import { normalizeEmail, normalizeWhitespace, onlyDigits, toTitleCasePtBr } from '@/services/domain/textNormalization';
import { useSystemUsersQuery } from '@/hooks/useSystemUsersQuery';
import { callAdminUsersFunction } from '@/api/supabase/admin-users';
import { isSuperAdmin as checkIsSuperAdmin } from '@/services/auth/superAdmin';
import {
  DEFAULT_USER_TEMPLATE_SETTINGS,
  getConfiguracaoModeloUsuario,
  upsertConfiguracaoModeloUsuario,
  type ClosingTemplateMode,
  type OsTemplateMode,
} from '@/api/supabase/modelos';
import {
  DEFAULT_USER_COMPANY_SETTINGS,
  getConfiguracaoEmpresaUsuario,
  upsertConfiguracaoEmpresaUsuario,
  type UserCompanySettings,
} from '@/api/supabase/empresa';
import type { AppModuleKey, IntakeNote, IntakeService, Client, SystemUser } from '@/types';

const OSPreviewModal = lazy(() => import('@/components/OSPreviewModal'));

const THEME_PRESETS = [
  { name: 'Padrão', primary: '192 70% 38%', accent: '165 55% 40%', sidebar: '215 32% 13%' },
  { name: 'Azul Royal', primary: '220 70% 50%', accent: '200 60% 45%', sidebar: '220 35% 12%' },
  { name: 'Verde Floresta', primary: '150 55% 35%', accent: '130 50% 45%', sidebar: '150 30% 12%' },
  { name: 'Grafite', primary: '220 15% 45%', accent: '210 20% 50%', sidebar: '220 20% 10%' },
  { name: 'Bordô', primary: '350 60% 42%', accent: '20 70% 50%', sidebar: '350 30% 12%' },
  { name: 'Laranja', primary: '25 90% 50%', accent: '35 85% 55%', sidebar: '25 30% 12%' },
];

const DOC_ACCENT_PRESETS = [
  { name: 'Azul', color: '#1a7a8a' },
  { name: 'Grafite', color: '#4a5568' },
  { name: 'Verde', color: '#2d7d46' },
  { name: 'Bordô', color: '#8b2252' },
  { name: 'Marinho', color: '#1e3a5f' },
  { name: 'Preto', color: '#1a1a1a' },
  { name: 'Laranja', color: '#c05621' },
  { name: 'Roxo', color: '#6b46c1' },
];

const mockClient: Client = { id: 'mock', name: 'Auto Peças Silva Ltda', docType: 'CNPJ', docNumber: '12.345.678/0001-90', phone: '(11) 3456-7890', email: 'contato@autopecassilva.com.br', address: 'Rua das Indústrias, 450', city: 'São Paulo', state: 'SP', notes: '', isActive: true, createdAt: '' };
const mockNote: IntakeNote = { id: 'mock', number: 'OS-99', clientId: 'mock', createdAt: new Date().toISOString(), createdByUserId: '', status: 'EM_EXECUCAO', engineType: 'Cabeçote DOHC', vehicleModel: 'Civic 2.0 16v', plate: 'ABC-1234', complaint: '', observations: 'Cliente solicita urgência na entrega.', totalServices: 1200, totalProducts: 350, totalAmount: 1550, updatedAt: new Date().toISOString() };
const mockServicesShort: IntakeService[] = [
  { id: 's1', noteId: 'mock', name: 'Retífica de cabeçote', description: '', price: 380, quantity: 1, subtotal: 380 },
  { id: 's2', noteId: 'mock', name: 'Plaqueamento de superfície', description: '', price: 220, quantity: 1, subtotal: 220 },
  { id: 's3', noteId: 'mock', name: 'Teste de pressão', description: '', price: 160, quantity: 1, subtotal: 160 },
  { id: 's4', noteId: 'mock', name: 'Troca de guias', description: '', price: 290, quantity: 1, subtotal: 290 },
  { id: 's5', noteId: 'mock', name: 'Junta do cabeçote', description: '', price: 95, quantity: 2, subtotal: 190 },
];
const mockServicesLong: IntakeService[] = [
  ...mockServicesShort,
  { id: 's6', noteId: 'mock', name: 'Assentamento de válvulas', description: '', price: 190, quantity: 1, subtotal: 190 },
  { id: 's7', noteId: 'mock', name: 'Usinagem de superfície', description: '', price: 340, quantity: 1, subtotal: 340 },
  { id: 's8', noteId: 'mock', name: 'Brunimento', description: '', price: 180, quantity: 1, subtotal: 180 },
  { id: 's9', noteId: 'mock', name: 'Solda TIG em alumínio', description: '', price: 270, quantity: 1, subtotal: 270 },
];

// Module definitions for RBAC
const MODULE_DEFS: { key: AppModuleKey; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Indicadores operacionais do sistema.', icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', description: 'Cadastro e consulta de clientes.', icon: Users },
  { key: 'notes', label: 'Notas de Entrada', description: 'Ordens de serviço, edição, preview e PDF.', icon: FileText },
  { key: 'kanban', label: 'Kanban', description: 'Acompanhamento da produção por status.', icon: KanbanSquare },
  { key: 'closing', label: 'Fechamento', description: 'Geração de fechamento mensal.', icon: Calendar },
  { key: 'payables', label: 'Contas a Pagar', description: 'Financeiro, anexos e importação com IA.', icon: Wallet },
  { key: 'settings', label: 'Configurações', description: 'Ajustes e prévias do sistema.', icon: SettingsIcon },
  { key: 'admin', label: 'Admin', description: 'Usuários e permissões administrativas.', icon: Shield },
];

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
const COMPANY_SETTINGS_CONNECTED = IS_REAL_AUTH;
const APPEARANCE_SETTINGS_CONNECTED = false;
const SECURITY_SETTINGS_CONNECTED = false;
const SHOW_APPEARANCE_SETTINGS = !IS_REAL_AUTH || APPEARANCE_SETTINGS_CONNECTED;
const SHOW_PASSWORD_SETTINGS = !IS_REAL_AUTH || SECURITY_SETTINGS_CONNECTED;
const SETTINGS_TABS = new Set([
  'empresa',
  'modulos',
  ...(SHOW_APPEARANCE_SETTINGS ? ['aparencia'] : []),
  'modelos',
  'seguranca',
  'usuarios',
]);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'empresa';
  const templateUserFromUrl = searchParams.get('user') ?? '';
  const activeTab = SETTINGS_TABS.has(tabFromUrl) ? tabFromUrl : 'empresa';
  const { data: systemUsers = [], isLoading: usersLoading } = useSystemUsersQuery();
  const isSuperAdmin = checkIsSuperAdmin(user);

  // Company
  const [companyName, setCompanyName] = useState(DEFAULT_USER_COMPANY_SETTINGS.razaoSocial);
  const [fantasyName, setFantasyName] = useState(DEFAULT_USER_COMPANY_SETTINGS.nomeFantasia);
  const [cnpj, setCnpj] = useState(DEFAULT_USER_COMPANY_SETTINGS.cnpj);
  const [ie, setIe] = useState(DEFAULT_USER_COMPANY_SETTINGS.inscricaoEstadual);
  const [im, setIm] = useState(DEFAULT_USER_COMPANY_SETTINGS.inscricaoMunicipal);
  const [companyAddress, setCompanyAddress] = useState(DEFAULT_USER_COMPANY_SETTINGS.endereco);
  const [companyCity, setCompanyCity] = useState(DEFAULT_USER_COMPANY_SETTINGS.cidade);
  const [companyState, setCompanyState] = useState(DEFAULT_USER_COMPANY_SETTINGS.estado);
  const [companyCep, setCompanyCep] = useState(DEFAULT_USER_COMPANY_SETTINGS.cep);
  const [companyPhone, setCompanyPhone] = useState(DEFAULT_USER_COMPANY_SETTINGS.telefone);
  const [companyEmail, setCompanyEmail] = useState(DEFAULT_USER_COMPANY_SETTINGS.email);
  const [companySite, setCompanySite] = useState(DEFAULT_USER_COMPANY_SETTINGS.site);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedResetUserId, setSelectedResetUserId] = useState('');
  const [resetConfirmationEmail, setResetConfirmationEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);

  // Theme
  const [selectedTheme, setSelectedTheme] = useState(0);
  const [showA5Preview, setShowA5Preview] = useState(false);
  const [showA4Preview, setShowA4Preview] = useState(false);
  const [selectedTemplateUserId, setSelectedTemplateUserId] = useState('');
  const [templateDraft, setTemplateDraft] = useState({
    osModelo: DEFAULT_USER_TEMPLATE_SETTINGS.osModelo,
    corDocumento: DEFAULT_USER_TEMPLATE_SETTINGS.corDocumento,
    fechamentoModelo: DEFAULT_USER_TEMPLATE_SETTINGS.fechamentoModelo,
    corFechamento: DEFAULT_USER_TEMPLATE_SETTINGS.corFechamento,
  });
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Modules
  const [selectedModuleUserId, setSelectedModuleUserId] = useState('');
  const [moduleSavingKey, setModuleSavingKey] = useState<AppModuleKey | null>(null);
  const selectedModuleUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedModuleUserId) ?? null,
    [selectedModuleUserId, systemUsers],
  );

  const applyCompanySettings = (settings: UserCompanySettings) => {
    setCompanyName(settings.razaoSocial);
    setFantasyName(settings.nomeFantasia);
    setCnpj(settings.cnpj);
    setIe(settings.inscricaoEstadual);
    setIm(settings.inscricaoMunicipal);
    setCompanyAddress(settings.endereco);
    setCompanyCity(settings.cidade);
    setCompanyState(settings.estado);
    setCompanyCep(settings.cep);
    setCompanyPhone(settings.telefone);
    setCompanyEmail(settings.email);
    setCompanySite(settings.site);
  };

  const buildCompanyPayload = () => ({
    razaoSocial: toTitleCasePtBr(companyName),
    nomeFantasia: toTitleCasePtBr(fantasyName),
    cnpj: onlyDigits(cnpj),
    inscricaoEstadual: normalizeWhitespace(ie),
    inscricaoMunicipal: normalizeWhitespace(im),
    endereco: toTitleCasePtBr(companyAddress),
    cidade: toTitleCasePtBr(companyCity),
    estado: normalizeWhitespace(companyState).toUpperCase(),
    cep: onlyDigits(companyCep),
    telefone: onlyDigits(companyPhone),
    email: normalizeEmail(companyEmail),
    site: normalizeWhitespace(companySite),
  });

  useEffect(() => {
    if (!IS_REAL_AUTH) return;
    let active = true;
    setCompanyLoading(true);
    getConfiguracaoEmpresaUsuario()
      .then((settings) => {
        if (!active) return;
        applyCompanySettings(settings);
      })
      .catch((error) => {
        if (!active) return;
        toast({
          title: 'Não foi possível carregar a empresa',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (active) setCompanyLoading(false);
      });
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    if (!selectedModuleUserId && systemUsers.length > 0) {
      setSelectedModuleUserId(systemUsers[0].id);
    }
  }, [selectedModuleUserId, systemUsers]);

  useEffect(() => {
    if (!selectedResetUserId && systemUsers.length > 0) {
      setSelectedResetUserId(systemUsers[0].id);
    }
  }, [selectedResetUserId, systemUsers]);

  useEffect(() => {
    if (isSuperAdmin && templateUserFromUrl && systemUsers.some((candidate) => candidate.id === templateUserFromUrl)) {
      if (selectedTemplateUserId === templateUserFromUrl) return;
      setSelectedTemplateUserId(templateUserFromUrl);
      return;
    }
    if (selectedTemplateUserId || systemUsers.length === 0) return;
    const ownUser = user ? systemUsers.find((candidate) => candidate.id === user.id) : null;
    setSelectedTemplateUserId((isSuperAdmin ? systemUsers[0] : ownUser ?? systemUsers[0]).id);
  }, [isSuperAdmin, selectedTemplateUserId, systemUsers, templateUserFromUrl, user]);

  const selectedTemplateUser = useMemo(
    () => systemUsers.find((candidate) => candidate.id === selectedTemplateUserId) ?? null,
    [selectedTemplateUserId, systemUsers],
  );

  useEffect(() => {
    if (!selectedTemplateUserId) return;
    if (!IS_REAL_AUTH) {
      setTemplateDraft({
        osModelo: DEFAULT_USER_TEMPLATE_SETTINGS.osModelo,
        corDocumento: DEFAULT_USER_TEMPLATE_SETTINGS.corDocumento,
        fechamentoModelo: DEFAULT_USER_TEMPLATE_SETTINGS.fechamentoModelo,
        corFechamento: DEFAULT_USER_TEMPLATE_SETTINGS.corFechamento,
      });
      return;
    }
    let active = true;
    setTemplateLoading(true);
    getConfiguracaoModeloUsuario(selectedTemplateUserId)
      .then((settings) => {
        if (!active) return;
        setTemplateDraft({
          osModelo: settings.osModelo,
          corDocumento: settings.corDocumento,
          fechamentoModelo: settings.fechamentoModelo,
          corFechamento: settings.corFechamento,
        });
      })
      .catch((error) => {
        if (!active) return;
        toast({
          title: 'Não foi possível carregar os modelos',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (active) setTemplateLoading(false);
      });
    return () => { active = false; };
  }, [selectedTemplateUserId, toast]);

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
        description: 'Somente o admin master pode alterar módulos de usuários.',
        variant: 'destructive',
      });
      return;
    }

    const currentModules = getModulesForUser(selectedModuleUser);
    const nextModules = {
      ...currentModules,
      [moduleKey]: !currentModules[moduleKey],
    };

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
      toast({
        title: nextModules[moduleKey] ? 'Módulo ativado' : 'Módulo desativado',
        description: `${MODULE_DEFS.find((module) => module.key === moduleKey)?.label} atualizado para ${selectedModuleUser.name}.`,
      });
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

  const handleSaveTemplateSettings = async () => {
    if (!selectedTemplateUserId) {
      toast({ title: 'Selecione um cliente/usuário', variant: 'destructive' });
      return;
    }
    if (!HEX_COLOR_PATTERN.test(templateDraft.corDocumento) || !HEX_COLOR_PATTERN.test(templateDraft.corFechamento)) {
      toast({
        title: 'Cor inválida',
        description: 'Use cores no formato hexadecimal, por exemplo #1a7a8a.',
        variant: 'destructive',
      });
      return;
    }
    if (!IS_REAL_AUTH) {
      toast({
        title: 'Prévia local atualizada',
        description: 'Em modo de desenvolvimento, modelos não são persistidos no Supabase.',
      });
      return;
    }

    setTemplateSaving(true);
    try {
      const settings = await upsertConfiguracaoModeloUsuario({
        idUsuarios: selectedTemplateUserId,
        osModelo: templateDraft.osModelo,
        corDocumento: templateDraft.corDocumento,
        fechamentoModelo: templateDraft.fechamentoModelo,
        corFechamento: templateDraft.corFechamento,
      });
      setTemplateDraft({
        osModelo: settings.osModelo,
        corDocumento: settings.corDocumento,
        fechamentoModelo: settings.fechamentoModelo,
        corFechamento: settings.corFechamento,
      });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'templates'] });
      toast({
        title: 'Modelos atualizados',
        description: selectedTemplateUser
          ? `Configurações salvas para ${selectedTemplateUser.name}.`
          : 'Configurações salvas no Supabase.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar os modelos',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setLogoPreview(reader.result as string); toast({ title: 'Logo carregada apenas como prévia local' }); };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCompanySettings = async () => {
    if (!IS_REAL_AUTH) {
      toast({
        title: 'Prévia local',
        description: 'Em modo de desenvolvimento, os dados da empresa não são persistidos no Supabase.',
      });
      return;
    }

    if (stripDigits(cnpj).length !== 14) {
      toast({
        title: 'CNPJ incompleto',
        description: 'Informe um CNPJ com 14 dígitos antes de atualizar.',
        variant: 'destructive',
      });
      return;
    }

    setCompanySaving(true);
    try {
      const saved = await upsertConfiguracaoEmpresaUsuario(buildCompanyPayload());
      applyCompanySettings(saved);
      toast({
        title: 'Empresa atualizada',
        description: 'Dados salvos no Supabase e mantidos após recarregar a página.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar a empresa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCompanySaving(false);
    }
  };

  const handleCompanyCnpjLookup = async () => {
    if (stripDigits(cnpj).length !== 14) {
      toast({
        title: 'CNPJ incompleto',
        description: 'Informe um CNPJ com 14 dígitos para consultar os dados da empresa.',
        variant: 'destructive',
      });
      return;
    }

    setCnpjLoading(true);
    try {
      const company = await lookupCnpj(cnpj);
      const nextCompany = {
        razaoSocial: company.name || companyName || DEFAULT_USER_COMPANY_SETTINGS.razaoSocial,
        nomeFantasia: company.tradeName || fantasyName || DEFAULT_USER_COMPANY_SETTINGS.nomeFantasia,
        cnpj: onlyDigits(cnpj),
        inscricaoEstadual: normalizeWhitespace(ie),
        inscricaoMunicipal: normalizeWhitespace(im),
        email: normalizeEmail(company.email || companyEmail || DEFAULT_USER_COMPANY_SETTINGS.email),
        telefone: onlyDigits(company.phone || companyPhone || DEFAULT_USER_COMPANY_SETTINGS.telefone),
        cep: onlyDigits(company.cep || companyCep),
        endereco: [
        company.address,
        company.addressNumber,
        company.district,
        ].filter(Boolean).join(', ') || companyAddress,
        cidade: toTitleCasePtBr(company.city || companyCity),
        estado: normalizeWhitespace(company.state || companyState).toUpperCase(),
        site: normalizeWhitespace(companySite),
      };
      setCompanyName(nextCompany.razaoSocial);
      setFantasyName(nextCompany.nomeFantasia);
      setCompanyEmail(nextCompany.email);
      setCompanyPhone(nextCompany.telefone);
      setCompanyCep(nextCompany.cep);
      setCompanyAddress(nextCompany.endereco);
      setCompanyCity(nextCompany.cidade);
      setCompanyState(nextCompany.estado);

      if (IS_REAL_AUTH) {
        const saved = await upsertConfiguracaoEmpresaUsuario(nextCompany);
        applyCompanySettings(saved);
        toast({
          title: 'Dados da empresa preenchidos e salvos',
          description: 'As informações serão mantidas ao recarregar a página.',
        });
        return;
      }

      toast({ title: 'Dados da GAWI preenchidos pelo CNPJ.' });
    } catch (error) {
      toast({
        title: 'Não foi possível consultar o CNPJ',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCnpjLoading(false);
    }
  };

  const handlePasswordChange = () => {
    if (!currentPassword) { toast({ title: 'Informe a senha atual', variant: 'destructive' }); return; }
    if (newPassword.length < 6) { toast({ title: 'Mínimo 6 caracteres', variant: 'destructive' }); return; }
    if (newPassword !== confirmPassword) { toast({ title: 'Senhas não coincidem', variant: 'destructive' }); return; }
    toast({ title: 'Senha alterada!' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
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

  const applyTheme = (idx: number) => {
    setSelectedTheme(idx);
    const t = THEME_PRESETS[idx];
    document.documentElement.style.setProperty('--primary', t.primary);
    document.documentElement.style.setProperty('--ring', t.primary);
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--sidebar-background', t.sidebar);
    document.documentElement.style.setProperty('--sidebar-primary', t.primary);
    toast({ title: `Prévia local do tema "${t.name}" aplicada` });
  };

  const handleTabChange = (tab: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tab);
    setSearchParams(nextParams, { replace: true });
  };

  const handleTemplateUserChange = (userId: string) => {
    setSelectedTemplateUserId(userId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'modelos');
    nextParams.set('user', userId);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-bold">Configurações</h1>

      {!IS_REAL_AUTH && (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Configurações reais e prévias locais</AlertTitle>
        <AlertDescription>
          Aparência e segurança ainda não persistem no backend. O que aparecer como prévia local não deve ser considerado configuração real de produção;
          empresa, módulos e modelos já salvam no Supabase quando o sistema está em modo real.
        </AlertDescription>
      </Alert>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="empresa" className="shrink-0 text-xs sm:text-sm"><Building2 className="w-4 h-4 mr-1.5 hidden sm:inline" /> Empresa</TabsTrigger>
          <TabsTrigger value="modulos" className="shrink-0 text-xs sm:text-sm"><LayoutGrid className="w-4 h-4 mr-1.5 hidden sm:inline" /> Módulos</TabsTrigger>
          {SHOW_APPEARANCE_SETTINGS && (
            <TabsTrigger value="aparencia" className="shrink-0 text-xs sm:text-sm"><Palette className="w-4 h-4 mr-1.5 hidden sm:inline" /> Aparência</TabsTrigger>
          )}
          <TabsTrigger value="modelos" className="shrink-0 text-xs sm:text-sm"><FileText className="w-4 h-4 mr-1.5 hidden sm:inline" /> Modelos</TabsTrigger>
          <TabsTrigger value="seguranca" className="shrink-0 text-xs sm:text-sm"><Lock className="w-4 h-4 mr-1.5 hidden sm:inline" /> Segurança</TabsTrigger>
          <TabsTrigger value="usuarios" className="shrink-0 text-xs sm:text-sm"><Users className="w-4 h-4 mr-1.5 hidden sm:inline" /> Usuários</TabsTrigger>
        </TabsList>

        {/* EMPRESA */}
        <TabsContent value="empresa">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" /> Dados da Empresa
                <Badge variant="outline">{COMPANY_SETTINGS_CONNECTED ? 'Supabase' : 'Prévia local'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>{COMPANY_SETTINGS_CONNECTED ? 'Persistência real conectada' : 'Prévia local'}</AlertTitle>
                <AlertDescription>
                  {COMPANY_SETTINGS_CONNECTED
                    ? 'Informe o CNPJ para buscar os dados públicos da empresa. Ao buscar ou atualizar, as informações ficam salvas no Supabase e voltam após recarregar a página.'
                    : 'Esta seção ainda serve apenas para pré-visualização no navegador atual. O botão de salvar fica desabilitado em modo mock/desenvolvimento.'}
                </AlertDescription>
              </Alert>
              {companyLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando dados da empresa...
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Razão Social</Label><Input value={companyName} onChange={e => setCompanyName(e.target.value)} onBlur={() => setCompanyName(toTitleCasePtBr(companyName))} className="mt-1.5" /></div>
                <div><Label>Nome Fantasia</Label><Input value={fantasyName} onChange={e => setFantasyName(e.target.value)} onBlur={() => setFantasyName(toTitleCasePtBr(fantasyName))} className="mt-1.5" /></div>
                <div>
                  <Label>CNPJ</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input value={cnpj} onChange={e => setCnpj(e.target.value.replace(/[^\d./-]/g, ''))} onBlur={() => setCnpj(onlyDigits(cnpj))} />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 gap-2"
                      disabled={cnpjLoading}
                      onClick={() => void handleCompanyCnpjLookup()}
                    >
                      {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Buscar
                    </Button>
                  </div>
                </div>
                <div><Label>Inscrição Estadual</Label><Input value={ie} onChange={e => setIe(e.target.value)} onBlur={() => setIe(normalizeWhitespace(ie))} className="mt-1.5" /></div>
                <div><Label>Inscrição Municipal</Label><Input value={im} onChange={e => setIm(e.target.value)} onBlur={() => setIm(normalizeWhitespace(im))} className="mt-1.5" /></div>
              </div>

              <Separator />
              <p className="text-sm font-semibold text-foreground">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Label>Endereço</Label><Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} onBlur={() => setCompanyAddress(toTitleCasePtBr(companyAddress))} className="mt-1.5" /></div>
                <div><Label>Cidade</Label><Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} onBlur={() => setCompanyCity(toTitleCasePtBr(companyCity))} className="mt-1.5" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Estado</Label><Input value={companyState} onChange={e => setCompanyState(e.target.value.toUpperCase().slice(0, 2))} className="mt-1.5" /></div>
                  <div><Label>CEP</Label><Input value={companyCep} onChange={e => setCompanyCep(onlyDigits(e.target.value).slice(0, 8))} className="mt-1.5" /></div>
                </div>
              </div>

              <Separator />
              <p className="text-sm font-semibold text-foreground">Contato</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label>Telefone</Label><Input value={companyPhone} onChange={e => setCompanyPhone(onlyDigits(e.target.value).slice(0, 11))} className="mt-1.5" /></div>
                <div><Label>E-mail</Label><Input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} onBlur={() => setCompanyEmail(normalizeEmail(companyEmail))} className="mt-1.5" /></div>
                <div><Label>Site</Label><Input value={companySite} onChange={e => setCompanySite(e.target.value)} onBlur={() => setCompanySite(normalizeWhitespace(companySite))} className="mt-1.5" /></div>
              </div>

              <Separator />
              <div>
                <Label className="mb-3 block">Logo da Empresa</Label>
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                    {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" /> : <Wrench className="w-8 h-8 text-muted-foreground/40" />}
                  </div>
                  <div className="space-y-2">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"><Upload className="w-4 h-4" /> Enviar logo</div>
                    </label>
                    <p className="text-[11px] text-muted-foreground">PNG, JPG ou SVG. Prévia local; não salva no backend.</p>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => void handleSaveCompanySettings()}
                disabled={!COMPANY_SETTINGS_CONNECTED || companySaving || companyLoading}
                aria-disabled={!COMPANY_SETTINGS_CONNECTED || companySaving || companyLoading}
                className="gap-2"
              >
                {companySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Atualizar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MÓDULOS */}
        <TabsContent value="modulos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5" /> Controle de Módulos por Usuário
                <Badge variant="outline">Supabase</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Controle real por cliente/usuário</AlertTitle>
                <AlertDescription>
                  Escolha um usuário abaixo e ligue ou desligue módulos específicos. A alteração é salva no Supabase
                  pela função administrativa segura e passa a valer no próximo carregamento da sessão desse usuário.
                </AlertDescription>
              </Alert>

              {!isSuperAdmin && (
                <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Ação restrita ao admin master</AlertTitle>
                  <AlertDescription>
                    Você pode visualizar os acessos, mas apenas o Super Admin autorizado pode alterar módulos.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-2">
                  <Label>Cliente / usuário</Label>
                  <Select value={selectedModuleUserId} onValueChange={setSelectedModuleUserId} disabled={usersLoading || systemUsers.length === 0}>
                    <SelectTrigger className="h-11">
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

                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Módulos ativos</p>
                  <p className="mt-1 text-2xl font-display font-bold">
                    {selectedModuleUser ? Object.values(getModulesForUser(selectedModuleUser)).filter(Boolean).length : 0}
                    <span className="text-sm font-medium text-muted-foreground"> / {MODULE_DEFS.length}</span>
                  </p>
                </div>
              </div>

              {usersLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando usuários e permissões...
                </div>
              ) : selectedModuleUser ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {MODULE_DEFS.map((module) => {
                    const Icon = module.icon;
                    const modules = getModulesForUser(selectedModuleUser);
                    const isEnabled = modules[module.key];
                    const isSaving = moduleSavingKey === module.key;
                    const isAdminModuleLocked = module.key === 'admin' && selectedModuleUser.role !== 'ADMIN';
                    const isOwnAdminLock = module.key === 'admin' && selectedModuleUser.id === user?.id;

                    return (
                      <div
                        key={module.key}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background p-4 shadow-sm"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{module.label}</p>
                              <Badge variant={isEnabled ? 'default' : 'secondary'} className="mt-1 h-5 text-[10px]">
                                {isEnabled ? 'Ativo' : 'Bloqueado'}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{module.description}</p>
                          {isAdminModuleLocked && (
                            <p className="text-[11px] text-muted-foreground">
                              O módulo Admin só pode ser ligado para usuários administradores.
                            </p>
                          )}
                          {isOwnAdminLock && (
                            <p className="text-[11px] text-muted-foreground">
                              Você não pode remover o próprio acesso administrativo por esta tela.
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          <Switch
                            checked={isEnabled}
                            disabled={!isSuperAdmin || isSaving || isAdminModuleLocked || isOwnAdminLock}
                            onCheckedChange={() => void toggleModule(module.key)}
                            aria-label={`${isEnabled ? 'Desativar' : 'Ativar'} módulo ${module.label} para ${selectedModuleUser.name}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum usuário encontrado para configurar módulos.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* APARÊNCIA */}
        {SHOW_APPEARANCE_SETTINGS && (
        <TabsContent value="aparencia">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" /> Tema e Cores
                <Badge variant="outline">Prévia local</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!APPEARANCE_SETTINGS_CONNECTED && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Prévia local de aparência</AlertTitle>
                  <AlertDescription>
                    A troca de tema abaixo altera apenas a sessão atual do navegador. Ainda não salva preferência no backend.
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-sm text-muted-foreground">Teste uma prévia visual do tema do sistema.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEME_PRESETS.map((t, i) => (
                  <button key={i} onClick={() => applyTheme(i)} className={`relative p-4 rounded-xl border-2 transition-all text-left hover:shadow-md ${selectedTheme === i ? 'border-primary shadow-md' : 'border-border hover:border-primary/30'}`}>
                    {selectedTheme === i && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check className="w-3 h-3 text-primary-foreground" /></div>}
                    <div className="flex gap-1.5 mb-2">
                      <div className="w-6 h-6 rounded-full" style={{ background: `hsl(${t.primary})` }} />
                      <div className="w-6 h-6 rounded-full" style={{ background: `hsl(${t.accent})` }} />
                      <div className="w-6 h-6 rounded-full" style={{ background: `hsl(${t.sidebar})` }} />
                    </div>
                    <p className="text-sm font-semibold">{t.name}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* MODELOS */}
        <TabsContent value="modelos">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Modelos do Cliente
                  <Badge variant="outline">Supabase</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertTitle>Modelos reais por cliente/usuário</AlertTitle>
                  <AlertDescription>
                    Cada cliente pode ter seu próprio modelo e cores. No login master você seleciona o cliente e vê exatamente
                    o padrão que ele está usando no momento.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <Label>Cliente / usuário</Label>
                    <Select
                      value={selectedTemplateUserId}
                      onValueChange={handleTemplateUserChange}
                      disabled={usersLoading || systemUsers.length === 0 || !isSuperAdmin}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder={usersLoading ? 'Carregando clientes...' : 'Selecione um cliente'} />
                      </SelectTrigger>
                      <SelectContent>
                        {systemUsers.map((systemUser) => (
                          <SelectItem key={systemUser.id} value={systemUser.id}>
                            {systemUser.name} · {systemUser.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isSuperAdmin && (
                      <p className="text-xs text-muted-foreground">
                        Você está editando apenas os modelos da sua própria conta.
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cliente selecionado</p>
                    <p className="mt-1 truncate text-sm font-semibold">{selectedTemplateUser?.name ?? '—'}</p>
                    <p className="truncate text-xs text-muted-foreground">{selectedTemplateUser?.email ?? 'Aguardando seleção'}</p>
                  </div>
                </div>

                {templateLoading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando modelos do cliente...
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Modelo da O.S.</Label>
                        <Select
                          value={templateDraft.osModelo}
                          onValueChange={(value) => setTemplateDraft((current) => ({ ...current, osModelo: value as OsTemplateMode }))}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Automático pela quantidade de serviços</SelectItem>
                            <SelectItem value="a5_duplo">Sempre A5 duplo</SelectItem>
                            <SelectItem value="a4_vertical">Sempre A4 vertical</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Automático usa A5 duplo até 7 itens e A4 vertical quando a O.S. fica maior.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Modelo do fechamento</Label>
                        <Select
                          value={templateDraft.fechamentoModelo}
                          onValueChange={(value) => setTemplateDraft((current) => ({ ...current, fechamentoModelo: value as ClosingTemplateMode }))}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="moderno">Moderno com cartões e destaques</SelectItem>
                            <SelectItem value="compacto">Compacto para impressão direta</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          A configuração fica registrada para o cliente e poderá ser usada nos PDFs finais.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                        <div>
                          <Label>Cor da O.S.</Label>
                          <p className="mt-1 text-xs text-muted-foreground">Cabeçalhos e destaques da nota de serviço.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {DOC_ACCENT_PRESETS.map((preset) => (
                            <button
                              key={`os-${preset.color}`}
                              type="button"
                              onClick={() => setTemplateDraft((current) => ({ ...current, corDocumento: preset.color }))}
                              className={`h-10 w-10 rounded-xl transition-all hover:scale-110 ${templateDraft.corDocumento === preset.color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                              style={{ backgroundColor: preset.color }}
                              aria-label={`Selecionar cor ${preset.name} para O.S.`}
                              title={preset.name}
                            />
                          ))}
                        </div>
                        <Input
                          value={templateDraft.corDocumento}
                          onChange={(event) => setTemplateDraft((current) => ({ ...current, corDocumento: event.target.value }))}
                          className="font-mono"
                          maxLength={7}
                        />
                      </div>

                      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                        <div>
                          <Label>Cor do fechamento</Label>
                          <p className="mt-1 text-xs text-muted-foreground">Destaques do PDF de fechamento mensal.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {DOC_ACCENT_PRESETS.map((preset) => (
                            <button
                              key={`closing-${preset.color}`}
                              type="button"
                              onClick={() => setTemplateDraft((current) => ({ ...current, corFechamento: preset.color }))}
                              className={`h-10 w-10 rounded-xl transition-all hover:scale-110 ${templateDraft.corFechamento === preset.color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                              style={{ backgroundColor: preset.color }}
                              aria-label={`Selecionar cor ${preset.name} para fechamento.`}
                              title={preset.name}
                            />
                          ))}
                        </div>
                        <Input
                          value={templateDraft.corFechamento}
                          onChange={(event) => setTemplateDraft((current) => ({ ...current, corFechamento: event.target.value }))}
                          className="font-mono"
                          maxLength={7}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Configuração atual</p>
                        <p className="text-xs text-muted-foreground">
                          O.S.: {templateDraft.osModelo} · Fechamento: {templateDraft.fechamentoModelo} · Cores: {templateDraft.corDocumento} / {templateDraft.corFechamento}
                        </p>
                      </div>
                      <Button onClick={() => void handleSaveTemplateSettings()} disabled={templateSaving || !selectedTemplateUserId} className="gap-2">
                        {templateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Atualizar modelos
                      </Button>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border-2 rounded-xl p-5 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-16 h-10 border-2 rounded bg-muted/40 flex items-center gap-px p-0.5">
                        <div className="flex-1 h-full bg-primary/15 rounded-sm" />
                        <div className="w-px h-full border-l border-dashed border-muted-foreground/30" />
                        <div className="flex-1 h-full bg-primary/15 rounded-sm" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Formato A5 Duplo</p>
                        <p className="text-xs text-muted-foreground">2 vias lado a lado (A4 paisagem)</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">Usado quando a O.S. possui até 7 itens.</p>
                    <Button variant="outline" size="sm" onClick={() => setShowA5Preview(true)} className="w-full gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Visualizar modelo
                    </Button>
                  </div>
                  <div className="border-2 rounded-xl p-5 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-14 border-2 rounded bg-primary/15" />
                      <div>
                        <p className="font-semibold text-sm">Formato A4 Vertical</p>
                        <p className="text-xs text-muted-foreground">Via única (A4 retrato)</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">Usado quando a O.S. possui mais de 7 itens.</p>
                    <Button variant="outline" size="sm" onClick={() => setShowA4Preview(true)} className="w-full gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Visualizar modelo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Prévia das Cores
                  <Badge variant="outline">Tempo real</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Use os botões de visualização para conferir a O.S. no padrão do cliente selecionado antes de salvar.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 p-4" style={{ borderTopColor: templateDraft.corDocumento, borderTopWidth: 4 }}>
                    <p className="text-sm font-semibold">O.S.</p>
                    <p className="text-xs text-muted-foreground">Modelo: {templateDraft.osModelo}</p>
                    <p className="mt-2 font-mono text-xs" style={{ color: templateDraft.corDocumento }}>{templateDraft.corDocumento}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 p-4" style={{ borderTopColor: templateDraft.corFechamento, borderTopWidth: 4 }}>
                    <p className="text-sm font-semibold">Fechamento</p>
                    <p className="text-xs text-muted-foreground">Modelo: {templateDraft.fechamentoModelo}</p>
                    <p className="mt-2 font-mono text-xs" style={{ color: templateDraft.corFechamento }}>{templateDraft.corFechamento}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(showA5Preview || showA4Preview) && (
            <Suspense fallback={null}>
              <OSPreviewModal
                open={showA5Preview}
                onClose={() => setShowA5Preview(false)}
                note={mockNote}
                client={mockClient}
                services={mockServicesShort}
                products={[]}
                accentColor={templateDraft.corDocumento}
                templateMode="a5_duplo"
              />
              <OSPreviewModal
                open={showA4Preview}
                onClose={() => setShowA4Preview(false)}
                note={{ ...mockNote, totalAmount: 2500 }}
                client={mockClient}
                services={mockServicesLong}
                products={[]}
                accentColor={templateDraft.corDocumento}
                templateMode="a4_vertical"
              />
            </Suspense>
          )}
        </TabsContent>

        {/* SEGURANÇA */}
        <TabsContent value="seguranca">
          <div className="space-y-5">
          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" /> Reset de senha de cliente
                  <Badge variant="outline">Supabase Auth</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Fluxo seguro pelo Admin master</AlertTitle>
                  <AlertDescription>
                    Selecione o cliente/usuário e reenvie o e-mail de recuperação. O link de troca de senha vai somente para o e-mail principal da conta; o e-mail extra recebe apenas uma confirmação administrativa.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="space-y-2">
                    <Label>Cliente / usuário</Label>
                    <Select
                      value={selectedResetUserId}
                      onValueChange={setSelectedResetUserId}
                      disabled={usersLoading || systemUsers.length === 0 || resetSending}
                    >
                      <SelectTrigger className="h-11">
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

                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reset será enviado para</p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {systemUsers.find((candidate) => candidate.id === selectedResetUserId)?.email ?? '—'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>E-mail alternativo de confirmação (opcional)</Label>
                  <Input
                    type="email"
                    value={resetConfirmationEmail}
                    onChange={(event) => setResetConfirmationEmail(event.target.value)}
                    onBlur={() => setResetConfirmationEmail(normalizeEmail(resetConfirmationEmail))}
                    placeholder="exemplo@cliente.com"
                    disabled={resetSending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este endereço recebe apenas a confirmação de que o reset foi solicitado. O link de redefinição não é enviado para e-mail alternativo.
                  </p>
                </div>

                <Button
                  variant="destructive"
                  onClick={() => void handleAdminPasswordReset()}
                  disabled={resetSending || !selectedResetUserId}
                  className="gap-2"
                >
                  {resetSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Reenviar reset de senha
                </Button>
              </CardContent>
            </Card>
          )}

          <MfaSettingsCard />

          {SHOW_PASSWORD_SETTINGS && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" /> Alterar Senha
                <Badge variant="outline">Indisponível</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              {!SECURITY_SETTINGS_CONNECTED && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Fluxo ainda indisponível</AlertTitle>
                  <AlertDescription>
                    A troca de senha nesta tela ainda não conversa com o provedor real de autenticação. Para evitar falso positivo, o formulário fica somente informativo.
                  </AlertDescription>
                </Alert>
              )}
              <div><Label>Senha Atual</Label><Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="mt-1.5" placeholder="••••••••" disabled={!SECURITY_SETTINGS_CONNECTED} /></div>
              <div><Label>Nova Senha</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1.5" placeholder="Mínimo 6 caracteres" disabled={!SECURITY_SETTINGS_CONNECTED} /></div>
              <div><Label>Confirmar Nova Senha</Label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="mt-1.5" placeholder="Repita a nova senha" disabled={!SECURITY_SETTINGS_CONNECTED} /></div>
              <Button onClick={handlePasswordChange} disabled={!SECURITY_SETTINGS_CONNECTED} aria-disabled={!SECURITY_SETTINGS_CONNECTED}>
                {SECURITY_SETTINGS_CONNECTED ? 'Alterar Senha' : 'Integração em implementação'}
              </Button>
            </CardContent>
          </Card>
          )}
          </div>
        </TabsContent>

        {/* USUÁRIOS */}
        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Usuários do Sistema
                <Badge variant="outline">Admin real</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Gestão real centralizada no Admin</AlertTitle>
                <AlertDescription>
                  Para evitar dados locais ou duplicação de permissões, a criação de usuários, convites,
                  reset de senha, ativação e controle de módulos ficam exclusivamente no módulo administrativo
                  conectado ao Supabase.
                </AlertDescription>
              </Alert>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-sm font-semibold">O que fazer aqui?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use esta aba como atalho seguro para o painel administrativo. Convites, resets,
                  ativação e módulos são controlados pelo fluxo real de usuários.
                </p>
              </div>
              {user?.role === 'ADMIN' ? (
                <Button asChild className="gap-2">
                  <Link to="/admin/usuarios">
                    <Users className="h-4 w-4" />
                    Abrir usuários no Admin
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Apenas administradores podem acessar a gestão real de usuários.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
