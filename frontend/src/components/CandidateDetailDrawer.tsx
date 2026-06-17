import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleAlert, Loader2, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { getScore } from "@/lib/api";

interface CandidateDetailDrawerProps {
  scoreId: string | null;
  candidateName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidateDetailDrawer({
  scoreId,
  candidateName,
  open,
  onOpenChange,
}: CandidateDetailDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["score", scoreId],
    queryFn: () => getScore(scoreId as string),
    enabled: open && scoreId !== null,
  });

  const payload = data?.payload;
  const chartData =
    payload?.dimensions.map((d) => ({ name: d.name, score: d.score })) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto bg-background sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-primary" />
            {candidateName ?? "Candidate"}
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="mt-8 flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading score details
          </div>
        )}

        {payload && (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border bg-card p-5 panel-shadow">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overall score</p>
                  <p className="mt-1 text-5xl font-semibold tracking-normal">
                    {payload.overall.toFixed(0)}
                  </p>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted sm:w-56">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, payload.overall))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium text-muted-foreground">Score breakdown</p>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 48)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="score" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Summary</p>
              <p className="text-sm leading-7">{payload.summary}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-card p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Matched skills
                </p>
                <div className="flex flex-wrap gap-1">
                  {payload.matched_skills.map((s) => (
                    <Badge key={s} variant="secondary" className="bg-emerald-100 text-emerald-800">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border bg-card p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CircleAlert className="size-4 text-amber-600" />
                  Missing skills
                </p>
                <div className="flex flex-wrap gap-1">
                  {payload.missing_skills.map((s) => (
                    <Badge key={s} variant="outline">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
