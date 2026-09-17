import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Brand />
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
        <Compass className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">That page isn’t here</h1>
      <p className="text-sm text-muted-foreground">
        The link may be old, or the expense may have moved to your History. Nothing is lost either way.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/home">Back to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/history">Open history</Link>
        </Button>
      </div>
    </main>
  );
}
