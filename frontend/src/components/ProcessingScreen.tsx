import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  Activity,
  FileSearch,
} from "lucide-react";
import { scoreCandidate, extractErrorMessage, type ScoreResponse } from "@/lib/api";
import { runWithConcurrencyLimit } from "@/lib/concurrencyLimiter";
import type { CandidateProgress } from "@/types/scoring";

interface ProcessingScreenProps {
  jobId: string;
  candidates: { candidateId: string; filename: string }[];
  onComplete: (scoreIdByCandidate: Record<string, string>) => void; // ← changed
}

// Groq free tier: 30 RPM. A concurrency of 4 keeps us comfortably under that
// even accounting for retry/backoff traffic from the scorer itself.
const CONCURRENCY = 4;

export function ProcessingScreen({ jobId, candidates, onComplete }: ProcessingScreenProps) {
  const [progress, setProgress] = useState<CandidateProgress[]>(
    candidates.map((c) => ({
      candidateId: c.candidateId,
      filename: c.filename,
      status: "queued",
      scoreId: null,
      overall: null,
      error: null,
    })),
  );
  const [isFinished, setIsFinished] = useState(false);
  const [scoreIdByCandidate, setScoreIdByCandidate] = useState<Record<string, string>>({});
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // guard against StrictMode double-invoke
    startedRef.current = true;
    const completedScores: Record<string, string> = {};

    runWithConcurrencyLimit(
      candidates,
      CONCURRENCY,
      async (candidate) => {
        setProgress((prev) =>
          prev.map((p) =>
            p.candidateId === candidate.candidateId ? { ...p, status: "scoring" } : p,
          ),
        );
        return scoreCandidate(jobId, candidate.candidateId, "groq");
      },
      (candidate, _index, result, error) => {
        if (isCompleteScore(result)) {
          completedScores[candidate.candidateId] = result.score_id;
        }

        setProgress((prev) =>
          prev.map((p) => {
            if (p.candidateId !== candidate.candidateId) return p;
            if (error) {
              return { ...p, status: "failed", error: extractErrorMessage(error) };
            }
            if (result?.status === "complete") {
              return {
                ...p,
                status: "done",
                scoreId: result.score_id,
                overall: result.payload?.overall ?? null,
              };
            }
            return { ...p, status: "failed", error: result?.error ?? "Unknown error" };
          }),
        );
      },
    ).then(() => {
      setScoreIdByCandidate(completedScores);
      setIsFinished(true);
    });
    // intentionally run once on mount — candidates/jobId are stable for the
    // lifetime of this screen by design (SetupScreen owns the wizard step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = progress.filter((p) => p.status === "done" || p.status === "failed").length;
  const successCount = progress.filter((p) => p.status === "done").length;
  const failedCount = progress.filter((p) => p.status === "failed").length;
  const pct = candidates.length > 0 ? Math.round((doneCount / candidates.length) * 100) : 0;
  const activeCount = progress.filter((p) => p.status === "scoring").length;

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8 lg:py-8">
      <div className="rounded-2xl border bg-card p-6 panel-shadow">
        <Badge variant="secondary" className="gap-1.5 text-primary">
          <Activity className="size-3.5" />
          Scoring run
        </Badge>
        <div className="mt-8 flex justify-center">
          <div
            className="score-ring flex size-52 items-center justify-center rounded-full"
            style={{ "--score-value": `${pct}%` } as CSSProperties}
          >
            <div className="text-center">
              <p className="text-5xl font-semibold tracking-normal">{pct}%</p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">complete</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <RunMetric label="Scored" value={String(successCount)} />
          <RunMetric label="Active" value={String(activeCount)} />
          <RunMetric label="Failed" value={String(failedCount)} />
        </div>

        {isFinished && (
          <div className="mt-5 rounded-xl border bg-background/70 p-4">
            {successCount > 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                  <div>
                    <p className="font-medium">Scoring complete</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {successCount} candidate{successCount === 1 ? "" : "s"} scored successfully.
                    </p>
                  </div>
                </div>
                <Button
                  className="h-11 w-full gap-2"
                  onClick={() => onComplete(scoreIdByCandidate)}
                >
                  View ranking
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 text-amber-600" />
                <div>
                  <p className="font-medium">No candidates scored</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Every score request failed. Check the failed row details below and retry after
                    fixing the backend/API issue.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Card className="rounded-2xl border-0 bg-card/95 panel-shadow ring-1 ring-border">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSearch className="size-5 text-primary" />
            Candidate queue
          </CardTitle>
          <CardDescription>
            {doneCount} of {candidates.length} candidates processed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Progress value={pct} className="[&_[data-slot=progress-track]]:h-2" />
          <ul className="grid gap-3">
            {progress.map((p) => (
              <li
                key={p.candidateId}
                className="flex min-h-16 items-center gap-3 rounded-xl border bg-background/70 px-4 py-3 text-sm"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <FileSearch className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.error ?? `Candidate ID ${p.candidateId.slice(0, 8)}`}
                  </p>
                </div>
                <StatusChip status={p.status} overall={p.overall} error={p.error} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function isCompleteScore(result: ScoreResponse | null): result is ScoreResponse {
  return result?.status === "complete" && Boolean(result.score_id);
}

function RunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function StatusChip({
  status,
  overall,
  error,
}: {
  status: CandidateProgress["status"];
  overall: number | null;
  error: string | null;
}) {
  switch (status) {
    case "queued":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> Queued
        </Badge>
      );
    case "scoring":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Scoring
        </Badge>
      );
    case "done":
      return (
        <Badge variant="secondary" className="gap-1 text-green-600">
          <CheckCircle2 className="h-3 w-3" /> {overall?.toFixed(0)}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1" title={error ?? undefined}>
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
  }
}
