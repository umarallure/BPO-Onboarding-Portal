import { useMemo } from "react";
import { Clock, Flame, Target, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBpoIncentives, type BpoIncentiveWithProgress } from "@/hooks/useBpoIncentives";
import { differenceInSeconds, formatDuration, intervalToDuration } from "date-fns";
import { useEffect, useState } from "react";

function CountdownTimer({ endTime }: { endTime: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const end = new Date(endTime).getTime();
  const diff = Math.max(0, Math.floor((end - now) / 1000));

  if (diff <= 0) return <span className="text-red-500 font-medium">Expired</span>;

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  return (
    <span className="tabular-nums">
      {days > 0 ? `${days}d ` : ""}
      {hours}h {minutes}m
    </span>
  );
}

function IncentiveCard({ incentive }: { incentive: BpoIncentiveWithProgress }) {
  const progress = incentive.progress;
  const currentCount = progress?.current_count ?? 0;
  const targetQuantity = incentive.target_quantity;
  const percentage = Math.min(100, Math.round((currentCount / targetQuantity) * 100));
  const isCompleted = progress?.is_completed ?? false;

  const criteriaParts = incentive.rules.map((rule) => {
    const parts: string[] = [];
    if (rule.state) parts.push(`State: ${rule.state}`);
    if (rule.max_sol_months) parts.push(`SOL < ${rule.max_sol_months}mo`);
    if (rule.attorney_id) parts.push("Specific Attorney");
    return parts.join(" | ");
  });

  return (
    <Card
      className={`relative overflow-hidden border-l-4 transition-all hover:shadow-md ${
        isCompleted
          ? "border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
          : "border-l-orange-500"
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="h-5 w-5 shrink-0 text-orange-500" />
            <CardTitle className="text-sm font-bold truncate">
              {incentive.title}
            </CardTitle>
          </div>
          {isCompleted && (
            <Badge className="shrink-0 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300">
              <Trophy className="mr-1 h-3 w-3" />
              Completed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        {incentive.description && (
          <p className="text-xs text-muted-foreground">{incentive.description}</p>
        )}

        {criteriaParts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {criteriaParts.map((part, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {part}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              <Target className="mr-1 inline h-3 w-3" />
              Progress
            </span>
            <span className="font-medium">
              {currentCount}/{targetQuantity}
            </span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-orange-600 dark:text-orange-400">
            +${Number(incentive.payout_amount).toLocaleString()} Bonus
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <CountdownTimer endTime={incentive.end_time} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChallengeBoard() {
  const { incentives, loading, error } = useBpoIncentives();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Challenges & Flash Promotions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-2 bg-muted rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Challenges & Flash Promotions
        </h2>
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            Failed to load challenges. Please try again later.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (incentives.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Challenges & Flash Promotions
        </h2>
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No active challenges right now. Check back soon for flash promotions!
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" />
        Challenges & Flash Promotions
        <Badge variant="secondary" className="ml-auto">
          {incentives.length} active
        </Badge>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {incentives.slice(0, 6).map((incentive) => (
          <IncentiveCard key={incentive.id} incentive={incentive} />
        ))}
      </div>
    </div>
  );
}
