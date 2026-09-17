'use client';

import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Accessible checkbox row (Radix) used for picking members and members-splitting. */
export function CheckboxRow({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <Checkbox.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
      >
        <Checkbox.Indicator>
          <Check className="h-3.5 w-3.5" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}
