import { useQuery } from "@tanstack/react-query";
import { BarChart3, RefreshCcw, Trophy, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RankedTable } from "@/components/RankedTable";
import { getRanking } from "@/lib/api";

interface ResultsScreenProps {
  jobId: string;
  scoreIdByCandidate: Record<string, string>;
  onRestart: () => void;
}

export function ResultsScreen({ jobId, scoreIdByCandidate, onRestart }: ResultsScreenProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["rank", jobId],
    queryFn: () => getRanking(jobId),
  });
  const topCandidate = data?.candidates[0];
  const average =
    data && data.candidates.length > 0
      ? Math.round(
          data.candidates.reduce((sum, candidate) => sum + (candidate.overall ?? 0), 0) /
            data.candidates.length,
        )
      : 0;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mesh-panel rounded-2xl border p-6 panel-shadow sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-1.5 bg-white/70 text-primary">
              <Trophy className="size-3.5" />
              Ranked shortlist
            </Badge>
            <h2 className="text-3xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Candidate results
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Review final ranking, score distribution, and candidate-level evidence.
            </p>
          </div>
          <Button variant="outline" className="h-11 gap-2 bg-white/70" onClick={onRestart}>
            <RefreshCcw className="size-4" />
            New job
          </Button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <ResultMetric icon={UsersRound} label="Candidates" value={String(data?.total ?? 0)} />
          <ResultMetric icon={BarChart3} label="Average" value={data ? String(average) : "--"} />
          <ResultMetric
            icon={Trophy}
            label="Top score"
            value={topCandidate?.overall ? topCandidate.overall.toFixed(0) : "--"}
          />
        </div>
      </div>

      <Card className="rounded-2xl border-0 bg-card/95 panel-shadow ring-1 ring-border">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">
            {data ? `${data.total} candidate${data.total === 1 ? "" : "s"} scored` : "Loading…"}
          </CardTitle>
          <CardDescription>Open a row to inspect the score breakdown.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading ranking…</p>}
          {error && <p className="text-sm text-destructive">Couldn't load results.</p>}
          {data && data.candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No completed scores yet for this job.
            </p>
          )}
          {data && data.candidates.length > 0 && (
            <RankedTable candidates={data.candidates} scoreIdByCandidate={scoreIdByCandidate} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ResultMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white/70 p-4">
      <Icon className="mb-3 size-5 text-primary" />
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
