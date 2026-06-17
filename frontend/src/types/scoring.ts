export type CandidateStatus = "queued" | "scoring" | "done" | "failed";

export interface CandidateProgress {
  candidateId: string;
  filename: string;
  status: CandidateStatus;
  scoreId: string | null;
  overall: number | null;
  error: string | null;
}