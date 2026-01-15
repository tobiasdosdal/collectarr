/**
 * Background Job Scheduler
 * Manages periodic tasks like collection refreshes
 */

import cron from 'node-cron';

class JobScheduler {
  constructor(fastify) {
    this.fastify = fastify;
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Register a job
   */
  register(name, cronExpression, handler, options = {}) {
    if (this.jobs.has(name)) {
      this.fastify.log.warn(`Job ${name} already registered, skipping`);
      return;
    }

    const job = {
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

  /**
   * Start all registered jobs
   */
  start() {
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

      // Create cron task
      job.task = cron.schedule(job.cronExpression, async () => {
        await this.runJob(name);
      });

      // Run on start if configured
      if (job.options.runOnStart) {
        setImmediate(() => this.runJob(name));
      }
    }
  }

  /**
   * Stop all jobs
   */
  stop() {
    this.fastify.log.info('Stopping job scheduler');

    for (const [name, job] of this.jobs) {
      if (job.task) {
        job.task.stop();
        job.task = null;
      }
    }

    this.isRunning = false;
  }

  /**
   * Run a specific job manually
   */
  async runJob(name) {
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
      job.lastError = error.message;
      this.fastify.log.error(`Job ${name} failed: ${error.message}`);
      throw error;
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status = [];

    for (const [name, job] of this.jobs) {
      status.push({
        name,
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

  /**
   * Enable or disable a job
   */
  setEnabled(name, enabled) {
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

// Singleton instance
let schedulerInstance = null;

export function getScheduler(fastify) {
  if (!schedulerInstance) {
    schedulerInstance = new JobScheduler(fastify);
  }
  return schedulerInstance;
}

export default JobScheduler;
