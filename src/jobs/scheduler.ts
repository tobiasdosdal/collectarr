/**
 * Background Job Scheduler
 * Manages periodic tasks like collection refreshes
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyInstance } from 'fastify';
import type { JobHandler, JobOptions, Job, JobStatus, JobScheduler } from '../types/index.js';

class JobSchedulerImpl implements JobScheduler {
  private fastify: FastifyInstance;
  private jobs: Map<string, Job> = new Map();
  private isRunning = false;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  register(name: string, cronExpression: string, handler: JobHandler, options: JobOptions = {}): void {
    if (this.jobs.has(name)) {
      this.fastify.log.warn(`Job ${name} already registered, skipping`);
      return;
    }

    const job: Job = {
      name,
      cronExpression,
      handler,
      options: {
        runOnStart: false,
        enabled: true,
        ...options,
      },
      task: null,
      lastRun: null,
      lastError: null,
      runCount: 0,
      isRunning: false,
    };

    this.jobs.set(name, job);
    this.fastify.log.info(`Registered job: ${name} (${cronExpression})`);
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.fastify.log.info('Starting job scheduler');

    for (const [name, job] of this.jobs) {
      if (!job.options.enabled) {
        this.fastify.log.info(`Job ${name} is disabled, skipping`);
        continue;
      }

      job.task = cron.schedule(job.cronExpression, async () => {
        await this.runJob(name);
      });

      if (job.options.runOnStart) {
        setImmediate(() => this.runJob(name));
      }
    }
  }

  stop(): void {
    this.fastify.log.info('Stopping job scheduler');

    for (const [, job] of this.jobs) {
      if (job.task) {
        job.task.stop();
        job.task = null;
      }
    }

    this.isRunning = false;
  }

  async runJob(name: string): Promise<unknown> {
    const job = this.jobs.get(name);

    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }

    if (job.isRunning) {
      this.fastify.log.warn(`Job ${name} is already running, skipping`);
      return null;
    }

    job.isRunning = true;
    const startTime = Date.now();

    this.fastify.log.info(`Running job: ${name}`);

    try {
      const result = await job.handler(this.fastify);

      job.lastRun = new Date();
      job.lastError = null;
      job.runCount++;

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.fastify.log.info(`Job ${name} completed in ${duration}s`);

      return result;
    } catch (error) {
      job.lastError = (error as Error).message;
      this.fastify.log.error(`Job ${name} failed: ${(error as Error).message}`);
      throw error;
    } finally {
      job.isRunning = false;
    }
  }

  getStatus(): JobStatus[] {
    const status: JobStatus[] = [];

    for (const [, job] of this.jobs) {
      status.push({
        name: job.name,
        cronExpression: job.cronExpression,
        enabled: job.options.enabled,
        isRunning: job.isRunning,
        lastRun: job.lastRun,
        lastError: job.lastError,
        runCount: job.runCount,
      });
    }

    return status;
  }

  setEnabled(name: string, enabled: boolean): void {
    const job = this.jobs.get(name);

    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }

    job.options.enabled = enabled;

    if (job.task) {
      if (enabled) {
        job.task.start();
      } else {
        job.task.stop();
      }
    }
  }
}

let schedulerInstance: JobSchedulerImpl | null = null;

export function getScheduler(fastify: FastifyInstance): JobScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new JobSchedulerImpl(fastify);
  }
  return schedulerInstance;
}

export default JobSchedulerImpl;
