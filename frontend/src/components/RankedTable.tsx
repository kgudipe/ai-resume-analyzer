import { useState } from "react";
import { ArrowUpRight, Medal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CandidateDetailDrawer } from "@/components/CandidateDetailDrawer";
import type { RankedCandidate } from "@/lib/api";

interface RankedTableProps {
  candidates: RankedCandidate[];
  // map candidate_id -> score_id, since /rank doesn't return score_id directly
  scoreIdByCandidate: Record<string, string>;
}

export function RankedTable({ candidates, scoreIdByCandidate }: RankedTableProps) {
  const [selected, setSelected] = useState<RankedCandidate | null>(null);

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-20">Rank</TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead className="w-48">Score</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => (
              <TableRow
                key={c.candidate_id}
                className="cursor-pointer bg-card transition-colors hover:bg-accent/40"
                onClick={() => setSelected(c)}
              >
                <TableCell>
                  <div className="flex items-center gap-2 font-semibold">
                    <Medal className="size-4 text-primary" />
                    {c.rank}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{c.name ?? "Unnamed candidate"}</TableCell>
                <TableCell>
                  <ScoreCell score={c.overall} />
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">
                  {c.summary ?? "No summary available"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon-sm" aria-label="Open candidate details">
                    <ArrowUpRight className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
          {candidates.map((c) => (
            <button
              key={c.candidate_id}
              type="button"
              className="rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/40"
              onClick={() => setSelected(c)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">#{c.rank}</Badge>
                    <p className="truncate font-semibold">{c.name ?? "Unnamed candidate"}</p>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {c.summary ?? "No summary available"}
                  </p>
                </div>
                <Badge variant={c.overall && c.overall >= 70 ? "default" : "secondary"}>
                  {c.overall?.toFixed(0) ?? "--"}
                </Badge>
              </div>
              <div className="mt-4">
                <ScoreCell score={c.overall} />
              </div>
            </button>
          ))}
      </div>

      <CandidateDetailDrawer
        scoreId={selected ? scoreIdByCandidate[selected.candidate_id] ?? null : null}
        candidateName={selected?.name ?? null}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  const value = Math.max(0, Math.min(100, score ?? 0));

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <Badge variant={value >= 70 ? "default" : "secondary"}>{score?.toFixed(0) ?? "--"}</Badge>
    </div>
  );
}
