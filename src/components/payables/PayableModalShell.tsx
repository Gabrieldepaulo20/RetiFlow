import { ReactNode, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

type PayableModalShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}

export default function PayableModalShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  desktopClassName,
  mobileClassName,
}: PayableModalShellProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground>
        <DrawerContent className={cn('flex max-h-[94dvh] flex-col rounded-t-[26px] p-0', className, mobileClassName)}>
          <DrawerHeader className="border-b border-border/60 px-5 pb-4 pt-2 text-left">
            <DrawerTitle className="font-display text-lg font-bold tracking-tight">{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-4xl', className, desktopClassName)}>
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4 text-left sm:px-5 lg:px-6">
          <DialogTitle className="font-display text-lg font-bold tracking-tight">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-5 lg:px-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
