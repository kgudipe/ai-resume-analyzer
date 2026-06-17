import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BriefcaseBusiness, CheckCircle2, Loader2, TextSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createJob, extractErrorMessage, type JobOut } from "@/lib/api";
import { toast } from "sonner";

interface JobFormProps {
  onJobCreated: (job: JobOut) => void;
}

export function JobForm({ onJobCreated }: JobFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () => createJob(title.trim(), description.trim()),
    onSuccess: (job) => {
      toast.success("Job created", { description: job.title });
      onJobCreated(job);
    },
    onError: (err) => {
      toast.error("Couldn't create job", { description: extractErrorMessage(err) });
    },
  });

  const canSubmit = title.trim().length >= 2 && description.trim().length >= 20;

  return (
    <Card className="rounded-2xl border-0 bg-card/95 panel-shadow ring-1 ring-border">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TextSearch className="size-5 text-primary" />
          Role profile
        </CardTitle>
        <CardDescription>Paste the role context used to score each candidate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor="job-title">
            <BriefcaseBusiness className="size-4 text-muted-foreground" />
            Title
          </label>
          <Input
            id="job-title"
            placeholder="Senior Backend Engineer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={255}
            className="h-11 bg-background text-base"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="job-description">
            Description
          </label>
          <Textarea
            id="job-description"
            placeholder="Paste the full job description here (min 20 characters)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            maxLength={20_000}
            className="min-h-64 resize-y bg-background text-base leading-7"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{description.trim().length} / 20,000 characters</span>
            <span>{description.trim().length >= 20 ? "Minimum met" : "20 characters minimum"}</span>
          </div>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={!canSubmit || mutation.isPending}
          className="h-11 w-full gap-2"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Save role
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
