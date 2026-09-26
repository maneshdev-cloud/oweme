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
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const recapText = [
    `✨ My OweMe Recap • ${data.periodLabel}`,
    `👤 ${data.userName} (@${data.username})`,
    `💰 Total Money Tracked: ${formatINR(data.totalTrackedMinor)}`,
    `🧾 Expenses Logged: ${data.expenseCount}`,
    `👥 Friends Split With: ${data.distinctFriendsCount}`,
    `🏷️ Top Category: ${data.topCategory.toUpperCase()}`,
    `💬 "${data.funStat}"`,
    '',
    'Track → Notify → Confirm → Settle with OweMe.',
    'https://oweme.in',
  ].join('\n');

  /**
   * Resilient clipboard copy with multi-layer fallback.
   * Works on mobile, desktop, iframes, and insecure origins.
   */
  const copyRecapText = async (text: string): Promise<boolean> => {
    // 1. Modern Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Recap text copied to clipboard!');
        setTimeout(() => setCopied(false), 2500);
        return true;
      } catch {
        // Fall through to execCommand
      }
    }

    // 2. Fallback using hidden textarea & document.execCommand('copy')
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (success) {
        setCopied(true);
        toast.success('Recap text copied to clipboard!');
        setTimeout(() => setCopied(false), 2500);
        return true;
      }
    } catch {
      // Fall through to prompt
    }

    // 3. Last-resort fallback: window.prompt
    try {
      window.prompt('Copy your OweMe Recap text:', text);
      toast.info('Recap text ready to copy.');
      return true;
    } catch {
      toast.error('Unable to copy text to clipboard.');
      return false;
    }
  };

  /**
   * Renders the high-contrast, crystal-clear OweMe Recap Card to an HTML5 Canvas.
   * Uses explicit solid colors and guaranteed font fallbacks for high readability.
   */
  const renderRecapCanvas = async (): Promise<HTMLCanvasElement> => {
    // Ensure fonts are loaded before drawing
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await document.fonts.ready;
      } catch {
        // Fallback safely to system fonts
      }
    }

    const FONT_STACK = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1040;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    // 1. Background gradient (Midnight Indigo / Slate)
    const bgGradient = ctx.createLinearGradient(0, 0, 800, 1040);
    bgGradient.addColorStop(0, '#0a0e1a');
    bgGradient.addColorStop(0.35, '#151336');
    bgGradient.addColorStop(0.7, '#111827');
    bgGradient.addColorStop(1, '#080b12');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 800, 1040);

    // 2. Ambient glow orbs
    // Top-right indigo glow
    const topGlow = ctx.createRadialGradient(720, 100, 20, 720, 100, 360);
    topGlow.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    topGlow.addColorStop(0.5, 'rgba(79, 70, 229, 0.15)');
    topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, 800, 1040);

    // Bottom-left cyan glow
    const bottomGlow = ctx.createRadialGradient(100, 950, 20, 100, 950, 340);
    bottomGlow.addColorStop(0, 'rgba(14, 165, 233, 0.25)');
    bottomGlow.addColorStop(0.6, 'rgba(16, 185, 129, 0.08)');
    bottomGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, 0, 800, 1040);

    // Outer card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 798, 1038);

    // 3. Header: Sparkle Box & Title
    // Sparkle badge background
    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(60, 52, 44, 44, [12]);
    ctx.fill();
    ctx.stroke();

    // Sparkle icon star
    ctx.fillStyle = '#fbbf24';
    ctx.font = `24px ${FONT_STACK}`;
    ctx.fillText('✦', 74, 82);

    // Brand Title
    ctx.font = `bold 32px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('OweMe Recap', 118, 84);

    // Period Badge (Right-aligned pill)
    const periodText = data.periodLabel || 'All Time';
    ctx.font = `600 16px ${FONT_STACK}`;
    const periodWidth = ctx.measureText(periodText).width;
    const badgeX = 740 - periodWidth - 28;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, 58, periodWidth + 28, 34, [17]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(periodText, badgeX + 14, 81);

    // 4. User Section
    ctx.font = `bold 40px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.userName, 60, 155);

    ctx.font = `500 20px ${FONT_STACK}`;
    ctx.fillStyle = '#a5b4fc';
    ctx.fillText(`@${data.username}`, 60, 188);

    // Clean divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 218);
    ctx.lineTo(740, 218);
    ctx.stroke();

    // 5. Stat Box 1: Total Money Tracked (Full Width)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(60, 245, 680, 145, [18]);
    ctx.fill();
    ctx.stroke();

    // Box 1 Label: Solid bright slate
    ctx.font = `600 16px ${FONT_STACK}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('TOTAL MONEY TRACKED', 90, 288);

    // Box 1 Value: Vibrant Cyan
    ctx.font = `bold 50px ${FONT_STACK}`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(formatINR(data.totalTrackedMinor), 90, 354);

    // 6. Stat Box 2: Expenses Logged (Half Width Left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(60, 415, 325, 145, [18]);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 16px ${FONT_STACK}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('EXPENSES LOGGED', 90, 458);

    ctx.font = `bold 48px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(data.expenseCount), 90, 524);

    // 7. Stat Box 3: Friends Split With (Half Width Right)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(415, 415, 325, 145, [18]);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 16px ${FONT_STACK}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('FRIENDS SPLIT WITH', 445, 458);

    ctx.font = `bold 48px ${FONT_STACK}`;
    ctx.fillStyle = '#34d399';
    ctx.fillText(String(data.distinctFriendsCount), 445, 524);

    ctx.font = `500 13px ${FONT_STACK}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('count only · names private', 445, 545);

    // 8. Stat Box 4: Top Category (Full Width)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(60, 585, 680, 115, [18]);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 16px ${FONT_STACK}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('TOP CATEGORY', 90, 626);

    ctx.font = `bold 34px ${FONT_STACK}`;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText((data.topCategory || 'General').toUpperCase(), 90, 672);

    // 9. Box 5: Quote / Fun Stat (Indigo highlight)
    ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(60, 725, 680, 120, [18]);
    ctx.fill();
    ctx.stroke();

    ctx.font = `italic 22px ${FONT_STACK}`;
    ctx.fillStyle = '#e0e7ff';
    ctx.fillText(`“${data.funStat}”`, 90, 792);

    // 10. Footer Section
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 885);
    ctx.lineTo(740, 885);
    ctx.stroke();

    ctx.font = `500 15px ${FONT_STACK}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Verified Privacy: Zero counterparty data exposed', 60, 925);

    ctx.font = `bold 16px ${FONT_STACK}`;
    ctx.fillStyle = '#818cf8';
    ctx.fillText('oweme.in', 668, 925);

    ctx.font = `400 14px ${FONT_STACK}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText('Track → Notify → Confirm → Settle', 60, 955);

    return canvas;
  };

  /**
   * Downloads the high-contrast PNG recap card.
   */
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const canvas = await renderRecapCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `oweme-recap-${data.username}-${data.periodLabel.toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Recap card downloaded!');
    } catch {
      toast.error('Failed to generate recap card image.');
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * Shares the recap using Web Share API with image file support.
   * Falls back to text share and then clipboard.
   */
  const handleShare = async () => {
    setIsSharing(true);
    try {
      const canvas = await renderRecapCanvas();

      // Convert canvas to image file for native image sharing
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      const fileName = `oweme-recap-${data.username}.png`;
      const imageFile = blob ? new File([blob], fileName, { type: 'image/png' }) : null;

      // Check if native Web Share is supported
      if (typeof navigator !== 'undefined' && navigator.share) {
        // Try sharing file + text
        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          try {
            await navigator.share({
              title: `My OweMe Recap • ${data.periodLabel}`,
              text: recapText,
              files: [imageFile],
            });
            toast.success('Recap shared!');
            return;
          } catch (err: unknown) {
            if ((err as Error)?.name === 'AbortError') return; // User closed share drawer
          }
        }

        // Try sharing text only
        try {
          await navigator.share({
            title: `My OweMe Recap • ${data.periodLabel}`,
            text: recapText,
          });
          toast.success('Recap shared!');
          return;
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') return;
        }
      }

      // Fallback: Copy recap text to clipboard
      await copyRecapText(recapText);
    } catch {
      await copyRecapText(recapText);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      {/* Visual Spotify Wrapped-Style Card with Solid High-Contrast Colors */}
      <div
        ref={cardRef}
        style={{
          background: 'linear-gradient(135deg, #0a0e1a 0%, #151336 40%, #0b0f19 100%)',
          borderColor: 'rgba(255, 255, 255, 0.16)',
        }}
        className="relative overflow-hidden rounded-3xl border p-4.5 text-white shadow-2xl backdrop-blur-xl sm:p-6 md:p-8"
      >
        {/* Glow decoration */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl opacity-40"
          style={{ background: '#6366f1' }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl opacity-20"
          style={{ background: '#0ea5e9' }}
        />

        <div className="relative z-10 space-y-4 sm:space-y-5 md:space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                }}
                className="grid h-7 w-7 place-items-center rounded-xl border sm:h-8 sm:w-8"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400 sm:h-4 sm:w-4" />
              </span>
              <span className="font-bold text-sm tracking-wide text-white sm:text-base">OweMe Recap</span>
            </div>
            <Badge
              variant="outline"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.22)',
                color: '#e2e8f0',
              }}
              className="text-[11px] font-semibold px-2.5 py-0.5 sm:px-3 sm:py-1 sm:text-xs"
            >
              {data.periodLabel}
            </Badge>
          </div>

          {/* User info */}
          <div>
            <h3 className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">
              {data.userName}
            </h3>
            <p className="text-xs font-semibold text-indigo-300 sm:text-sm">@{data.username}</p>
          </div>

          {/* Stats Grid - Matches Canvas Layout: Hero Stat Full Width, Two Counts Side-by-Side, Category Full Width */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* Total Money Tracked - Hero Stat spanning full width */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.18)',
              }}
              className="col-span-2 rounded-2xl border p-3.5 sm:p-4.5"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-200 sm:text-xs">
                Total Money Tracked
              </p>
              <p className="mt-1 text-2xl font-black text-sky-400 sm:text-3xl">
                {formatINR(data.totalTrackedMinor)}
              </p>
            </div>

            {/* Expenses Logged - Half Width */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.18)',
              }}
              className="col-span-1 flex flex-col justify-between rounded-2xl border p-3 sm:p-4.5"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-200 sm:text-xs">
                  Expenses Logged
                </p>
                <p className="mt-1 text-2xl font-black text-white sm:text-3xl">
                  {data.expenseCount}
                </p>
              </div>
            </div>

            {/* Friends Split With - Half Width */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.18)',
              }}
              className="col-span-1 flex flex-col justify-between rounded-2xl border p-3 sm:p-4.5"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-200 sm:text-xs">
                  Friends Split With
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-400 sm:text-3xl">
                  {data.distinctFriendsCount}
                </p>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-slate-400 sm:text-[11px]">
                count only · names private
              </p>
            </div>

            {/* Top Category - Full Width */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.18)',
              }}
              className="col-span-2 rounded-2xl border p-3.5 sm:p-4.5"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-200 sm:text-xs">
                Top Category
              </p>
              <p className="mt-1 text-xl font-black uppercase text-amber-400 sm:text-2xl">
                {data.topCategory}
              </p>
            </div>
          </div>

          {/* Fun line / Quote */}
          <div
            style={{
              backgroundColor: 'rgba(99, 102, 241, 0.16)',
              borderColor: 'rgba(129, 140, 248, 0.35)',
            }}
            className="rounded-2xl border p-3.5 sm:p-4"
          >
            <p className="text-xs italic font-medium text-indigo-100 sm:text-sm">&ldquo;{data.funStat}&rdquo;</p>
          </div>

          {/* Footer */}
          <div
            style={{ borderColor: 'rgba(255, 255, 255, 0.12)' }}
            className="flex items-center justify-between gap-2 border-t pt-3 text-[11px] font-medium text-slate-300 sm:text-xs"
          >
            <span className="truncate">Verified Privacy: Zero counterparty data exposed</span>
            <span className="shrink-0 font-bold text-indigo-300">oweme.in</span>
          </div>
        </div>
      </div>

      {/* Action Buttons - 2x2 grid on mobile (with full-width prominent Share button) and flex inline on desktop */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyRecapText(recapText)}
          className="w-full gap-1.5 text-xs font-medium sm:w-auto"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied Text' : 'Copy Text'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full gap-1.5 text-xs font-medium sm:w-auto"
        >
          <Download className="h-3.5 w-3.5" />
          {isDownloading ? 'Generating...' : 'Download Card'}
        </Button>
        <Button
          size="sm"
          onClick={handleShare}
          disabled={isSharing}
          className="col-span-2 w-full gap-1.5 text-xs font-medium sm:col-span-1 sm:w-auto"
        >
          <Share2 className="h-3.5 w-3.5" />
          {isSharing ? 'Sharing...' : 'Share Recap'}
        </Button>
      </div>
    </div>
  );
}

export default RecapCard;
