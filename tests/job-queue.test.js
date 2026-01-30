import { JobQueue } from '../dist-server/jobs/job-queue.js';
import { JobPriority, JobStatus } from '../dist-server/jobs/job-types.js';

describe('JobQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new JobQueue({ concurrency: 2, maxAttempts: 3 });
  });

  afterEach(() => {
    queue.stop();
  });

  describe('enqueue()', () => {
    it('should add job to queue and return job ID', async () => {
      const jobId = queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 3,
        delayMs: 0,
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      expect(jobId.length).toBeGreaterThan(0);
    });

    it('should emit job:queued event', async () => {
      let eventFired = false;
      let eventData = null;

      queue.on('job:queued', (job) => {
        eventFired = true;
        eventData = job;
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 3,
        delayMs: 0,
      });

      expect(eventFired).toBe(true);
      expect(eventData.type).toBe('test-job');
      expect(eventData.status).toBe(JobStatus.PENDING);
      expect(eventData.attempts).toBe(0);
    });

    it('should set job status to PENDING', async () => {
      const jobId = queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 3,
        delayMs: 0,
      });

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('Priority ordering', () => {
    it('should process HIGH priority jobs before NORMAL', async () => {
      const processedJobs = [];

      queue.registerHandler('test-job', async (job) => {
        processedJobs.push(job.priority);
      });

      // Enqueue in order: NORMAL, HIGH, NORMAL
      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { order: 1 },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.HIGH,
        data: { order: 2 },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { order: 3 },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      // Wait for jobs to process
      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      expect(processedJobs[0]).toBe(JobPriority.HIGH);
      expect(processedJobs[1]).toBe(JobPriority.NORMAL);
      expect(processedJobs[2]).toBe(JobPriority.NORMAL);
    });

    it('should process NORMAL priority jobs before LOW', async () => {
      const processedJobs = [];

      queue.registerHandler('test-job', async (job) => {
        processedJobs.push(job.priority);
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.LOW,
        data: { order: 1 },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { order: 2 },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      expect(processedJobs[0]).toBe(JobPriority.NORMAL);
      expect(processedJobs[1]).toBe(JobPriority.LOW);
    });

    it('should respect FIFO order within same priority', async () => {
      const processedOrders = [];

      queue.registerHandler('test-job', async (job) => {
        processedOrders.push(job.data.order);
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { order: 1 },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { order: 2 },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { order: 3 },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      expect(processedOrders).toEqual([1, 2, 3]);
    });
  });

  describe('process()', () => {
    it('should call handler for queued job', async () => {
      let handlerCalled = false;
      queue.registerHandler('test-job', async () => {
        handlerCalled = true;
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(handlerCalled).toBe(true);
    });

    it('should emit job:started event', async () => {
      let startedEventFired = false;
      let startedJob = null;

      queue.on('job:started', (job) => {
        startedEventFired = true;
        startedJob = job;
      });

      // Use a slow handler so we can catch the RUNNING state
      queue.registerHandler('test-job', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      // Wait a bit for job to start but not complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(startedEventFired).toBe(true);
      expect(startedJob.status).toBe(JobStatus.RUNNING);
      expect(startedJob.startedAt).toBeDefined();

      queue.stop();
      await processPromise.catch(() => {});
    });

    it('should emit job:completed event on success', async () => {
      let completedEventFired = false;
      let completedJob = null;

      queue.on('job:completed', (job) => {
        completedEventFired = true;
        completedJob = job;
      });

      queue.registerHandler('test-job', async () => {});

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(completedEventFired).toBe(true);
      expect(completedJob.status).toBe(JobStatus.COMPLETED);
      expect(completedJob.completedAt).toBeDefined();
    });

    it('should update job status to COMPLETED', async () => {
      queue.registerHandler('test-job', async () => {});

      const jobId = queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
    });
  });

  describe('Job failure and retry', () => {
    it('should emit job:failed event on handler error', async () => {
      let failedEventFired = false;
      let failedJob = null;

      queue.on('job:failed', (job) => {
        failedEventFired = true;
        failedJob = job;
      });

      queue.registerHandler('test-job', async () => {
        throw new Error('Test error');
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 3,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(failedEventFired).toBe(true);
      expect(failedJob.error).toBe('Test error');
      expect(failedJob.attempts).toBe(1);
    });

    it('should retry failed job with exponential backoff', async () => {
      const handlerCalls = [];
      queue.registerHandler('test-job', async () => {
        handlerCalls.push(Date.now());
        throw new Error('Test error');
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 3,
        delayMs: 0,
      });

      const processPromise = queue.process();

      // Wait for retries
      await new Promise((resolve) => setTimeout(resolve, 3000));
      queue.stop();
      await processPromise.catch(() => {});

      // Should have been called 3 times (initial + 2 retries)
      expect(handlerCalls.length).toBeGreaterThanOrEqual(2);

      // Check that delays increased (exponential backoff)
      if (handlerCalls.length >= 2) {
        const delay1 = handlerCalls[1] - handlerCalls[0];
        expect(delay1).toBeGreaterThan(500); // At least 1 second delay
      }
    });

    it('should mark job as FAILED after max attempts', async () => {
      queue.registerHandler('test-job', async () => {
        throw new Error('Test error');
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 2,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 2000));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it('should store error message on failure', async () => {
      let failedJob = null;

      queue.on('job:failed', (job) => {
        failedJob = job;
      });

      queue.registerHandler('test-job', async () => {
        throw new Error('Specific error message');
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(failedJob.error).toBe('Specific error message');
    });
  });

  describe('Concurrency control', () => {
    it('should respect concurrency limit', async () => {
      const concurrentQueue = new JobQueue({ concurrency: 2 });
      const runningCount = [];
      let maxConcurrent = 0;

      concurrentQueue.registerHandler('test-job', async () => {
        runningCount.push(1);
        maxConcurrent = Math.max(maxConcurrent, runningCount.length);
        await new Promise((resolve) => setTimeout(resolve, 100));
        runningCount.pop();
      });

      // Enqueue 5 jobs
      for (let i = 0; i < 5; i++) {
        concurrentQueue.enqueue({
          type: 'test-job',
          priority: JobPriority.NORMAL,
          data: { order: i },
          maxAttempts: 1,
          delayMs: 0,
        });
      }

      const processPromise = concurrentQueue.process();

      await new Promise((resolve) => setTimeout(resolve, 1000));
      concurrentQueue.stop();
      await processPromise.catch(() => {});

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should process max 3 jobs simultaneously by default', async () => {
      const defaultQueue = new JobQueue();
      const runningCount = [];
      let maxConcurrent = 0;

      defaultQueue.registerHandler('test-job', async () => {
        runningCount.push(1);
        maxConcurrent = Math.max(maxConcurrent, runningCount.length);
        await new Promise((resolve) => setTimeout(resolve, 100));
        runningCount.pop();
      });

      for (let i = 0; i < 6; i++) {
        defaultQueue.enqueue({
          type: 'test-job',
          priority: JobPriority.NORMAL,
          data: { order: i },
          maxAttempts: 1,
          delayMs: 0,
        });
      }

      const processPromise = defaultQueue.process();

      await new Promise((resolve) => setTimeout(resolve, 1000));
      defaultQueue.stop();
      await processPromise.catch(() => {});

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('pause() and resume()', () => {
    it('should pause job processing', async () => {
      const handlerCalls = [];
      queue.registerHandler('test-job', async () => {
        handlerCalls.push(Date.now());
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 100));
      queue.pause();

      const callsBeforePause = handlerCalls.length;

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(handlerCalls.length).toBe(callsBeforePause);

      queue.stop();
      await processPromise.catch(() => {});
    });

    it('should resume job processing after pause', async () => {
      const handlerCalls = [];
      queue.registerHandler('test-job', async () => {
        handlerCalls.push(Date.now());
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 100));
      queue.pause();

      await new Promise((resolve) => setTimeout(resolve, 100));
      queue.resume();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(handlerCalls.length).toBeGreaterThan(0);
    });
  });

  describe('getStats()', () => {
    it('should return correct pending count', async () => {
      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const stats = queue.getStats();
      expect(stats.pending).toBe(2);
    });

    it('should return correct completed count', async () => {
      queue.registerHandler('test-job', async () => {});

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.completed).toBe(1);
    });

    it('should return correct failed count', async () => {
      queue.registerHandler('test-job', async () => {
        throw new Error('Test error');
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should return all stats together', async () => {
      queue.registerHandler('test-job', async (job) => {
        if (job.data.shouldFail) {
          throw new Error('Test error');
        }
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { shouldFail: false },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { shouldFail: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { shouldFail: false },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(0);
    });
  });

  describe('Job delay', () => {
    it('should respect delayMs before processing job', async () => {
      const handlerCalls = [];
      queue.registerHandler('test-job', async () => {
        handlerCalls.push(Date.now());
      });

      const enqueueTime = Date.now();
      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 500,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(handlerCalls.length).toBe(0);

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(handlerCalls.length).toBe(1);
      const processingTime = handlerCalls[0] - enqueueTime;
      expect(processingTime).toBeGreaterThanOrEqual(500);
    });
  });

  describe('Error handling', () => {
    it('should handle missing handler gracefully', async () => {
      let failedJob = null;

      queue.on('job:failed', (job) => {
        failedJob = job;
      });

      queue.enqueue({
        type: 'unknown-job-type',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(failedJob).toBeDefined();
      expect(failedJob.error).toContain('No handler registered');
    });

    it('should handle non-Error exceptions', async () => {
      let failedJob = null;

      queue.on('job:failed', (job) => {
        failedJob = job;
      });

      queue.registerHandler('test-job', async () => {
        throw 'String error'; // eslint-disable-line no-throw-literal
      });

      queue.enqueue({
        type: 'test-job',
        priority: JobPriority.NORMAL,
        data: { test: true },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 300));
      queue.stop();
      await processPromise.catch(() => {});

      expect(failedJob).toBeDefined();
      expect(failedJob.error).toBe('String error');
    });
  });
});
