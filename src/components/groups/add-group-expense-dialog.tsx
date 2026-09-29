'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Wallet,
  PieChart,
  Scale,
  Equal,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckboxRow } from '@/components/groups/checkbox-row';
import { PersonAvatar } from '@/components/person-avatar';
import { createGroupExpense, updateGroupExpense } from '@/lib/actions/expenses';
import { CATEGORIES } from '@/lib/constants';
import { getCategoryIcon } from '@/lib/category-icons';
import { formatINR, parseAmountInput, sanitizeAmountInput, toAmountString, toMinor } from '@/lib/money';
import { splitEqually } from '@/lib/split';
import { minimizeTransfers, type Balance } from '@/lib/settlement';
import type { GroupExpense, GroupMemberRow } from '@/lib/types';
import { cn } from '@/lib/utils';

type ExpenseMode = 'split_equal' | 'divide_custom';
type PayerType = 'single' | 'multiple';

function getInitialExpenseState(
  expenseToEdit: GroupExpense | undefined,
  members: GroupMemberRow[],
  currentUserId: string,
) {
  if (expenseToEdit) {
    const isMultiPayer = (expenseToEdit.payers?.length ?? 0) > 1;
    const initialPayerAmounts: Record<string, string> = {};
    if (expenseToEdit.payers && expenseToEdit.payers.length > 0) {
      for (const p of expenseToEdit.payers) {
        initialPayerAmounts[p.user_id] = (toMinor(p.paid_amount) / 100).toFixed(2);
      }
    }

    const shareMap: Record<string, string> = {};
    const participantList: string[] = [];
    for (const s of expenseToEdit.shares) {
      shareMap[s.user_id] = (toMinor(s.share_amount) / 100).toFixed(2);
      participantList.push(s.user_id);
    }

    // Check if shares are equal among participants
    const totalMinor = toMinor(expenseToEdit.amount);
    let sharesAreEqual = participantList.length > 0;
    if (sharesAreEqual) {
      const equalSplits = splitEqually(totalMinor, participantList);
      for (const es of equalSplits) {
        if (Math.abs(es.share - toMinor(shareMap[es.userId] ?? '0')) > 1) {
          sharesAreEqual = false;
          break;
        }
      }
    }

    const initialMode: ExpenseMode = !isMultiPayer && sharesAreEqual ? 'split_equal' : 'divide_custom';

    return {
      mode: initialMode,
      totalAmount: (toMinor(expenseToEdit.amount) / 100).toFixed(2),
      description: expenseToEdit.description ?? '',
      category: expenseToEdit.category ?? 'Project',
      payerType: isMultiPayer ? ('multiple' as PayerType) : ('single' as PayerType),
      singlePayerId: expenseToEdit.paid_by || expenseToEdit.payers?.[0]?.user_id || currentUserId,
      payerAmounts: initialPayerAmounts,
      participants: participantList.length > 0 ? participantList : members.map((m) => m.user_id),
      shareAmounts: shareMap,
    };
  }

  return {
    mode: 'split_equal' as ExpenseMode,
    totalAmount: '',
    description: '',
    category: 'Project',
    payerType: 'single' as PayerType,
    singlePayerId: currentUserId,
    payerAmounts: {} as Record<string, string>,
    participants: members.map((m) => m.user_id),
    shareAmounts: {} as Record<string, string>,
  };
}

