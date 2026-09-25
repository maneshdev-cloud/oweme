'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  Share,
  Smartphone,
  Laptop,
  PlusSquare,
  MoreVertical,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function DownloadAppButton({
  variant = 'outline',
  size = 'sm',
  className,
  showLabel = true,
}: {
  variant?: 'outline' | 'default' | 'ghost' | 'secondary';
  size?: 'sm' | 'default' | 'icon';
  className?: string;
  showLabel?: boolean;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    // Detect standalone PWA mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
    setIsStandalone(standalone);

    // Detect platform
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) && !/windows phone/.test(ua)) {
      setActiveTab('ios');
    } else if (/android/.test(ua)) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleClick = async () => {
    // Check if already installed
    const currentlyStandalone =
      isStandalone ||
      (typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)));

    if (currentlyStandalone) {
      toast.info('OWEME is already installed on your device.');
      return;
    }

    // If browser supports automatic prompt
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          toast.success('OWEME installed successfully!');
          setDeferredPrompt(null);
          return;
        }
      } catch {
        // Fall back to instructions modal
      }
    }

    // If browser does NOT support automatic install prompt: show modal with instructions
    toast.info('Open your browser menu and select "Install OWEME" or "Add to Home Screen".');
    setDialogOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn('gap-1.5 cursor-pointer select-none active:scale-95 transition-transform', className)}
        aria-label="Download or install OweMe app"
        title="Download or install OweMe app"
      >
        <Download className={cn('h-4 w-4 shrink-0', size === 'icon' && 'h-5 w-5')} aria-hidden />
        {showLabel && size !== 'icon' && <span className="font-medium">Download App</span>}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                {activeTab === 'desktop' ? (
                  <Laptop className="h-5 w-5" />
                ) : (
                  <Smartphone className="h-5 w-5" />
                )}
              </span>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Install OWEME
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Open your browser menu and select &quot;Install OWEME&quot; or &quot;Add to Home Screen&quot;.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isStandalone ? (
            <div className="flex items-center gap-3 rounded-2xl border border-positive/30 bg-positive/10 p-3.5 text-xs text-positive">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>OWEME is already installed on your device.</span>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              {/* Platform Selector Tabs */}
              <div className="flex rounded-xl bg-secondary p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('ios')}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 transition-colors',
                    activeTab === 'ios'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  iPhone / iOS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('android')}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 transition-colors',
                    activeTab === 'android'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Android
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('desktop')}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 transition-colors',
                    activeTab === 'desktop'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Desktop / PC
                </button>
              </div>

              {/* Instructions based on platform */}
              {activeTab === 'ios' && (
                <div className="rounded-2xl border bg-card p-4 space-y-3 text-xs">
                  <p className="font-semibold text-foreground">How to install on Safari / iOS:</p>
                  <ol className="space-y-2.5 text-muted-foreground pl-1">
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        1
                      </span>
                      <span>
                        Tap the <strong className="text-foreground">Share button</strong>{' '}
                        <Share className="inline h-3.5 w-3.5 text-primary align-text-bottom" /> in Safari&apos;s bottom bar.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        2
                      </span>
                      <span>
                        Scroll down and select <strong className="text-foreground">Add to Home Screen</strong>{' '}
                        <PlusSquare className="inline h-3.5 w-3.5 text-primary align-text-bottom" />.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        3
                      </span>
                      <span>
                        Tap <strong className="text-foreground">Add</strong> in the top-right corner to finish installing.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {activeTab === 'android' && (
                <div className="rounded-2xl border bg-card p-4 space-y-3 text-xs">
                  <p className="font-semibold text-foreground">How to install on Android / Chrome:</p>
                  <ol className="space-y-2.5 text-muted-foreground pl-1">
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        1
                      </span>
                      <span>
                        Tap the <strong className="text-foreground">browser menu</strong>{' '}
                        <MoreVertical className="inline h-3.5 w-3.5 text-primary align-text-bottom" /> (three dots in top right).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        2
                      </span>
                      <span>
                        Select <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home screen</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        3
                      </span>
                      <span>
                        Confirm <strong className="text-foreground">Install</strong> when prompted to add OWEME to your home screen.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {activeTab === 'desktop' && (
                <div className="rounded-2xl border bg-card p-4 space-y-3 text-xs">
                  <p className="font-semibold text-foreground">How to install on Windows / Mac / Chrome / Edge:</p>
                  <ol className="space-y-2.5 text-muted-foreground pl-1">
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        1
                      </span>
                      <span>
                        Look for the <strong className="text-foreground">Install app icon</strong>{' '}
                        <Download className="inline h-3.5 w-3.5 text-primary align-text-bottom" /> on the right side of the address bar.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        2
                      </span>
                      <span>
                        Or click your browser menu <strong className="text-foreground">(⋮)</strong> &rarr; <strong className="text-foreground">Install OWEME</strong> or <strong className="text-foreground">Save and share &rarr; Install OWEME</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">
                        3
                      </span>
                      <span>
                        Click <strong className="text-foreground">Install</strong> to open OWEME in its own standalone window.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {deferredPrompt && (
                <div className="pt-1">
                  <Button
                    onClick={handleClick}
                    className="w-full gap-2"
                  >
                    <Download className="h-4 w-4" /> Install Directly Now
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DownloadAppButton;
