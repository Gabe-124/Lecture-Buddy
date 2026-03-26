import { nowIsoString } from "../ingest/types";
import {
  processSessionWorker,
  type SessionWorkerDependencies,
  type SessionWorkerInput,
  type SessionWorkerOutput,
} from "./process_session";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface ProcessingJob {
  id: string;
  sessionId: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  input: SessionWorkerInput;
  result?: SessionWorkerOutput;
}

export class InMemoryJobOrchestrator {
  private readonly jobs = new Map<string, ProcessingJob>();

  enqueueSession(input: SessionWorkerInput): ProcessingJob {
    const job: ProcessingJob = {
      id: `job_${input.sessionId}_${this.jobs.size + 1}`,
      sessionId: input.sessionId,
      status: "queued",
      createdAt: nowIsoString(),
      input,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(jobId: string): ProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(): ProcessingJob[] {
    return [...this.jobs.values()];
  }

  async runJob(
    jobId: string,
    dependencies: SessionWorkerDependencies = {},
  ): Promise<ProcessingJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job id: ${jobId}`);
    }

    job.status = "running";
    job.startedAt = nowIsoString();

    try {
      job.result = await processSessionWorker(job.input, dependencies);
      job.status = "completed";
      job.completedAt = nowIsoString();
    } catch (error) {
      job.status = "failed";
      job.completedAt = nowIsoString();
      job.error = error instanceof Error ? error.message : String(error);
    }

    this.jobs.set(job.id, job);
    return job;
  }
}
