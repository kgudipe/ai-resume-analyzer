import { useQuery } from "@tanstack/react-query";
import { getScore, type ScoreResponse } from "@/lib/api";

/**
 * Polls a single score until it reaches a terminal state (complete/failed).
 * Used for the brief window between "Groq call kicked off" and "row committed" —
 * in this app /api/score is synchronous and already returns the terminal
 * state, but polling stays in place because Phase 2 (queued custom-model
 * inference) may turn scoring into a genuinely async background job.
 */
export function useScorePolling(scoreId: string | null) {
  return useQuery<ScoreResponse>({
    queryKey: ["score", scoreId],
    queryFn: () => getScore(scoreId as string),
    enabled: scoreId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "complete" || status === "failed") return false;
      return 1500;
    },
  });
}