export function AddGroupExpenseDialog({
  groupId,
  members,
  currentUserId,
  disabled,
  expenseToEdit,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  groupId: string;
  members: GroupMemberRow[];
  currentUserId: string;
  disabled?: boolean;
  expenseToEdit?: GroupExpense;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(expenseToEdit);
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(val);
    else setInternalOpen(val);
  };

  const [mode, setMode] = useState<ExpenseMode>('split_equal');

  // Common fields
  const [totalAmount, setTotalAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Project');

  // Payers state
  const [payerType, setPayerType] = useState<PayerType>('single');
  const [singlePayerId, setSinglePayerId] = useState(currentUserId);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});

  // Shares state
  // In mode 1 (equal): participants checkbox list
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.user_id));
  // In mode 2 (custom): share amounts per member
  const [shareAmounts, setShareAmounts] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(crypto.randomUUID());

  // Reset or initialize form when dialog opens/closes or expenseToEdit changes
  useEffect(() => {
    if (open) {
      const init = getInitialExpenseState(expenseToEdit, members, currentUserId);
      setMode(init.mode);
      setTotalAmount(init.totalAmount);
      setDescription(init.description);
      setCategory(init.category);
      setPayerType(init.payerType);
      setSinglePayerId(init.singlePayerId);
      setPayerAmounts(init.payerAmounts);
      setParticipants(init.participants);
      setShareAmounts(init.shareAmounts);
      setError(null);
      requestId.current = crypto.randomUUID();
    }
  }, [open, expenseToEdit, members, currentUserId]);

  const totalMinor = parseAmountInput(totalAmount) ?? 0;

  const nameFor = (userId: string) => {
    if (userId === currentUserId) return 'You';
    const member = members.find((m) => m.user_id === userId);
    return member ? member.profile.full_name.split(' ')[0] : 'Someone';
  };

  const fullNameFor = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    if (userId === currentUserId) return `${member?.profile.full_name ?? 'You'} (You)`;
    return member?.profile.full_name ?? 'Someone';
  };

  // ---------------------------------------------------------------------------
  // Calculations
  // ---------------------------------------------------------------------------

  // Sum of payments
  const paidMinorByUser = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (mode === 'split_equal' && payerType === 'single') {
      if (totalMinor > 0) {
        map[singlePayerId] = totalMinor;
      }
    } else {
      for (const member of members) {
        const val = parseAmountInput(payerAmounts[member.user_id] ?? '') ?? 0;
        if (val > 0) map[member.user_id] = val;
      }
    }
    return map;
  }, [mode, payerType, singlePayerId, totalMinor, members, payerAmounts]);

  const totalPaidMinor = useMemo(() => {
    return Object.values(paidMinorByUser).reduce((sum, val) => sum + val, 0);
  }, [paidMinorByUser]);

  // Sum of shares
  const shareMinorByUser = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (mode === 'split_equal') {
      if (totalMinor > 0 && participants.length > 0) {
        const equalSplits = splitEqually(totalMinor, participants);
        for (const item of equalSplits) {
          map[item.userId] = item.share;
        }
      }
    } else {
      for (const member of members) {
        const val = parseAmountInput(shareAmounts[member.user_id] ?? '') ?? 0;
        if (val > 0) map[member.user_id] = val;
      }
    }
    return map;
  }, [mode, totalMinor, participants, members, shareAmounts]);

  const totalShareMinor = useMemo(() => {
    return Object.values(shareMinorByUser).reduce((sum, val) => sum + val, 0);
  }, [shareMinorByUser]);

  // Net balances per person (paise): paid - share
  const netBalances = useMemo<Balance[]>(() => {
    return members.map((member) => {
      const paid = paidMinorByUser[member.user_id] ?? 0;
      const share = shareMinorByUser[member.user_id] ?? 0;
      return {
        userId: member.user_id,
        amount: paid - share,
      };
    });
  }, [members, paidMinorByUser, shareMinorByUser]);

  // Settlement transfers (who pays whom)
  const transfers = useMemo(() => {
    const netSum = netBalances.reduce((sum, b) => sum + b.amount, 0);
    if (netSum !== 0 || totalMinor <= 0) return [];
    try {
      return minimizeTransfers(netBalances);
    } catch {
      return [];
    }
  }, [netBalances, totalMinor]);

  // Quick helpers
  const handleEqualizeShares = () => {
    if (totalMinor <= 0) return;
    const targetParticipants =
      participants.length > 0 ? participants : members.map((m) => m.user_id);
    const splits = splitEqually(totalMinor, targetParticipants);
    const next: Record<string, string> = {};
    for (const split of splits) {
      next[split.userId] = (split.share / 100).toFixed(2);
    }
    setShareAmounts(next);
  };

  const handleSumFromPayments = () => {
    if (totalPaidMinor > 0) {
      setTotalAmount((totalPaidMinor / 100).toFixed(2));
    }
  };

  const handleFillRemainingPayer = (userId: string) => {
    const currentPaidSum = Object.entries(payerAmounts).reduce((sum, [id, val]) => {
      if (id === userId) return sum;
      return sum + (parseAmountInput(val) ?? 0);
    }, 0);
    const remaining = totalMinor - currentPaidSum;
    if (remaining > 0) {
      setPayerAmounts((prev) => ({
        ...prev,
        [userId]: (remaining / 100).toFixed(2),
      }));
    }
  };

  const handleSetFullPayerForPerson = (userId: string) => {
    if (totalMinor <= 0) {
      toast.error('Enter the total bill amount first.');
      return;
    }
    const fullStr = (totalMinor / 100).toFixed(2);
    const next: Record<string, string> = {};
    for (const m of members) {
      next[m.user_id] = m.user_id === userId ? fullStr : '';
    }
    setPayerAmounts(next);
  };

  const handleFillRemainingShare = (userId: string) => {
    const currentShareSum = Object.entries(shareAmounts).reduce((sum, [id, val]) => {
      if (id === userId) return sum;
      return sum + (parseAmountInput(val) ?? 0);
    }, 0);
    const remaining = totalMinor - currentShareSum;
    if (remaining > 0) {
      setShareAmounts((prev) => ({
        ...prev,
        [userId]: (remaining / 100).toFixed(2),
      }));
    }
  };

  const handleSetFullShareForPerson = (userId: string) => {
    if (totalMinor <= 0) {
      toast.error('Enter the total bill amount first.');
      return;
    }
    const fullStr = (totalMinor / 100).toFixed(2);
    const next: Record<string, string> = {};
    for (const m of members) {
      next[m.user_id] = m.user_id === userId ? fullStr : '';
    }
    setShareAmounts(next);
  };

  // Mode change handler
  const handleModeSwitch = (newMode: ExpenseMode) => {
    setMode(newMode);
    setError(null);
    if (newMode === 'divide_custom') {
      // Seed payer amounts if coming from single payer
      if (payerType === 'single' && totalMinor > 0) {
        setPayerAmounts({ [singlePayerId]: (totalMinor / 100).toFixed(2) });
      }
      // Seed share amounts if coming from equal split
      if (totalMinor > 0 && participants.length > 0) {
        const splits = splitEqually(totalMinor, participants);
        const nextShares: Record<string, string> = {};
        for (const s of splits) {
          nextShares[s.userId] = (s.share / 100).toFixed(2);
        }
        setShareAmounts(nextShares);
      }
    }
  };

  const eligibleSingleParticipants = useMemo(() => {
    if (payerType === 'single' && singlePayerId) {
      const others = members.filter((m) => m.user_id !== singlePayerId);
      return others.length > 0 ? others : members;
    }
    return members;
  }, [members, payerType, singlePayerId]);

  // Validation before submission
  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    if (!totalMinor || totalMinor <= 0) {
      issues.push('Enter a total bill amount.');
      return issues;
    }
    if (totalMinor < 10) {
      issues.push('Minimum total bill is ₹0.10.');
      return issues;
    }
    if (totalMinor > 500000) {
      issues.push('Maximum total bill is ₹5,000.');
      return issues;
    }
    if (!description.trim()) {
      issues.push('Enter what the expense was for.');
    }

    // Payer validation
    if (mode === 'split_equal' && payerType === 'single') {
      if (!singlePayerId) issues.push('Select who paid the bill.');
    } else {
      if (totalPaidMinor !== totalMinor) {
        const diff = Math.abs(totalMinor - totalPaidMinor);
        if (totalPaidMinor < totalMinor) {
          issues.push(`Paid amounts are short by ${formatINR(diff)}.`);
        } else {
          issues.push(`Paid amounts exceed total bill by ${formatINR(diff)}.`);
        }
      }
    }

    // Share validation
    if (mode === 'split_equal') {
      if (participants.length === 0) {
        issues.push('Pick at least one person to split with.');
      } else if (
        payerType === 'single' &&
        participants.length === 1 &&
        participants[0] === singlePayerId
      ) {
        issues.push('A group expense cannot be solely for the payer. Select who you paid for, or choose Everyone.');
      }
    } else {
      if (totalShareMinor !== totalMinor) {
        const diff = Math.abs(totalMinor - totalShareMinor);
        if (totalShareMinor < totalMinor) {
          issues.push(`Shares are short by ${formatINR(diff)}.`);
        } else {
          issues.push(`Shares exceed total bill by ${formatINR(diff)}.`);
        }
      } else if (
        payerType === 'single' &&
        shareMinorByUser[singlePayerId] === totalMinor
      ) {
        issues.push('A group expense cannot be solely for the payer. Allocate shares to other group members.');
      }
    }

    return issues;
  }, [
    totalMinor,
    description,
    mode,
    payerType,
    singlePayerId,
    totalPaidMinor,
    participants,
    totalShareMinor,
    shareMinorByUser,
  ]);

  const isValid = validationIssues.length === 0;

  function submit() {
    if (!isValid) {
      setError(validationIssues[0] ?? 'Please check the amounts.');
      return;
    }
    setError(null);

    startTransition(async () => {
      let payersPayload: Array<{ userId: string; amount: string }> = [];
      if (mode === 'split_equal' && payerType === 'single') {
        payersPayload = [{ userId: singlePayerId, amount: toAmountString(totalMinor) }];
      } else {
        payersPayload = Object.entries(paidMinorByUser).map(([userId, minor]) => ({
          userId,
          amount: toAmountString(minor),
        }));
      }

      let sharesPayload: Array<{ userId: string; amount: string }> = [];
      if (mode === 'split_equal') {
        const splits = splitEqually(totalMinor, participants);
        sharesPayload = splits.map((s) => ({
          userId: s.userId,
          amount: toAmountString(s.share),
        }));
      } else {
        sharesPayload = Object.entries(shareMinorByUser).map(([userId, minor]) => ({
          userId,
          amount: toAmountString(minor),
        }));
      }

      const result = isEditing && expenseToEdit
        ? await updateGroupExpense({
            expenseId: expenseToEdit.id,
            groupId,
            amount: toAmountString(totalMinor),
            description: description.trim(),
            category,
            paidBy: payersPayload[0]?.userId,
            payers: payersPayload,
            participantIds: mode === 'split_equal' ? participants : undefined,
            shares: sharesPayload,
          })
        : await createGroupExpense({
            groupId,
            amount: toAmountString(totalMinor),
            description: description.trim(),
            category,
            paidBy: payersPayload[0]?.userId,
            payers: payersPayload,
            participantIds: mode === 'split_equal' ? participants : undefined,
            shares: sharesPayload,
            clientRequestId: requestId.current,
          });

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(
        isEditing
          ? `Updated expense to ${formatINR(totalMinor)}.`
          : `Recorded ${formatINR(totalMinor)} in the group.`
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-block cursor-pointer">
          {trigger}
        </span>
      ) : isEditing ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>Edit</span>
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} disabled={disabled}>
          <Plus className="h-4 w-4" /> Add group expense
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {isEditing ? 'Edit group expense' : 'Add group expense'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update expense details, payers, or split. Balances and settle-up plans will update dynamically.'
                : 'Record an expense and let OweMe calculate balances and settlements automatically.'}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1.5">
            <button
              type="button"
              onClick={() => handleModeSwitch('split_equal')}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg py-2.5 px-3 text-center transition-all',
                mode === 'split_equal'
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Equal className="h-4 w-4 text-primary" />
                <span>1. Split the bill</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Simple equal split · 1 or multiple payers
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch('divide_custom')}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg py-2.5 px-3 text-center transition-all',
                mode === 'divide_custom'
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Scale className="h-4 w-4 text-amber-500" />
                <span>2. Divide properly</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Custom paid & custom shares
              </span>
            </button>
          </div>

          {/* Top Form Fields */}
          <div className="grid gap-3 sm:grid-cols-3 pt-1">
            <div className="space-y-1.5 sm:col-span-1">
              <div className="flex items-center justify-between h-5">
                <Label htmlFor="group-expense-amount">Total Bill</Label>
                {mode === 'divide_custom' && totalPaidMinor > 0 && totalPaidMinor !== totalMinor && (
                  <button
                    type="button"
                    onClick={handleSumFromPayments}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Sum payments
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-sm font-medium text-muted-foreground pointer-events-none">
                  ₹
                </span>
                <Input
                  id="group-expense-amount"
                  inputMode="decimal"
                  maxLength={7}
                  value={totalAmount}
                  onChange={(event) =>
                    setTotalAmount(sanitizeAmountInput(event.target.value))
                  }
                  placeholder="800"
                  className="pl-7 tabular font-medium h-11"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <div className="flex items-center h-5">
                <Label htmlFor="group-expense-description">What was it?</Label>
              </div>
              <Input
                id="group-expense-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Dinner, groceries, cab..."
                maxLength={200}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <div className="flex items-center h-5">
                <Label>Category</Label>
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Category" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((entry) => {
                    const Icon = getCategoryIcon(entry.value);
                    return (
                      <SelectItem key={entry.value} value={entry.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {entry.value}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* SECTION 1: WHO PAID? (Out of Pocket)                             */}
          {/* ----------------------------------------------------------------- */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-indigo-500/20 p-1 text-indigo-400">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Who paid the bill?</h4>
                  <p className="text-xs text-muted-foreground">
                    Cash, card, or UPI paid <strong className="text-indigo-400">out of pocket</strong>
                  </p>
                </div>
              </div>

              {mode === 'split_equal' && (
                <div className="flex items-center rounded-lg border bg-background p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPayerType('single')}
                    className={cn(
                      'rounded-md px-2.5 py-1 transition-colors',
                      payerType === 'single'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    1 Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerType('multiple')}
                    className={cn(
                      'rounded-md px-2.5 py-1 transition-colors',
                      payerType === 'multiple'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Multiple People
                  </button>
                </div>
              )}
            </div>

            {/* Single Payer Dropdown */}
            {mode === 'split_equal' && payerType === 'single' ? (
              <div className="mt-2">
                <Select value={singlePayerId} onValueChange={setSinglePayerId}>
                  <SelectTrigger aria-label="Who paid">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {fullNameFor(member.user_id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {totalMinor > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {nameFor(singlePayerId)} paid the entire bill of{' '}
                    <strong className="text-foreground">{formatINR(totalMinor)}</strong>.
                  </p>
                )}
              </div>
            ) : (
              /* Multi-Payer Amount List */
              <div className="mt-2 space-y-2">
                <div className="space-y-1.5">
                  {members.map((member) => {
                    const paidVal = payerAmounts[member.user_id] ?? '';
                    return (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-background/80 px-2.5 py-1.5 border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PersonAvatar person={member.profile} className="h-6 w-6" />
                          <span className="truncate text-xs font-medium">
                            {nameFor(member.user_id)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {totalMinor > 0 && totalPaidMinor < totalMinor && (
                            <button
                              type="button"
                              onClick={() => handleFillRemainingPayer(member.user_id)}
                              className="text-[10px] text-indigo-400 hover:underline"
                            >
                              Fill rem.
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">₹</span>
                            <Input
                              inputMode="decimal"
                              maxLength={7}
                              placeholder="0"
                              value={paidVal}
                              onChange={(e) => {
                                const val = sanitizeAmountInput(e.target.value);
                                setPayerAmounts((prev) => ({
                                  ...prev,
                                  [member.user_id]: val,
                                }));
                              }}
                              className="h-8 w-24 text-right tabular text-xs font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-muted-foreground">
                    Total paid: <strong className="tabular text-foreground">{formatINR(totalPaidMinor)}</strong>
                  </span>
                  {totalMinor > 0 && (
                    <span
                      className={cn(
                        'tabular font-medium',
                        totalPaidMinor === totalMinor
                          ? 'text-positive'
                          : 'text-amber-500',
                      )}
                    >
                      {totalPaidMinor === totalMinor ? (
                        '✓ Matches bill'
                      ) : totalPaidMinor < totalMinor ? (
                        `Remaining: ${formatINR(totalMinor - totalPaidMinor)}`
                      ) : (
                        `Over by: ${formatINR(totalPaidMinor - totalMinor)}`
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* SECTION 2: WHO SHARES? (Responsibility / Consumption)            */}
          {/* ----------------------------------------------------------------- */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-amber-500/20 p-1 text-amber-500">
                  <PieChart className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {mode === 'split_equal' ? 'Split between whom?' : 'Who shares how much?'}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Each person’s <strong className="text-amber-500">share / consumption</strong> of this expense
                  </p>
                </div>
              </div>

              {mode === 'split_equal' ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setParticipants(members.map((m) => m.user_id))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      participants.length === members.length
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium'
                        : 'text-primary hover:underline',
                    )}
                  >
                    Everyone
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <Select
                    value={participants.length === 1 && participants[0] !== singlePayerId ? participants[0] : ''}
                    onValueChange={(userId) => setParticipants([userId])}
                  >
                    <SelectTrigger
                      aria-label="Paid entire bill for one person"
                      className="h-7 w-auto min-w-[170px] gap-1 px-2.5 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 font-medium"
                    >
                      <SelectValue placeholder="Paid entire bill for one person" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleSingleParticipants.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id} className="text-xs">
                          Paid full bill for {fullNameFor(member.user_id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleEqualizeShares}
                    className="flex items-center gap-1 font-medium text-amber-500 hover:underline"
                  >
                    <Sparkles className="h-3 w-3" /> Split shares equally
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <Select
                    value=""
                    onValueChange={(userId) => handleSetFullShareForPerson(userId)}
                  >
                    <SelectTrigger
                      aria-label="Paid entire bill for one person"
                      className="h-7 w-auto min-w-[170px] gap-1 px-2.5 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 font-medium"
                    >
                      <SelectValue placeholder="Paid entire bill for one person" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleSingleParticipants.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id} className="text-xs">
                          100% share for {fullNameFor(member.user_id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Mode 1: Equal Split Checkboxes */}
            {mode === 'split_equal' ? (
              <div className="mt-2 space-y-2">
                {participants.length === 1 && participants[0] !== singlePayerId ? (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>
                      <strong>{nameFor(singlePayerId)}</strong> paid the whole bill for <strong>{nameFor(participants[0])}</strong>. Only {nameFor(participants[0])} will owe this amount.
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Choose <strong>Everyone</strong> to split equally, or select someone above if you paid the entire bill for them.
                  </p>
                )}
                <ul className="space-y-1">
                  {members.map((member) => {
                    const isChecked = participants.includes(member.user_id);
                    const sharePaise = shareMinorByUser[member.user_id] ?? 0;

                    return (
                      <li key={member.user_id}>
                        <CheckboxRow
                          checked={isChecked}
                          onCheckedChange={(checked) =>
                            setParticipants((current) =>
                              checked
                                ? [...current, member.user_id]
                                : current.filter((id) => id !== member.user_id),
                            )
                          }
                          label={
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <PersonAvatar person={member.profile} className="h-6 w-6" />
                                <span className="text-xs font-medium">
                                  {fullNameFor(member.user_id)}
                                </span>
                              </span>
                              {isChecked && sharePaise > 0 && (
                                <span className="tabular text-xs font-medium text-muted-foreground">
                                  {formatINR(sharePaise)}
                                </span>
                              )}
                            </div>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>

                {totalMinor > 0 && participants.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Divided across {participants.length} member{participants.length === 1 ? '' : 's'} (
                    {formatINR(Math.round(totalMinor / participants.length))} each).
                  </p>
                )}
              </div>
            ) : (
              /* Mode 2: Custom Shares Inputs */
              <div className="mt-2 space-y-2">
                <div className="space-y-1.5">
                  {members.map((member) => {
                    const shareVal = shareAmounts[member.user_id] ?? '';
                    return (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-background/80 px-2.5 py-1.5 border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PersonAvatar person={member.profile} className="h-6 w-6" />
                          <span className="truncate text-xs font-medium">
                            {nameFor(member.user_id)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {totalMinor > 0 && totalShareMinor < totalMinor && (
                            <button
                              type="button"
                              onClick={() => handleFillRemainingShare(member.user_id)}
                              className="text-[10px] text-amber-500 hover:underline"
                            >
                              Fill rem.
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">₹</span>
                            <Input
                              inputMode="decimal"
                              maxLength={7}
                              placeholder="0"
                              value={shareVal}
                              onChange={(e) => {
                                const val = sanitizeAmountInput(e.target.value);
                                setShareAmounts((prev) => ({
                                  ...prev,
                                  [member.user_id]: val,
                                }));
                              }}
                              className="h-8 w-24 text-right tabular text-xs font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-muted-foreground">
                    Total shares: <strong className="tabular text-foreground">{formatINR(totalShareMinor)}</strong>
                  </span>
                  {totalMinor > 0 && (
                    <span
                      className={cn(
                        'tabular font-medium',
                        totalShareMinor === totalMinor
                          ? 'text-positive'
                          : 'text-amber-500',
                      )}
                    >
                      {totalShareMinor === totalMinor ? (
                        '✓ Matches bill'
                      ) : totalShareMinor < totalMinor ? (
                        `Remaining: ${formatINR(totalMinor - totalShareMinor)}`
                      ) : (
                        `Over by: ${formatINR(totalShareMinor - totalMinor)}`
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* SECTION 3: LIVE RECONCILIATION & SETTLEMENT PREVIEW             */}
          {/* ----------------------------------------------------------------- */}
          {totalMinor > 0 && (
            <div className="rounded-xl border bg-secondary/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Scale className="h-3.5 w-3.5 text-primary" />
                  Calculated Balances & Settlement
                </h4>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-indigo-400">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" /> Paid
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-500">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Share
                  </span>
                </div>
              </div>

              {/* Balances list */}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {members.map((member) => {
                  const paid = paidMinorByUser[member.user_id] ?? 0;
                  const share = shareMinorByUser[member.user_id] ?? 0;
                  const net = paid - share;

                  if (paid === 0 && share === 0) return null;

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between rounded-lg bg-background p-2 text-xs border"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-medium">{nameFor(member.user_id)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Paid: {formatINR(paid)} · Share: {formatINR(share)}
                        </p>
                      </div>

                      <div className="text-right">
                        {net > 0 ? (
                          <span className="font-medium text-positive">
                            +{formatINR(net)}{' '}
                            <span className="text-[10px] font-normal text-positive/80">
                              (to receive)
                            </span>
                          </span>
                        ) : net < 0 ? (
                          <span className="font-medium text-negative">
                            -{formatINR(Math.abs(net))}{' '}
                            <span className="text-[10px] font-normal text-negative/80">
                              (to give)
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-medium">Settled</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Who pays whom settlement preview */}
              {transfers.length > 0 && (
                <div className="rounded-lg border bg-background/80 p-2.5 text-xs space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Who should pay whom for this expense:
                  </p>
                  <ul className="space-y-1 text-xs">
                    {transfers.map((t, idx) => (
                      <li key={idx} className="flex items-center justify-between tabular">
                        <span className="flex items-center gap-1.5">
                          <strong>{nameFor(t.from)}</strong>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <strong>{nameFor(t.to)}</strong>
                        </span>
                        <Badge variant="outline" className="font-semibold text-primary">
                          {formatINR(t.amount)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-negative/10 px-3 py-2 text-xs text-negative"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={pending}
              disabled={pending || !isValid}
              className="min-w-[130px]"
            >
              {isEditing ? 'Save changes' : 'Add to group'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditGroupExpenseDialog({
  groupId,
  members,
  currentUserId,
  expense,
  disabled,
  trigger,
}: {
  groupId: string;
  members: GroupMemberRow[];
  currentUserId: string;
  expense: GroupExpense;
  disabled?: boolean;
  trigger?: React.ReactNode;
}) {
  return (
    <AddGroupExpenseDialog
      groupId={groupId}
      members={members}
      currentUserId={currentUserId}
      expenseToEdit={expense}
      disabled={disabled}
      trigger={trigger}
    />
  );
}
