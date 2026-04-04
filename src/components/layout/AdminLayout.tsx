import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, Users, Settings, Menu, LogOut, ChevronLeft, ChevronRight, Wrench, Shield, ArrowLeft,
} from 'lucide-react';

const adminNav = [
  { label: 'Painel', icon: LayoutDashboard, path: '/admin' },
  { label: 'Usuários', icon: Users, path: '/admin/usuarios' },
  { label: 'Configurações', icon: Settings, path: '/admin/configuracoes' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return <Navigate to="/admin/login" replace />;

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2);

  const NavContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-display font-bold text-sidebar-primary-foreground text-base">Admin</span>
            <p className="text-[10px] text-sidebar-foreground/50">Retífica Premium</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2">
        {adminNav.map(item => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNav}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
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

      {/* Switch to operational */}
      <div className="px-3 mb-3">
        <Link
          to="/dashboard"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            'text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-accent-foreground'
          )}
        >
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Área Operacional</span>}
        </Link>
      </div>

      <div className="p-3 border-t border-sidebar-border">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">Administrador</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className={cn(
          'fixed left-0 top-0 h-full bg-sidebar transition-all duration-300 z-40 flex flex-col',
          collapsed ? 'w-[68px]' : 'w-60'
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
      <div className={cn('flex-1 flex flex-col min-h-screen', !isMobile && (collapsed ? 'ml-[68px]' : 'ml-60'))}>
        {/* Top bar */}
        <header className="h-14 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-30">
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-60 p-0 bg-sidebar border-sidebar-border">
                <NavContent onNav={() => {}} />
              </SheetContent>
            </Sheet>
          )}

          <div className="flex-1 flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 text-xs font-medium border-primary/30 text-primary">
              <Shield className="w-3 h-3" />
              Modo Admin
            </Badge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                </Avatar>
                {!isMobile && <span className="text-sm">{user.name}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-muted-foreground text-xs" disabled>{user.email}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                <Wrench className="w-4 h-4 mr-2" /> Área Operacional
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }}>
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className={cn('flex-1 p-4 md:p-6', isMobile && 'pb-20')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
