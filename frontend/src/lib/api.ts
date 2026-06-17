import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  timeout: 60_000, // generous — Render cold start can take 30-60s
});

// ── Types mirroring backend/app/schemas.py ──────────────────────────────────

export interface JobOut {
  id: string;
  title: string;
  requirements: Record<string, unknown> | null;
}

export interface UploadResponse {
  candidate_id: string;
  job_id: string;
  filename: string;
  chars_extracted: number;
  chunks_indexed: number;
}

export interface DimensionScore {
  name: string;
  score: number;
  reasoning: string;
}

export interface ScorePayload {
  overall: number;
  dimensions: DimensionScore[];
  summary: string;
  matched_skills: string[];
  missing_skills: string[];
}

export interface ScoreResponse {
  score_id: string;
  candidate_id: string;
  status: "pending" | "complete" | "failed";
  model: string;
  payload: ScorePayload | null;
  error: string | null;
}

export interface RankedCandidate {
  score_id: string;
  candidate_id: string;
  name: string | null;
  overall: number | null;
  summary: string | null;
  rank: number;
}

export interface RankResponse {
  job_id: string;
  total: number;
  candidates: RankedCandidate[];
}

export interface ProblemDetail {
  detail: string;
  code: string;
  request_id: string;
}

// ── Endpoint wrappers ────────────────────────────────────────────────────────

export async function createJob(title: string, description: string): Promise<JobOut> {
  const { data } = await api.post<JobOut>("/api/jobs", { title, description });
  return data;
}

export async function uploadResume(
  jobId: string,
  file: File,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadResponse>(
    `/api/jobs/${jobId}/upload`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function scoreCandidate(
  jobId: string,
  candidateId: string,
  model: "groq" | "fallback" | "custom" = "groq",
): Promise<ScoreResponse> {
  const { data } = await api.post<ScoreResponse>("/api/score", {
    job_id: jobId,
    candidate_id: candidateId,
    model,
  });
  return data;
}

export async function getScore(scoreId: string): Promise<ScoreResponse> {
  const { data } = await api.get<ScoreResponse>(`/api/scores/${scoreId}`);
  return data;
}

export async function getRanking(jobId: string): Promise<RankResponse> {
  const { data } = await api.get<RankResponse>(`/api/jobs/${jobId}/rank`);
  return data;
}

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const problem = err.response?.data as ProblemDetail | undefined;
    if (problem?.detail) return problem.detail;
    if (err.code === "ECONNABORTED") return "Request timed out — server may be waking up.";
  }
  return "Something went wrong. Please try again.";
}
