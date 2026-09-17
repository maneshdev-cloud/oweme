'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Downloads go through a real route handler, so the file is built from the
 * signed-in user's session with RLS applied — and every export is recorded
 * server-side before the browser receives a byte.
 */
export function ExportButtons() {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null);

  function href(format: 'csv' | 'json') {
    const params = new URLSearchParams(searchParams.toString());
    params.set('format', format);
    return `/api/history/export?${params.toString()}`;
  }

  async function download(format: 'csv' | 'json') {
    setBusy(format);
    try {
      const response = await fetch(href(format), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The history export could not be prepared.');

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition');
      const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? `oweme-history.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The history export failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => download('csv')} loading={busy === 'csv'} disabled={busy !== null}>
        <Download className="h-4 w-4" /> {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
      </Button>
      <Button variant="ghost" onClick={() => download('json')} loading={busy === 'json'} disabled={busy !== null}>
        <FileJson className="h-4 w-4" /> {busy === 'json' ? 'Preparing…' : 'JSON'}
      </Button>
    </div>
  );
}
