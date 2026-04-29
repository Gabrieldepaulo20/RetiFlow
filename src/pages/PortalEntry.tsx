import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { getDefaultRedirect } from '@/services/auth/defaultRedirect';

export default function PortalEntry() {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && user) {
    return <Navigate to={getDefaultRedirect(user)} replace />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/20" />
      <div className="relative z-10 w-full max-w-5xl">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Wrench className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold">Retífica Premium</h1>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            Escolha o portal de acesso adequado para continuar.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <Card className="h-full border-0 shadow-sm">
              <CardContent className="p-8 flex h-full flex-col">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                  <Wrench className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold">Portal do Cliente</h2>
                <p className="text-sm text-muted-foreground mt-3 flex-1">
                  Acesso operacional para usuários do sistema acompanharem ordens de serviço, produção e faturamento liberado.
                </p>
                <Button asChild className="mt-6 justify-between">
                  <Link to="/login">
                    Entrar no portal do cliente
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }}>
            <Card className="h-full border-0 shadow-sm">
              <CardContent className="p-8 flex h-full flex-col">
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
                  <Shield className="w-6 h-6 text-destructive" />
                </div>
                <h2 className="text-2xl font-display font-bold">Área Administrativa</h2>
                <p className="text-sm text-muted-foreground mt-3 flex-1">
                  Acesso exclusivo para administração da plataforma, configurações globais e gestão interna.
                </p>
                <Button asChild variant="outline" className="mt-6 justify-between">
                  <Link to="/admin/login">
                    Entrar na área administrativa
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
