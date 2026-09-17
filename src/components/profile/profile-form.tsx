'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Info, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateProfile } from '@/lib/actions/profile';
import type { Profile } from '@/lib/types';

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name);
  const [username, setUsername] = useState(profile.username);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  const dirty = fullName !== profile.full_name || username.trim().toLowerCase() !== profile.username;

  function submit() {
    startTransition(async () => {
      const result = await updateProfile({ fullName, username });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success('Saved.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full-name">Your name</Label>
        <Input
          id="full-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={80}
          autoComplete="name"
        />
        <p className="text-xs text-muted-foreground">This is what your friends see on expenses.</p>
        {errors.fullName && <p className="text-xs text-negative">{errors.fullName[0]}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">@</span>
          <Input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            maxLength={24}
            autoCapitalize="none"
            autoComplete="off"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers and underscores. Friends use it to find you.
        </p>
        {errors.username && <p className="text-xs text-negative">{errors.username[0]}</p>}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex items-start gap-2.5">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
        <div>
          <strong className="text-foreground block mb-0.5">Account identity notice</strong>
          To prevent confusion with shared balances, your connected friends will be notified if you change your name or username.
        </div>
      </div>

      <Button onClick={submit} loading={pending} disabled={pending || !dirty}>
        <Save className="h-4 w-4" /> Save changes
      </Button>
    </div>
  );
}
