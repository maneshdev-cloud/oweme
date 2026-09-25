'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Plus, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { addAuthorizedAdminEmail, removeAuthorizedAdminEmail } from '@/lib/actions/admin';

export type AuthorizedAdminItem = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export function AdminManagementPanel({
  admins,
  currentUserEmail,
}: {
  admins: AuthorizedAdminItem[];
  currentUserEmail?: string;
}) {
  const router = useRouter();
  const [emailInput, setEmailInput] = useState('');
  const [pending, startTransition] = useTransition();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    startTransition(async () => {
      const result = await addAuthorizedAdminEmail({ email });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${email} has been added as an authorized administrator.`);
      setEmailInput('');
      router.refresh();
    });
  };

  const handleRemove = (email: string) => {
    startTransition(async () => {
      const result = await removeAuthorizedAdminEmail({ email });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${email} was removed from administrators.`);
      router.refresh();
    });
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0" aria-hidden />
          <div>
            <CardTitle className="text-base sm:text-lg">Admin Management</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Server-verified administrator authorization. Only approved emails can access /admin.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Form to Add New Admin */}
        <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Add admin by email (e.g. admin@example.com)"
              className="pl-9 text-xs sm:text-sm"
              disabled={pending}
              required
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={pending || !emailInput.trim()}
            loading={pending}
            className="gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" /> Add Admin
          </Button>
        </form>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {admins.map((admin) => {
                const isOwner = admin.role === 'owner' || admin.email.toLowerCase() === 'maneshjadhavofficial@gmail.com';
                const isCurrent = currentUserEmail && admin.email.toLowerCase() === currentUserEmail.toLowerCase();

                return (
                  <tr key={admin.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs sm:text-sm font-medium text-foreground">
                          {admin.email}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] text-muted-foreground">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <Badge variant="default" className="bg-primary/10 text-primary border-primary/20 text-xs font-medium">
                          Owner
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive text-xs font-medium">
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isOwner ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                          Protected
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => handleRemove(admin.email)}
                          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View (No Horizontal Scroll) */}
        <div className="space-y-2 sm:hidden">
          {admins.map((admin) => {
            const isOwner = admin.role === 'owner' || admin.email.toLowerCase() === 'maneshjadhavofficial@gmail.com';
            const isCurrent = currentUserEmail && admin.email.toLowerCase() === currentUserEmail.toLowerCase();

            return (
              <div
                key={admin.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-mono text-xs font-medium text-foreground">
                    {admin.email}
                  </p>
                  <div className="flex items-center gap-2">
                    {isOwner ? (
                      <Badge variant="default" className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 px-1.5">
                        Owner
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive text-[10px] py-0 px-1.5">
                        Active
                      </Badge>
                    )}
                    {isCurrent && (
                      <span className="text-[10px] text-muted-foreground">(you)</span>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {isOwner ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                      Protected
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleRemove(admin.email)}
                      className="h-8 px-2 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
