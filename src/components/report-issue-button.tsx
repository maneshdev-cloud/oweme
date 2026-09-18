'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Mail, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SUPPORT_EMAIL = 'minisotechsolutions@gmail.com';
const EMAIL_SUBJECT = 'OweMe Issue Report';
const EMAIL_BODY = 'Hi OweMe team,\n\nI found an issue:\n\n';

const MAILTO_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  EMAIL_SUBJECT,
)}&body=${encodeURIComponent(EMAIL_BODY)}`;

const GMAIL_WEB_URL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
  SUPPORT_EMAIL,
)}&su=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(EMAIL_BODY)}`;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export function ReportIssueDialog({
  children,
  open,
  onOpenChange,
}: {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(SUPPORT_EMAIL);
    if (ok) {
      setCopied(true);
      toast.success('Support email copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy email. Please copy manually: ' + SUPPORT_EMAIL);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md p-5 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <MailWarning className="h-5 w-5" aria-hidden />
            <DialogTitle>Report an issue</DialogTitle>
          </div>
          <DialogDescription className="text-left text-sm text-muted-foreground pt-1">
            Found a bug or need help? You can write to our team directly using any method below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Support Email Display with Copy */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-3">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Support Email
              </span>
              <p className="truncate text-sm font-semibold font-mono text-foreground select-all">
                {SUPPORT_EMAIL}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 gap-1.5 h-8 text-xs font-medium"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-positive" aria-hidden />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>

          {/* Action Options */}
          <div className="space-y-2">
            <a
              href={GMAIL_WEB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'w-full justify-between h-11 px-4 font-medium',
              )}
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" aria-hidden />
                <span>Open in Gmail (Web)</span>
              </span>
              <span className="text-xs opacity-80 font-normal">Recommended</span>
            </a>

            <a
              href={MAILTO_URL}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'w-full justify-between h-11 px-4 font-medium',
              )}
            >
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span>Open Mail App</span>
              </span>
              <span className="text-xs text-muted-foreground font-normal">Outlook / Apple Mail</span>
            </a>
          </div>

          <p className="text-center text-xs text-muted-foreground pt-1">
            We read every report and aim to get back to you promptly.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReportIssueLink({
  className,
  children = 'Report an issue',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <ReportIssueDialog>
      <button
        type="button"
        className={cn(
          'font-medium text-primary underline-offset-4 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm',
          className,
        )}
      >
        {children}
      </button>
    </ReportIssueDialog>
  );
}

export function ReportIssueButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await copyToClipboard(SUPPORT_EMAIL);
    if (ok) {
      setCopied(true);
      toast.success('Support email copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy email. Please copy manually: ' + SUPPORT_EMAIL);
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <ReportIssueDialog>
        <Button
          type="button"
          variant="outline"
          className="inline-flex items-center gap-2 font-medium"
        >
          <MailWarning className="h-4 w-4 text-primary" aria-hidden />
          Report an issue
        </Button>
      </ReportIssueDialog>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy email address"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/50 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-positive" aria-hidden />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            <span>Copy email</span>
          </>
        )}
      </button>
    </div>
  );
}
