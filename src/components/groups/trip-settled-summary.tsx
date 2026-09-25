'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Copy, Share2, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PersonAvatar } from '@/components/person-avatar';
import { formatINR, toMinor } from '@/lib/money';
import { toast } from 'sonner';
import type { GroupMemberRow } from '@/lib/types';
import type { Transfer } from '@/lib/settlement';

interface TripSettledSummaryProps {
  groupName: string;
  totalGroupSpendMinor: number;
  members: GroupMemberRow[];
  transfers: Transfer[];
}

export function TripSettledSummary({
  groupName,
  totalGroupSpendMinor,
  members,
  transfers,
}: TripSettledSummaryProps) {
  const [copied, setCopied] = useState(false);

  const nameOf = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    return member?.profile.full_name ?? 'Someone';
  };

  const generateSummaryText = () => {
    const lines = [
      `🎉 Trip settled ✓ — ${groupName}`,
      `💰 Total group spend: ${formatINR(totalGroupSpendMinor)}`,
      '',
      '👥 Who paid what:',
      ...members.map(
        (m) =>
          `• ${m.profile.full_name}: paid ${formatINR(toMinor(m.paid))} (share: ${formatINR(toMinor(m.share))})`
      ),
      '',
    ];

    if (transfers.length > 0) {
      lines.push('🤝 Final settlements:');
      transfers.forEach((t) => {
        lines.push(`• ${nameOf(t.from)} paid ${formatINR(t.amount)} to ${nameOf(t.to)}`);
      });
      lines.push('');
    }

    lines.push('All square! Tracked via OweMe.');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateSummaryText());
      setCopied(true);
      toast.success('Settlement summary copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const handleShare = async () => {
    const text = generateSummaryText();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${groupName} — Trip Settled ✓`,
          text,
        });
      } catch {
        // User cancelled or share failed, fallback to copy
        await handleCopy();
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <Card className="overflow-hidden border-positive/30 bg-gradient-to-b from-positive/5 via-card to-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-positive/20 text-positive">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <CardTitle className="text-base font-semibold">Trip settled ✓</CardTitle>
              <Badge variant="positive" className="text-[11px]">
                All square
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              All member balances in <strong>{groupName}</strong> have reached zero.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 h-8 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" onClick={handleShare} className="gap-1.5 h-8 text-xs">
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Total Group Spend Banner */}
        <div className="flex items-center justify-between rounded-xl bg-card border p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Trophy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Total Group Spend</p>
              <p className="text-lg font-bold tracking-tight text-foreground">
                {formatINR(totalGroupSpendMinor)}
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{members.length} members</span>
        </div>

        {/* Who Paid What */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
            Who paid what
          </p>
          <div className="divide-y rounded-xl border bg-card/60">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between p-3 text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PersonAvatar person={member.profile} className="h-7 w-7" />
                  <span className="truncate font-medium">{member.profile.full_name}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-foreground">
                    {formatINR(toMinor(member.paid))}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    share: {formatINR(toMinor(member.share))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Final Simplified Transfers */}
        {transfers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
              Final Transfers Resolved
            </p>
            <div className="space-y-1.5 rounded-xl border bg-card/60 p-3 text-xs">
              {transfers.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-medium">{nameOf(t.from)}</strong> paid{' '}
                    <strong className="text-foreground font-medium">{nameOf(t.to)}</strong>
                  </span>
                  <span className="font-semibold text-positive">{formatINR(t.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
