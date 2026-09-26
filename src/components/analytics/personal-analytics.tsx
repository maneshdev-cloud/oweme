import { ArrowDownLeft, ArrowUpRight, BarChart2, Flame, Sparkles, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryChip } from '@/components/category-chip';
import { formatINR } from '@/lib/money';
import type { PersonalAnalyticsData } from '@/lib/queries/analytics';

export function PersonalAnalyticsView({ data }: { data: PersonalAnalyticsData }) {
  const maxMonthly = Math.max(...data.monthlyTrend.map((m) => m.spentMinor), 1000);

  return (
    <div className="space-y-4">
      {/* Spend & Received Summary Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-primary/20">
          <CardContent className="space-y-1 p-3.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">Spent this month</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="tabular text-xl font-bold text-foreground">
              {formatINR(data.spentThisMonthMinor)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              All time: {formatINR(data.spentAllTimeMinor)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-positive/20">
          <CardContent className="space-y-1 p-3.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">Received this month</span>
              <ArrowDownLeft className="h-3.5 w-3.5 text-positive" />
            </div>
            <p className="tabular text-xl font-bold text-positive">
              {formatINR(data.receivedThisMonthMinor)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              All time: {formatINR(data.receivedAllTimeMinor)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 p-3.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">Top Category</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </div>
            {data.topCategory ? (
              <>
                <div className="pt-0.5">
                  <CategoryChip category={data.topCategory.category} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {formatINR(data.topCategory.amountMinor)} tracked
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">No expenses yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 p-3.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">Highest Single Spending</span>
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
            {data.highestExpense ? (
              <>
                <p className="tabular text-xl font-bold truncate">
                  {formatINR(data.highestExpense.amountMinor)}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {data.highestExpense.description}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">None yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-4 w-4" aria-hidden /> Monthly Spending Trend
          </CardTitle>
          <CardDescription>Your out-of-pocket spending over the last 6 months.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="pt-3">
            <div className="grid grid-cols-6 gap-2">
              {data.monthlyTrend.map((point) => {
                const heightPct = Math.round((point.spentMinor / maxMonthly) * 100);
                return (
                  <div key={point.month} className="flex flex-col items-center gap-2">
                    <div className="relative flex h-28 w-full max-w-[50px] items-end justify-center rounded-lg bg-muted/40 p-1">
                      <div
                        style={{ height: `${Math.max(heightPct, 6)}%` }}
                        className="w-full rounded-t bg-gradient-to-t from-primary/80 to-primary transition-all duration-300 relative group flex items-start justify-center"
                        title={`${point.month}: ${formatINR(point.spentMinor)}`}
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 text-[10px] font-semibold text-primary">
                          {formatINR(point.spentMinor)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{point.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Most Active Splitters (Count only — never show balances) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden /> Most active friend
            </CardTitle>
            <CardDescription className="text-xs">
              Measured by shared expense count (never financial balances).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.mostActiveFriend ? (
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <span className="font-medium text-sm">{data.mostActiveFriend.name}</span>
                <Badge variant="secondary">
                  {data.mostActiveFriend.expenseCount}{' '}
                  {data.mostActiveFriend.expenseCount === 1 ? 'split' : 'splits'}
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No friend splits yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Flame className="h-4 w-4 text-muted-foreground" aria-hidden /> Most active group
            </CardTitle>
            <CardDescription className="text-xs">
              Measured by group expense count.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.mostActiveGroup ? (
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <span className="font-medium text-sm">{data.mostActiveGroup.name}</span>
                <Badge variant="secondary">
                  {data.mostActiveGroup.expenseCount}{' '}
                  {data.mostActiveGroup.expenseCount === 1 ? 'expense' : 'expenses'}
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No group activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
