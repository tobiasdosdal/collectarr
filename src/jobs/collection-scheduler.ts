/**
 * Collection Scheduler
 * Manages individual sync schedules for each collection
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyInstance } from 'fastify';
import type { Collection, PrismaClient } from '@prisma/client';

interface ScheduledCollection {
  collectionId: string;
  task: ScheduledTask;
  cronExpression: string;
  lastRun: Date | null;
  nextRun: Date | null;
}

class CollectionSchedulerImpl {
  private fastify: FastifyInstance;
  private schedules: Map<string, ScheduledCollection> = new Map();
  private isRunning = false;
  private refreshHandler: ((collectionId: string) => Promise<void>) | null = null;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Set the refresh handler function that will be called when a collection is due for refresh
   */
  setRefreshHandler(handler: (collectionId: string) => Promise<void>): void {
    this.refreshHandler = handler;
  }

  /**
   * Convert collection settings to a cron expression
   * Uses refreshIntervalHours and refreshTime to create the schedule
   */
  private getCronExpression(collection: Collection): string {
    const { refreshIntervalHours, refreshTime } = collection;

    // Parse preferred time (HH:MM format) or default to midnight
    const [hours, minutes] = (refreshTime || '00:00').split(':').map(Number);
    const hour = hours || 0;
    const minute = minutes || 0;

    // Convert interval hours to cron expression
    if (refreshIntervalHours <= 1) {
      // Every hour at the specified minute
      return `${minute} * * * *`;
    } else if (refreshIntervalHours < 24) {
      // Every N hours at the specified minute
      return `${minute} */${refreshIntervalHours} * * *`;
    } else if (refreshIntervalHours === 24) {
      // Daily at the specified time
      return `${minute} ${hour} * * *`;
    } else if (refreshIntervalHours <= 168) {
      // Weekly (or less frequent within a week)
      const daysInterval = Math.round(refreshIntervalHours / 24);
      return `${minute} ${hour} */${daysInterval} * *`;
    } else {
      // Monthly or longer - run on day 1 at specified time
      return `${minute} ${hour} 1 * *`;
    }
  }

  /**
   * Calculate the next run time based on cron expression
   */
  private getNextRun(cronExpression: string): Date | null {
    try {
      const cronParts = cronExpression.split(' ');
      const now = new Date();
      const nextRun = new Date(now);

      // Simple approximation - for accurate next run, use a cron parser library
      // This gives a rough estimate
      const minute = cronParts[0] || '*';
      const hour = cronParts[1] || '*';
      const dayOfMonth = cronParts[2] || '*';

      if (minute !== '*' && !minute.startsWith('*/')) {
        nextRun.setMinutes(parseInt(minute, 10));
      }
      if (hour !== '*' && !hour.startsWith('*/')) {
        nextRun.setHours(parseInt(hour, 10));
      }

      // If the calculated time is in the past, add the interval
      if (nextRun <= now) {
        if (hour.startsWith('*/')) {
          const interval = parseInt(hour.replace('*/', ''), 10);
          nextRun.setHours(nextRun.getHours() + interval);
        } else if (dayOfMonth.startsWith('*/')) {
          const interval = parseInt(dayOfMonth.replace('*/', ''), 10);
          nextRun.setDate(nextRun.getDate() + interval);
        } else if (minute !== '*') {
          nextRun.setHours(nextRun.getHours() + 1);
        } else {
          nextRun.setDate(nextRun.getDate() + 1);
        }
      }

      return nextRun;
    } catch {
      return null;
    }
  }

  /**
   * Schedule or reschedule a single collection
   */
  async scheduleCollection(collection: Collection): Promise<void> {
    // Don't schedule manual collections or disabled ones
    if (collection.sourceType === 'MANUAL' || !collection.isEnabled) {
      this.unscheduleCollection(collection.id);
      return;
    }

    const cronExpression = this.getCronExpression(collection);
    const existing = this.schedules.get(collection.id);

    // If schedule hasn't changed, don't reschedule
    if (existing && existing.cronExpression === cronExpression) {
      return;
    }

    // Unschedule existing if different
    if (existing) {
      this.unscheduleCollection(collection.id);
    }

    // Create new schedule
    const task = cron.schedule(cronExpression, async () => {
      if (!this.refreshHandler) {
        this.fastify.log.warn(`No refresh handler set for collection ${collection.id}`);
        return;
      }

      this.fastify.log.info(`Running scheduled refresh for collection: ${collection.name} (${collection.id})`);

      const scheduled = this.schedules.get(collection.id);
      if (scheduled) {
        scheduled.lastRun = new Date();
        scheduled.nextRun = this.getNextRun(cronExpression);
      }

      try {
        await this.refreshHandler(collection.id);
      } catch (error) {
        this.fastify.log.error(`Scheduled refresh failed for collection ${collection.name}: ${(error as Error).message}`);
      }
    });

    this.schedules.set(collection.id, {
      collectionId: collection.id,
      task,
      cronExpression,
      lastRun: null,
      nextRun: this.getNextRun(cronExpression),
    });

    this.fastify.log.info(`Scheduled collection "${collection.name}" with cron: ${cronExpression}`);
  }

  /**
   * Remove schedule for a collection
   */
  unscheduleCollection(collectionId: string): void {
    const scheduled = this.schedules.get(collectionId);
    if (scheduled) {
      scheduled.task.stop();
      this.schedules.delete(collectionId);
      this.fastify.log.info(`Unscheduled collection: ${collectionId}`);
    }
  }

  /**
   * Initialize all collection schedules from database
   */
  async initializeSchedules(): Promise<void> {
    const collections = await this.fastify.prisma.collection.findMany({
      where: {
        isEnabled: true,
        sourceType: { not: 'MANUAL' },
      },
    });

    for (const collection of collections) {
      await this.scheduleCollection(collection);
    }

    this.isRunning = true;
    this.fastify.log.info(`Collection scheduler initialized with ${this.schedules.size} schedules`);
  }

  /**
   * Get status of all scheduled collections
   */
  getScheduleStatus(): Array<{
    collectionId: string;
    cronExpression: string;
    lastRun: Date | null;
    nextRun: Date | null;
  }> {
    return Array.from(this.schedules.values()).map(s => ({
      collectionId: s.collectionId,
      cronExpression: s.cronExpression,
      lastRun: s.lastRun,
      nextRun: s.nextRun,
    }));
  }

  /**
   * Get schedule for a specific collection
   */
  getCollectionSchedule(collectionId: string): ScheduledCollection | undefined {
    return this.schedules.get(collectionId);
  }

  /**
   * Stop all schedules
   */
  stop(): void {
    for (const [, scheduled] of this.schedules) {
      scheduled.task.stop();
    }
    this.schedules.clear();
    this.isRunning = false;
    this.fastify.log.info('Collection scheduler stopped');
  }
}

let collectionSchedulerInstance: CollectionSchedulerImpl | null = null;

export function getCollectionScheduler(fastify: FastifyInstance): CollectionSchedulerImpl {
  if (!collectionSchedulerInstance) {
    collectionSchedulerInstance = new CollectionSchedulerImpl(fastify);
  }
  return collectionSchedulerInstance;
}

export function resetCollectionScheduler(): void {
  if (collectionSchedulerInstance) {
    collectionSchedulerInstance.stop();
    collectionSchedulerInstance = null;
  }
}

export type { CollectionSchedulerImpl };
