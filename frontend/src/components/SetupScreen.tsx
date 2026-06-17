import { useState } from "react";
import { ArrowRight, BriefcaseBusiness, FileStack, Gauge, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobForm } from "@/components/JobForm";
import { ResumeDropzone } from "@/components/ResumeDropzone";
import { Badge } from "@/components/ui/badge";
import type { JobOut, UploadResponse } from "@/lib/api";

interface SetupScreenProps {
  onStartScoring: (
    jobId: string,
    candidates: { candidateId: string; filename: string }[],
  ) => void;
}

export function SetupScreen({ onStartScoring }: SetupScreenProps) {
  const [job, setJob] = useState<JobOut | null>(null);
  const [uploaded, setUploaded] = useState<UploadResponse[]>([]);

  const canStart = job !== null && uploaded.length > 0;

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="mesh-panel overflow-hidden rounded-2xl border p-6 panel-shadow sm:p-8">
          <Badge variant="secondary" className="mb-5 gap-1.5 bg-white/70 text-primary">
            <ShieldCheck className="size-3.5" />
            Candidate matching console
          </Badge>
          <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
            Rank resumes against the role signal.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Create a role profile, upload resumes, and send candidates through the scoring pipeline.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Metric icon={BriefcaseBusiness} label="Role" value={job ? "Ready" : "Draft"} />
            <Metric icon={FileStack} label="Resumes" value={String(uploaded.length)} />
            <Metric icon={Gauge} label="Engine" value="Groq" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 panel-shadow">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Run readiness</p>
              <p className="mt-1 text-lg font-semibold">
                {canStart ? "Candidate scoring is ready" : "Role and resume input needed"}
              </p>
            </div>
            <Badge variant={canStart ? "default" : "secondary"}>
              {canStart ? "Ready" : "Waiting"}
            </Badge>
          </div>
          <div className="mt-5 grid gap-3">
            <ReadinessItem complete={job !== null} label="Job profile saved" />
            <ReadinessItem complete={uploaded.length > 0} label="At least one resume uploaded" />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <JobForm onJobCreated={setJob} />

        {job && (
          <ResumeDropzone
            jobId={job.id}
            onUploaded={(res) => setUploaded((prev) => [...prev, res])}
          />
        )}

        <Button
          size="lg"
          className="h-12 w-full gap-2 text-base"
          disabled={!canStart}
          onClick={() => {
            if (job)
              onStartScoring(
                job.id,
                uploaded.map((u) => ({
                  candidateId: u.candidate_id,
                  filename: u.filename,
                })),
              );
          }}
        >
          Start scoring
          <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-sm">
            {uploaded.length}
          </span>
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white/70 p-4">
      <Icon className="mb-3 size-5 text-primary" />
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ReadinessItem({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5">
      <span
        className={`size-2.5 rounded-full ${complete ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
