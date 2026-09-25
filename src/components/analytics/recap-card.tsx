'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Download, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/money';
import { toast } from 'sonner';
import type { RecapCardData } from '@/lib/queries/analytics';

export function RecapCard({ data }: { data: RecapCardData }) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const recapText = [
    `✨ My OweMe Recap • ${data.periodLabel}`,
    `👤 ${data.userName} (@${data.username})`,
    `💰 Total Tracked: ${formatINR(data.totalTrackedMinor)}`,
    `🧾 Expenses Logged: ${data.expenseCount}`,
    `👥 Friends Split With: ${data.distinctFriendsCount}`,
    `🏷️ Top Category: ${data.topCategory.toUpperCase()}`,
    `💬 "${data.funStat}"`,
    '',
    'Track → Notify → Confirm → Settle with OweMe.',
  ].join('\n');

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(recapText);
      setCopied(true);
      toast.success('Recap text copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy recap text.');
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `My OweMe Recap • ${data.periodLabel}`,
          text: recapText,
        });
      } catch {
        await handleCopyText();
      }
    } else {
      await handleCopyText();
    }
  };

  const handleDownload = async () => {
    // Ensure font is loaded before canvas drawing
    const FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await document.fonts.load('bold 36px Inter');
        await document.fonts.load('600 20px Inter');
        await document.fonts.load('bold 44px Inter');
      } catch {
        // Fallback to system stack safely
      }
    }

    // Render a high-res image using an HTML5 offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw dark gradient background
    const gradient = ctx.createLinearGradient(0, 0, 800, 1000);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.5, '#1e1b4b');
    gradient.addColorStop(1, '#090d16');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 1000);

    // Decorative glow circles
    const radGlow = ctx.createRadialGradient(200, 200, 10, 200, 200, 400);
    radGlow.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
    radGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = radGlow;
    ctx.fillRect(0, 0, 800, 1000);

    // Brand header
    ctx.font = `bold 36px ${FONT_FAMILY}`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('OweMe Recap', 60, 90);

    ctx.font = `600 20px ${FONT_FAMILY}`;
    ctx.fillStyle = '#818cf8';
    ctx.fillText(`• ${data.periodLabel}`, 300, 90);

    // User name
    ctx.font = `bold 44px ${FONT_FAMILY}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.userName, 60, 180);

    ctx.font = `500 22px ${FONT_FAMILY}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`@${data.username}`, 60, 215);

    // Divider line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 255);
    ctx.lineTo(740, 255);
    ctx.stroke();

    // Box 1: Total Tracked
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.roundRect(60, 290, 680, 140, [16]);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    ctx.font = '500 20px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('TOTAL MONEY TRACKED', 90, 335);

    ctx.font = 'bold 54px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(formatINR(data.totalTrackedMinor), 90, 400);

    // Box 2: Expenses Logged
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.roundRect(60, 460, 325, 140, [16]);
    ctx.fill();
    ctx.stroke();

    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('EXPENSES LOGGED', 90, 505);

    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(String(data.expenseCount), 90, 565);

    // Box 3: Friends Split With
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.roundRect(415, 460, 325, 140, [16]);
    ctx.fill();
    ctx.stroke();

    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('FRIENDS SPLIT WITH', 445, 505);

    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText(String(data.distinctFriendsCount), 445, 565);

    // Box 4: Top Category
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.roundRect(60, 630, 680, 110, [16]);
    ctx.fill();
    ctx.stroke();

    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('TOP CATEGORY', 90, 675);

    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(data.topCategory.toUpperCase(), 90, 715);

    // Box 5: Fun Stat / Quote
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.roundRect(60, 770, 680, 110, [16]);
    ctx.fill();
    ctx.strokeStyle = '#6366f1';
    ctx.stroke();

    ctx.font = 'italic 22px Inter, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`"${data.funStat}"`, 90, 835);

    // Footer
    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Track → Notify → Confirm → Settle · oweme.app', 60, 940);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `oweme-recap-${data.username}-${data.periodLabel}.png`;
    a.click();
    toast.success('Recap image downloaded!');
  };

  return (
    <div className="space-y-4">
      {/* Visual Spotify Wrapped-Style Card */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-6 text-white shadow-2xl backdrop-blur-xl sm:p-8"
      >
        {/* Glow decoration */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-amber-400" />
              </span>
              <span className="font-bold text-sm tracking-wide text-white/90">OweMe Recap</span>
            </div>
            <Badge variant="outline" className="border-white/20 bg-white/5 text-xs text-white/80">
              {data.periodLabel}
            </Badge>
          </div>

          {/* User info */}
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {data.userName}
            </h3>
            <p className="text-sm font-medium text-white/60">@{data.username}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Total Tracked
              </p>
              <p className="text-2xl font-black text-sky-400 sm:text-3xl">
                {formatINR(data.totalTrackedMinor)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Expenses Logged
              </p>
              <p className="text-2xl font-black text-white sm:text-3xl">{data.expenseCount}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Friends Split With
              </p>
              <p className="text-2xl font-black text-emerald-400 sm:text-3xl">
                {data.distinctFriendsCount}
              </p>
              <p className="text-[10px] text-white/50">count only · names private</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Top Category
              </p>
              <p className="text-xl font-bold text-amber-400 uppercase sm:text-2xl">
                {data.topCategory}
              </p>
            </div>
          </div>

          {/* Fun line */}
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 backdrop-blur-md">
            <p className="text-sm italic text-indigo-200">&ldquo;{data.funStat}&rdquo;</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-white/50 pt-2 border-t border-white/10">
            <span>Verified Privacy: Zero counterparty data exposed</span>
            <span>oweme.app</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleCopyText} className="gap-1.5 text-xs">
          {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied Text' : 'Copy Text'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" /> Download Card
        </Button>
        <Button size="sm" onClick={handleShare} className="gap-1.5 text-xs">
          <Share2 className="h-3.5 w-3.5" /> Share Recap
        </Button>
      </div>
    </div>
  );
}

export default RecapCard;

