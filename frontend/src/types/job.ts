export interface PendingResume {
  file: File;
  id: string; // client-generated, stable across re-renders
}