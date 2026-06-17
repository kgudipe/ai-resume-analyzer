import { useCallback, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { BarChart3, FileSearch, Layers3, Sparkles } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { SetupScreen } from "@/components/SetupScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { ResultsScreen } from "@/components/ResultsScreen";
import { cn } from "@/lib/utils";
import type { JobOut, UploadResponse } from "@/lib/api";

type Step =
  | { name: "setup"; job: JobOut | null; uploaded: UploadResponse[] }
  | {
      name: "processing";
      jobId: string;
      candidates: { candidateId: string; filename: string }[];
      finished?: boolean;
      scoreIdByCandidate?: Record<string, string>;
    }
  | { name: "results"; jobId: string; scoreIdByCandidate: Record<string, string> };

const STORAGE_KEY = "resume-analyzer.workflow.v1";
const HISTORY_STATE_KEY = "resume-analyzer.workflow";
const INITIAL_STEP: Step = { name: "setup", job: null, uploaded: [] };

function App() {
  const [step, setStep] = useState<Step>(() => loadStoredStep());
  const activeStep = step.name;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(step));
  }, [step]);

  useEffect(() => {
    window.history.replaceState(toHistoryState(step), "");

    const handlePopState = (event: PopStateEvent) => {
      const historyStep = readHistoryStep(event.state);
      setStep(historyStep ?? loadStoredStep());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // initialize browser history once for the restored workflow entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateStep = useCallback((nextStep: Step, mode: "push" | "replace" = "push") => {
    setStep(nextStep);
    if (mode === "push") {
      window.history.pushState(toHistoryState(nextStep), "");
    } else {
      window.history.replaceState(toHistoryState(nextStep), "");
    }
  }, []);

  const resetWorkflow = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    navigateStep(INITIAL_STEP);
  };
  const updateSetupState = useCallback((job: JobOut | null, uploaded: UploadResponse[]) => {
    navigateStep({ name: "setup", job, uploaded }, "replace");
  }, [navigateStep]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <header className="border-b bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <FileSearch className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI Resume Analyzer</p>
                <h1 className="text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                  Resume Intelligence Platform
                </h1>
              </div>
            </div>

            <nav className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-1 text-sm panel-shadow lg:min-w-[28rem]">
              <StepPill
                active={activeStep === "setup"}
                done={activeStep !== "setup"}
                icon={Layers3}
                label="Setup"
              />
              <StepPill
                active={activeStep === "processing"}
                done={activeStep === "results"}
                icon={Sparkles}
                label="Score"
              />
              <StepPill
                active={activeStep === "results"}
                done={false}
                icon={BarChart3}
                label="Rank"
              />
            </nav>
          </div>
        </header>

        <main>
          {step.name === "setup" && (
            <SetupScreen
              initialJob={step.job}
              initialUploaded={step.uploaded}
              onSetupChange={updateSetupState}
              onStartScoring={(jobId, candidateInfos) => {
                navigateStep(
                  {
                    name: "processing",
                    jobId,
                    candidates: candidateInfos,
                    finished: false,
                    scoreIdByCandidate: {},
                  },
                  "push",
                );
              }}
            />
          )}

          {step.name === "processing" && (
            <ProcessingScreen
              jobId={step.jobId}
              candidates={step.candidates}
              initialFinished={step.finished ?? false}
              initialScoreIdByCandidate={step.scoreIdByCandidate ?? {}}
              onProcessingFinished={(mapping) =>
                navigateStep(
                  {
                    name: "processing",
                    jobId: step.jobId,
                    candidates: step.candidates,
                    finished: true,
                    scoreIdByCandidate: mapping,
                  },
                  "replace",
                )
              }
              onComplete={(mapping) =>
                navigateStep(
                  { name: "results", jobId: step.jobId, scoreIdByCandidate: mapping },
                  "push",
                )
              }
            />
          )}

          {step.name === "results" && (
            <ResultsScreen
              jobId={step.jobId}
              scoreIdByCandidate={step.scoreIdByCandidate}
              onRestart={resetWorkflow}
            />
          )}
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function StepPill({
  active,
  done,
  icon: Icon,
  label,
}: {
  active: boolean;
  done: boolean;
  icon: typeof Layers3;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-lg px-3 font-medium text-muted-foreground transition-colors",
        active && "bg-primary text-primary-foreground shadow-sm",
        done && !active && "bg-accent text-accent-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </div>
  );
}

function loadStoredStep(): Step {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STEP;

    const parsed = JSON.parse(raw) as Step;
    if (parsed.name === "setup") {
      return {
        name: "setup",
        job: parsed.job ?? null,
        uploaded: Array.isArray(parsed.uploaded) ? parsed.uploaded : [],
      };
    }
    if (parsed.name === "processing" && parsed.jobId && Array.isArray(parsed.candidates)) {
      return {
        name: "processing",
        jobId: parsed.jobId,
        candidates: parsed.candidates,
        finished: parsed.finished ?? false,
        scoreIdByCandidate: parsed.scoreIdByCandidate ?? {},
      };
    }
    if (parsed.name === "results" && parsed.jobId && parsed.scoreIdByCandidate) {
      return parsed;
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return INITIAL_STEP;
}

function toHistoryState(step: Step) {
  return {
    key: HISTORY_STATE_KEY,
    step,
  };
}

function readHistoryStep(state: unknown): Step | null {
  if (!state || typeof state !== "object") return null;
  const value = state as { key?: unknown; step?: unknown };
  if (value.key !== HISTORY_STATE_KEY || !value.step || typeof value.step !== "object") {
    return null;
  }

  return normalizeStep(value.step as Step);
}

function normalizeStep(parsed: Step): Step | null {
  if (parsed.name === "setup") {
    return {
      name: "setup",
      job: parsed.job ?? null,
      uploaded: Array.isArray(parsed.uploaded) ? parsed.uploaded : [],
    };
  }
  if (parsed.name === "processing" && parsed.jobId && Array.isArray(parsed.candidates)) {
    return {
      name: "processing",
      jobId: parsed.jobId,
      candidates: parsed.candidates,
      finished: parsed.finished ?? false,
      scoreIdByCandidate: parsed.scoreIdByCandidate ?? {},
    };
  }
  if (parsed.name === "results" && parsed.jobId && parsed.scoreIdByCandidate) {
    return parsed;
  }

  return null;
}

export default App;
