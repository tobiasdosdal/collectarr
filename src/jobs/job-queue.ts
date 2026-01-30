import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Job, JobHandler, JobPriority, JobQueueOptions, JobQueueStats } from './job-types.js';
import { JobPriority as Priority, JobStatus } from './job-types.js';

export class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private running: Set<string> = new Set();
  private paused = false;
  private stopped = false;
  private concurrency: number;
  private maxAttempts: number;
  private processInterval: NodeJS.Timeout | null = null;

  constructor(options: JobQueueOptions = {}) {
    super();
    this.concurrency = options.concurrency ?? 3;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  enqueue(jobData: Omit<Job, 'id' | 'status' | 'attempts' | 'createdAt'>): string {
    const job: Job = {
      ...jobData,
      id: randomUUID(),
      status: JobStatus.PENDING,
      attempts: 0,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.emit('job:queued', job);
    return job.id;
  }

  async process(): Promise<void> {
    this.stopped = false;

    while (!this.stopped) {
      if (!this.paused && this.running.size < this.concurrency) {
        const job = this.getNextJob();

        if (job) {
          this.running.add(job.id);
          this.processJob(job).catch(() => {
            // Error already handled in processJob
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
  }

  getStats(): JobQueueStats {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case JobStatus.PENDING:
          pending += 1;
          break;
        case JobStatus.RUNNING:
          running += 1;
          break;
        case JobStatus.COMPLETED:
          completed += 1;
          break;
        case JobStatus.FAILED:
          failed += 1;
          break;
      }
    }

    return { pending, running, completed, failed };
  }

  private getNextJob(): Job | null {
    const pendingJobs: Job[] = [];

    for (const job of this.jobs.values()) {
      if (job.status === JobStatus.PENDING && !this.running.has(job.id)) {
        const now = Date.now();
        const createdTime = job.createdAt.getTime();
        const elapsedMs = now - createdTime;

        if (elapsedMs >= job.delayMs) {
          pendingJobs.push(job);
        }
      }
    }

    if (pendingJobs.length === 0) {
      return null;
    }

    pendingJobs.sort((a, b) => {
      const priorityOrder = { [Priority.HIGH]: 0, [Priority.NORMAL]: 1, [Priority.LOW]: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return pendingJobs[0] ?? null;
  }

  private async processJob(job: Job): Promise<void> {
    try {
      job.status = JobStatus.RUNNING;
      job.startedAt = new Date();
      this.emit('job:started', job);

      const handler = this.handlers.get(job.type);

      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      await handler(job);

      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      this.emit('job:completed', job);
    } catch (error) {
      job.attempts += 1;

      if (job.attempts < job.maxAttempts) {
        job.status = JobStatus.PENDING;
        job.error = error instanceof Error ? error.message : String(error);
        const delay = this.calculateBackoffDelay(job.attempts);
        job.delayMs = delay;
        this.emit('job:failed', job);
      } else {
        job.status = JobStatus.FAILED;
        job.error = error instanceof Error ? error.message : String(error);
        this.emit('job:failed', job);
      }
    } finally {
      this.running.delete(job.id);
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    const initialDelayMs = 1000;
    const maxDelayMs = 30000;
    const backoffMultiplier = 2;

    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, maxDelayMs);
  }
}

export default JobQueue;
