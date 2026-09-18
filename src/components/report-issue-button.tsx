'use client';

import { useState } from 'react';
import { Check, Copy, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SUPPORT_EMAIL = 'minisotechsolutions@gmail.com';
const MAILTO_URL = `mailto:${SUPPORT_EMAIL}?subject=OweMe%20Issue%20Report&body=Hi%20OweMe%20team%2C%0A%0AI%20found%20an%20issue%3A%0A%0A`;

export function ReportIssueButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  function copyEmail() {
    navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopied(true);
    toast.success('Support email copied to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <a
        href={MAILTO_URL}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'inline-flex items-center gap-2 font-medium',
        )}
      >
        <MailWarning className="h-4 w-4 text-primary" aria-hidden />
        Email us
      </a>
      <button
        type="button"
        onClick={copyEmail}
        title="Copy email address"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/50 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
