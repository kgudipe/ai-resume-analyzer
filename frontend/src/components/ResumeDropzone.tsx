import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, XCircle, Upload, FileUp, Files } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { uploadResume, extractErrorMessage, type UploadResponse } from "@/lib/api";
import { toast } from "sonner";
import type { PendingResume } from "@/types/job";

interface ResumeDropzoneProps {
  jobId: string;
  uploaded?: UploadResponse[];
  onUploaded: (res: UploadResponse) => void;
}

type FileStatus = "queued" | "uploading" | "done" | "failed";

interface TrackedFile extends PendingResume {
  status: FileStatus;
  error?: string;
}

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
};
const MAX_SIZE = 5 * 1024 * 1024; // mirrors backend's 5MB limit

export function ResumeDropzone({ jobId, uploaded = [], onUploaded }: ResumeDropzoneProps) {
  const [files, setFiles] = useState<TrackedFile[]>([]);

  const mutation = useMutation({
    mutationFn: ({ file }: { file: File; trackedId: string }) =>
      uploadResume(jobId, file),
    onSuccess: (res, { trackedId }) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === trackedId ? { ...f, status: "done" } : f)),
      );
      onUploaded(res);
    },
    onError: (err, { trackedId }) => {
      const message = extractErrorMessage(err);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === trackedId ? { ...f, status: "failed", error: message } : f,
        ),
      );
      toast.error("Upload failed", { description: message });
    },
  });

  const onDrop = useCallback(
    (accepted: File[]) => {
      const tracked: TrackedFile[] = accepted.map((file) => ({
        file,
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        status: "queued",
      }));
      setFiles((prev) => [...prev, ...tracked]);

      // Sequential, not parallel — keeps within Groq RPM/cold-start limits
      // and avoids overwhelming a 0.1-CPU Render instance with concurrent
      // embedding calls.
      tracked.forEach((t) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === t.id ? { ...f, status: "uploading" } : f)),
        );
        mutation.mutate({ file: t.file, trackedId: t.id });
      });
    },
    [mutation],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    multiple: true,
    onDropRejected: (rejections) => {
      rejections.forEach((r) =>
        toast.error(`${r.file.name} rejected`, {
          description: r.errors[0]?.message ?? "Unsupported file",
        }),
      );
    },
  });

  return (
    <Card className="rounded-2xl border-0 bg-card/95 panel-shadow ring-1 ring-border">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Files className="size-5 text-primary" />
          Candidate resumes
        </CardTitle>
        <CardDescription>Upload PDF, DOCX, or TXT files up to 5MB each.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className={`group flex min-h-56 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center transition-all ${
            isDragActive
              ? "border-primary bg-primary/10 shadow-inner"
              : "border-primary/25 bg-background/70 hover:border-primary/60 hover:bg-accent/40"
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:-translate-y-1">
            <Upload className="size-7" />
          </div>
          <div>
            <p className="text-base font-semibold">
            {isDragActive ? "Drop to upload" : "Drag & drop resumes, or click to browse"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX, or TXT</p>
          </div>
        </div>

        {files.length > 0 && (
          <ul className="grid gap-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex min-h-12 items-center gap-3 rounded-xl border bg-background/70 px-3 py-2 text-sm"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <FileText className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <StatusBadge status={f.status} error={f.error} />
              </li>
            ))}
          </ul>
        )}

        {files.length === 0 && uploaded.length > 0 && (
          <ul className="grid gap-2">
            {uploaded.map((resume) => (
              <li
                key={resume.candidate_id}
                className="flex min-h-12 items-center gap-3 rounded-xl border bg-background/70 px-3 py-2 text-sm"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <FileText className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{resume.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {resume.chunks_indexed} chunks indexed
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" /> Done
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {files.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground">
            <FileUp className="size-4" />
            <span>
              {uploaded.length > 0
                ? "Uploaded resumes restored from this browser."
                : "No resumes uploaded yet."}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, error }: { status: FileStatus; error?: string }) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary">Queued</Badge>;
    case "uploading":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading
        </Badge>
      );
    case "done":
      return (
        <Badge variant="secondary" className="gap-1 text-green-600">
          <CheckCircle2 className="h-3 w-3" /> Done
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1" title={error}>
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
  }
}
