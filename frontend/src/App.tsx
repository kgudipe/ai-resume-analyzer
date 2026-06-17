import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { BarChart3, FileSearch, Layers3, Sparkles } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { SetupScreen } from "@/components/SetupScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { ResultsScreen } from "@/components/ResultsScreen";
import { cn } from "@/lib/utils";

type Step =
  | { name: "setup" }
  | { name: "processing"; jobId: string; candidates: { candidateId: string; filename: string }[] }
  | { name: "results"; jobId: string; scoreIdByCandidate: Record<string, string> };

function App() {
  const [step, setStep] = useState<Step>({ name: "setup" });
  const activeStep = step.name;

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
              onStartScoring={(jobId, candidateInfos) => {
                setStep({ name: "processing", jobId, candidates: candidateInfos });
              }}
            />
          )}

          {step.name === "processing" && (
            <ProcessingScreen
              jobId={step.jobId}
              candidates={step.candidates}
              onComplete={(mapping) =>
                setStep({ name: "results", jobId: step.jobId, scoreIdByCandidate: mapping })
              }
            />
          )}

          {step.name === "results" && (
            <ResultsScreen
              jobId={step.jobId}
              scoreIdByCandidate={step.scoreIdByCandidate}
              onRestart={() => setStep({ name: "setup" })}
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

export default App;
