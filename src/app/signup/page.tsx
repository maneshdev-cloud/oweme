import Link from 'next/link';
import { ExternalLink, HandCoins, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Brand } from '@/components/brand';
import { SignInButton } from '@/app/login/sign-in-button';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="space-y-4">
        <Brand />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Create your OweMe account.</h1>
          <p className="text-sm text-muted-foreground">
            Use Google to create your profile. Existing Google users will sign in to their existing account instead.
          </p>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-12 w-full rounded-full" />}>
        <SignInButton mode="sign-up" />
      </Suspense>

      <p className="text-center text-sm text-muted-foreground">
        <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden /> Your expense records stay protected by Supabase RLS.
      </p>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        <HandCoins className="mr-1 inline h-3.5 w-3.5" aria-hidden /> No money moves through OweMe.
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