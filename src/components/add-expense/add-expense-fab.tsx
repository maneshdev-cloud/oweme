'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddExpenseDialog } from '@/components/add-expense/add-expense-dialog';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { FriendRow } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The big "+ Add expense" affordance: a floating action button on phones
 * (thumb-reachable, above the bottom nav) and a normal button on desktop.
 */
export function AddExpenseButton({
  friends,
  label,
  variant = 'fab',
  size,
  className,
  initialFriendId,
  disabled,
}: {
  friends: FriendRow[];
  label?: string;
  variant?: 'fab' | 'inline';
  size?: ButtonProps['size'];
  className?: string;
  initialFriendId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (variant === 'inline') {
    return (
      <>
        <Button size={size} onClick={() => setOpen(true)} disabled={disabled} className={className}>
          <Plus className="h-4 w-4" />
          {label ?? 'Add expense'}
        </Button>
        <AddExpenseDialog open={open} onOpenChange={setOpen} friends={friends} initialFriendId={initialFriendId} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Add expense"
        className={cn(
          'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95 disabled:opacity-50 lg:hidden',
          className,
        )}
      >
        <Plus className="h-5 w-5" aria-hidden />
        Add expense
      </button>
      <AddExpenseDialog open={open} onOpenChange={setOpen} friends={friends} initialFriendId={initialFriendId} />
    </>
  );
}
