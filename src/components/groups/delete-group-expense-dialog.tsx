'use client';

import { useState, useTransition } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { deleteGroupExpense } from '@/lib/actions/expenses';
import { formatINR, toMinor } from '@/lib/money';
import type { GroupExpense } from '@/lib/types';

export function DeleteGroupExpenseDialog({
  expense,
  trigger,
}: {
  expense: GroupExpense;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteGroupExpense({ expenseId: expense.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Removed "${expense.description}". Group balances updated.`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Delete this expense"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Delete group expense
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2 text-left">
            <span>
              Are you sure you want to delete <strong>&quot;{expense.description}&quot;</strong> (
              {formatINR(toMinor(expense.amount))})?
            </span>
            <span className="block text-xs text-muted-foreground">
              This will remove the entry completely and automatically recalculate everyone&apos;s share and balance back to how it was before.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} onClick={handleDelete}>
            Delete expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
