import { v4 as uuid } from "uuid";
import { agentPool, ChainSpec } from "./agentPool";
import { TaskType } from "./prompts";

export interface Schedule {
  id: string;
  type: TaskType;
  prompt: string;
  intervalMinutes: number;
  chainTo?: ChainSpec;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
}

const MIN_INTERVAL_MINUTES = 5;

class Scheduler {
  private schedules = new Map<string, Schedule>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  create(type: TaskType, prompt: string, intervalMinutes: number, chainTo?: ChainSpec): Schedule {
    const interval = Math.max(intervalMinutes, MIN_INTERVAL_MINUTES);
    const now = new Date();
    const schedule: Schedule = {
      id: uuid(),
      type,
      prompt,
      intervalMinutes: interval,
      chainTo,
      createdAt: now.toISOString(),
      nextRunAt: new Date(now.getTime() + interval * 60_000).toISOString(),
    };
    this.schedules.set(schedule.id, schedule);

    const timer = setInterval(() => this.fire(schedule.id), interval * 60_000);
    this.timers.set(schedule.id, timer);
    return schedule;
  }

  list(): Schedule[] {
    return Array.from(this.schedules.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  cancel(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    this.timers.delete(id);
    return this.schedules.delete(id);
  }

  private fire(id: string): void {
    const schedule = this.schedules.get(id);
    if (!schedule) return;
    agentPool.submit(schedule.type, schedule.prompt, schedule.chainTo);
    schedule.lastRunAt = new Date().toISOString();
    schedule.nextRunAt = new Date(Date.now() + schedule.intervalMinutes * 60_000).toISOString();
  }
}

export const scheduler = new Scheduler();
