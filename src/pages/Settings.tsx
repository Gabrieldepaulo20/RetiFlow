import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { users } from '@/data/seed';
import { DEFAULT_ROLE_MODULE_CONFIG } from '@/services/auth/moduleAccess';
import { Wrench, Building2, Users, Palette, Lock, Upload, Check, FileText, Eye, LayoutGrid, LayoutDashboard, KanbanSquare, Calendar, Receipt, Settings as SettingsIcon, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { IntakeNote, IntakeService, Client, RoleModuleConfig, UserRole } from '@/types';

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
const MODULE_DEFS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', icon: Users },
  { key: 'notes', label: 'Notas de Entrada', icon: FileText },
  { key: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { key: 'closing', label: 'Fechamento', icon: Calendar },
  { key: 'invoices', label: 'Nota Fiscal (fora da v1)', icon: Receipt },
  { key: 'settings', label: 'Configurações', icon: SettingsIcon },
];

const CONFIGURABLE_ROLES: { key: UserRole; label: string }[] = [
  { key: 'FINANCEIRO', label: 'Financeiro' },
  { key: 'PRODUCAO', label: 'Produção' },
  { key: 'RECEPCAO', label: 'Recepção' },
];

const COMPANY_SETTINGS_CONNECTED = false;
const MODULE_SETTINGS_CONNECTED = false;
const APPEARANCE_SETTINGS_CONNECTED = false;
const DOCUMENT_MODEL_SETTINGS_CONNECTED = false;
const SECURITY_SETTINGS_CONNECTED = false;
const SETTINGS_TABS = new Set(['empresa', 'modulos', 'aparencia', 'modelos', 'seguranca', 'usuarios']);

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'empresa';
  const activeTab = SETTINGS_TABS.has(tabFromUrl) ? tabFromUrl : 'empresa';

  // Company
  const [companyName, setCompanyName] = useState('Retífica Premium');
  const [fantasyName, setFantasyName] = useState('Premium Retífica de Cabeçote');
  const [cnpj, setCnpj] = useState('12.345.678/0001-90');
  const [ie, setIe] = useState('123.456.789.000');
  const [im, setIm] = useState('98765');
  const [companyAddress, setCompanyAddress] = useState('Rua das Indústrias, 450');
  const [companyCity, setCompanyCity] = useState('São Paulo');
  const [companyState, setCompanyState] = useState('SP');
  const [companyCep, setCompanyCep] = useState('01234-567');
  const [companyPhone, setCompanyPhone] = useState('(11) 3456-7890');
  const [companyEmail, setCompanyEmail] = useState('contato@retificapremium.com.br');
  const [companySite, setCompanySite] = useState('www.retificapremium.com.br');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Theme
  const [selectedTheme, setSelectedTheme] = useState(0);
  const [docAccentColor, setDocAccentColor] = useState(DOC_ACCENT_PRESETS[0].color);
  const [showA5Preview, setShowA5Preview] = useState(false);
  const [showA4Preview, setShowA4Preview] = useState(false);

  // Modules
  const [moduleConfig, setModuleConfig] = useState<RoleModuleConfig>(DEFAULT_ROLE_MODULE_CONFIG);

  const toggleModule = (role: UserRole, mod: keyof typeof DEFAULT_ROLE_MODULE_CONFIG.ADMIN) => {
    if (!MODULE_SETTINGS_CONNECTED) return;
    setModuleConfig(prev => ({
      ...prev,
      [role]: { ...prev[role], [mod]: !prev[role]?.[mod] },
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setLogoPreview(reader.result as string); toast({ title: 'Logo carregada apenas como prévia local' }); };
      reader.readAsDataURL(file);
    }
  };

  const handlePasswordChange = () => {
    if (!currentPassword) { toast({ title: 'Informe a senha atual', variant: 'destructive' }); return; }
    if (newPassword.length < 6) { toast({ title: 'Mínimo 6 caracteres', variant: 'destructive' }); return; }
    if (newPassword !== confirmPassword) { toast({ title: 'Senhas não coincidem', variant: 'destructive' }); return; }
    toast({ title: 'Senha alterada!' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-bold">Configurações</h1>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Algumas seções ainda são locais</AlertTitle>
        <AlertDescription>
          Dados da empresa, permissões por perfil, aparência, modelos e segurança ainda não persistem no backend.
          O que aparecer como prévia local não deve ser considerado configuração real de produção.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="empresa" className="shrink-0 text-xs sm:text-sm"><Building2 className="w-4 h-4 mr-1.5 hidden sm:inline" /> Empresa</TabsTrigger>
          <TabsTrigger value="modulos" className="shrink-0 text-xs sm:text-sm"><LayoutGrid className="w-4 h-4 mr-1.5 hidden sm:inline" /> Módulos</TabsTrigger>
          <TabsTrigger value="aparencia" className="shrink-0 text-xs sm:text-sm"><Palette className="w-4 h-4 mr-1.5 hidden sm:inline" /> Aparência</TabsTrigger>
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
                <Badge variant="outline">Prévia local</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!COMPANY_SETTINGS_CONNECTED && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Prévia local</AlertTitle>
                  <AlertDescription>
                    Esta seção ainda serve apenas para pré-visualização no navegador atual. O botão de salvar fica desabilitado até a persistência real ser conectada.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Razão Social</Label><Input value={companyName} onChange={e => setCompanyName(e.target.value)} className="mt-1.5" /></div>
                <div><Label>Nome Fantasia</Label><Input value={fantasyName} onChange={e => setFantasyName(e.target.value)} className="mt-1.5" /></div>
                <div><Label>CNPJ</Label><Input value={cnpj} onChange={e => setCnpj(e.target.value)} className="mt-1.5" /></div>
                <div><Label>Inscrição Estadual</Label><Input value={ie} onChange={e => setIe(e.target.value)} className="mt-1.5" /></div>
                <div><Label>Inscrição Municipal</Label><Input value={im} onChange={e => setIm(e.target.value)} className="mt-1.5" /></div>
              </div>

              <Separator />
              <p className="text-sm font-semibold text-foreground">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Label>Endereço</Label><Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className="mt-1.5" /></div>
                <div><Label>Cidade</Label><Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} className="mt-1.5" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Estado</Label><Input value={companyState} onChange={e => setCompanyState(e.target.value)} className="mt-1.5" /></div>
                  <div><Label>CEP</Label><Input value={companyCep} onChange={e => setCompanyCep(e.target.value)} className="mt-1.5" /></div>
                </div>
              </div>

              <Separator />
              <p className="text-sm font-semibold text-foreground">Contato</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label>Telefone</Label><Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} className="mt-1.5" /></div>
                <div><Label>E-mail</Label><Input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} className="mt-1.5" /></div>
                <div><Label>Site</Label><Input value={companySite} onChange={e => setCompanySite(e.target.value)} className="mt-1.5" /></div>
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
              <Button disabled={!COMPANY_SETTINGS_CONNECTED} aria-disabled={!COMPANY_SETTINGS_CONNECTED}>
                {COMPANY_SETTINGS_CONNECTED ? 'Salvar Alterações' : 'Persistência em implementação'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MÓDULOS */}
        <TabsContent value="modulos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5" /> Controle de Módulos por Perfil
                <Badge variant="outline">Bloqueado na v1</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Permissões reais ainda não conectadas nesta tela</AlertTitle>
                <AlertDescription>
                  Estes controles estão bloqueados para não parecerem alteração de backend. A autorização real deve continuar vindo
                  das permissões do usuário no Supabase/RPCs.
                </AlertDescription>
              </Alert>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 pr-4 font-semibold text-muted-foreground">Módulo</th>
                      {CONFIGURABLE_ROLES.map(r => (
                        <th key={r.key} className="text-center py-3 px-4 font-semibold text-muted-foreground">{r.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_DEFS.map(mod => (
                      <tr key={mod.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <mod.icon className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{mod.label}</span>
                          </div>
                        </td>
                        {CONFIGURABLE_ROLES.map(r => (
                          <td key={r.key} className="text-center py-3 px-4">
                            <Switch
                              checked={moduleConfig[r.key]?.[mod.key] ?? false}
                              disabled={!MODULE_SETTINGS_CONNECTED}
                              onCheckedChange={() => toggleModule(r.key, mod.key)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Bloqueado na v1 para evitar configuração local enganosa. Alterações reais exigem persistência no banco.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* APARÊNCIA */}
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

        {/* MODELOS DA O.S. */}
        <TabsContent value="modelos">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Modelos da O.S.
                  <Badge variant="outline">Prévia local</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  O formato do documento é selecionado automaticamente com base na quantidade de itens da O.S.
                </p>
                {!DOCUMENT_MODEL_SETTINGS_CONNECTED && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Prévia com dados fictícios</AlertTitle>
                    <AlertDescription>
                      Os modelos abaixo usam dados mockados só para visualizar layout. Nenhuma regra de template é salva por esta tela.
                    </AlertDescription>
                  </Alert>
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
                  <Palette className="w-4 h-4" /> Cor de Destaque do Documento
                  <Badge variant="outline">Prévia local</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Escolha a cor principal usada nos cabeçalhos e destaques do documento impresso.</p>
                <div className="flex gap-3 flex-wrap">
                  {DOC_ACCENT_PRESETS.map(p => (
                    <button
                      key={p.color}
                      onClick={() => { setDocAccentColor(p.color); toast({ title: `Prévia local da cor "${p.name}" selecionada` }); }}
                      className={`w-10 h-10 rounded-xl transition-all hover:scale-110 ${docAccentColor === p.color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                      style={{ backgroundColor: p.color }}
                      title={p.name}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cor da prévia local: <span className="font-mono font-semibold">{docAccentColor}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          {(showA5Preview || showA4Preview) && (
            <Suspense fallback={null}>
              <OSPreviewModal open={showA5Preview} onClose={() => setShowA5Preview(false)} note={mockNote} client={mockClient} services={mockServicesShort} products={[]} accentColor={docAccentColor} />
              <OSPreviewModal open={showA4Preview} onClose={() => setShowA4Preview(false)} note={{ ...mockNote, totalAmount: 2500 }} client={mockClient} services={mockServicesLong} products={[]} accentColor={docAccentColor} />
            </Suspense>
          )}
        </TabsContent>

        {/* SEGURANÇA */}
        <TabsContent value="seguranca">
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
        </TabsContent>

        {/* USUÁRIOS */}
        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Usuários do Sistema
                <Badge variant="outline">Lista ilustrativa</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertTitle>Lista ilustrativa nesta tela</AlertTitle>
                <AlertDescription>
                  Esta aba ainda usa dados locais de referência. A gestão real de usuários deve ser feita pelo módulo administrativo conectado ao Supabase.
                </AlertDescription>
              </Alert>
              <div className="space-y-3">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div><p className="font-medium">{u.name}</p><p className="text-sm text-muted-foreground">{u.email}</p></div>
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>{u.role}</Badge>
                  </div>
                ))}
              </div>
              {user?.role !== 'ADMIN' && <p className="text-sm text-muted-foreground mt-4">Apenas administradores podem alterar perfis.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
