import { Suspense } from 'react';
import Link from 'next/link';
import { ExternalLink, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Brand } from '@/components/brand';
import { SignInButton } from '@/app/login/sign-in-button';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Sign in' };

const HIGHLIGHTS = [
  { icon: Zap, text: 'Add an expense in under ten seconds — before the printout is even stapled.' },
  { icon: Sparkles, text: 'Both sides see the same state, so nobody has to remember who paid.' },
  { icon: ShieldCheck, text: 'Your money records are private to you and the other person. Enforced by the database.' },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="space-y-4">
        <Brand />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Printouts, chai, tickets, trips.
            <br />
            <span className="text-muted-foreground">OweMe tracks what to give and what to receive.</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Track your money clearly — see where it comes from, where it goes, and who you’re settling with.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {HIGHLIGHTS.map((item) => (
          <li key={item.text} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <item.icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="text-muted-foreground">{item.text}</span>
          </li>
        ))}
      </ul>

      <Suspense fallback={<Skeleton className="h-12 w-full rounded-full" />}>
        <SignInButton />
      </Suspense>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        Manual authentication will be available soon.
      </p>

      <div className="pt-2 text-center text-xs">
        <a
          href="https://manesh.pages.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
        >
          <span>Built by</span>
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
        </a>
      </div>
    </main>
  );
}
