/**
 * Job Queue Type Definitions
 * Defines types and interfaces for the job queue system
 */

export enum JobPriority {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Job {
  id: string;
  type: string;
  priority: JobPriority;
  data: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  delayMs: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export type JobHandler = (job: Job) => Promise<void>;

export interface JobQueueOptions {
  concurrency?: number;
  maxAttempts?: number;
}

export interface JobQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}
