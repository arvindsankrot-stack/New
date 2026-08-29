import { v4 as uuid } from "uuid";
import { runCompletion } from "./claude";
import { SYSTEM_PROMPTS, TaskType } from "./prompts";

export type TaskStatus = "queued" | "in_progress" | "completed" | "failed";

export interface ChainSpec {
  type: TaskType;
  promptPrefix?: string;
}

export interface AgentTask {
  id: string;
  type: TaskType;
  prompt: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  workerId?: number;
  chainTo?: ChainSpec;
  spawnedFrom?: string;
  createdAt: string;
  updatedAt: string;
}

class AgentPool {
  private tasks = new Map<string, AgentTask>();
  private queue: string[] = [];
  private idleWorkers: number[] = [];
  private workerCount: number;

  constructor(workerCount: number) {
    this.workerCount = workerCount;
    this.idleWorkers = Array.from({ length: workerCount }, (_, i) => i);
  }

  submit(type: TaskType, prompt: string, chainTo?: ChainSpec, spawnedFrom?: string): AgentTask {
    const now = new Date().toISOString();
    const task: AgentTask = {
      id: uuid(),
      type,
      prompt,
      status: "queued",
      chainTo,
      spawnedFrom,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    this.queue.push(task.id);
    this.dispatch();
    return task;
  }

  list(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  get(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  // Buffet-style dispatch: any idle worker grabs the next queued task, first-come first-served.
  private dispatch(): void {
    while (this.idleWorkers.length > 0 && this.queue.length > 0) {
      const workerId = this.idleWorkers.shift()!;
      const taskId = this.queue.shift()!;
      void this.runTask(workerId, taskId);
    }
  }

  private async runTask(workerId: number, taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.idleWorkers.push(workerId);
      this.dispatch();
      return;
    }

    task.status = "in_progress";
    task.workerId = workerId;
    task.updatedAt = new Date().toISOString();

    try {
      const result = await runCompletion(SYSTEM_PROMPTS[task.type], [
        { role: "user", content: task.prompt },
      ]);
      task.status = "completed";
      task.result = result;

      // Task chaining: auto-queue a follow-up drafting task from this result.
      // This only ever produces another draft for a human to read — it never
      // executes a trade, order, or any external action on its own.
      if (task.chainTo) {
        const prefix = task.chainTo.promptPrefix ?? "Based on the following research, draft:";
        this.submit(task.chainTo.type, `${prefix}\n\n${result}`, undefined, task.id);
      }
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : "Unknown error";
    } finally {
      task.updatedAt = new Date().toISOString();
      this.idleWorkers.push(workerId);
      this.dispatch();
    }
  }
}

export const agentPool = new AgentPool(Number(process.env.WORKER_COUNT ?? 3));
