import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UsageDataPoint } from '@/lib/queries/admin';

export function AdminUsageChart({ data }: { data: UsageDataPoint[] }) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.signups, d.expenses)), 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" aria-hidden /> Usage over time
            </CardTitle>
            <CardDescription>Weekly signups and expenses logged (last 4 weeks).</CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
              <span className="text-muted-foreground">Signups</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span className="text-muted-foreground">Expenses</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-4">
            {data.map((point) => {
              const signupHeightPct = Math.round((point.signups / maxVal) * 100);
              const expenseHeightPct = Math.round((point.expenses / maxVal) * 100);

              return (
                <div key={point.label} className="flex flex-col items-center gap-2">
                  <div className="relative flex h-32 w-full max-w-[80px] items-end justify-center gap-1.5 rounded-lg bg-muted/30 p-1.5">
                    {/* Signups Bar */}
                    <div
                      style={{ height: `${Math.max(signupHeightPct, 4)}%` }}
                      className="w-1/2 rounded-t bg-primary transition-all duration-300 relative group flex items-start justify-center"
                      title={`${point.signups} signups`}
                    >
                      <span className="opacity-0 group-hover:opacity-100 absolute -top-5 text-[10px] font-semibold text-primary">
                        {point.signups}
                      </span>
                    </div>

                    {/* Expenses Bar */}
                    <div
                      style={{ height: `${Math.max(expenseHeightPct, 4)}%` }}
                      className="w-1/2 rounded-t bg-emerald-500 transition-all duration-300 relative group flex items-start justify-center"
                      title={`${point.expenses} expenses`}
                    >
                      <span className="opacity-0 group-hover:opacity-100 absolute -top-5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {point.expenses}
                      </span>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-xs font-medium text-foreground">{point.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {point.signups}s · {point.expenses}e
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
