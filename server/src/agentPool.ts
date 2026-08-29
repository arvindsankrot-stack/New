import { v4 as uuid } from "uuid";
import { runCompletion, cleanErrorMessage } from "./llm";
import { SYSTEM_PROMPTS, TaskType, IDEA_INSTRUCTIONS, RESEARCH_TASK_TYPES, ALL_TASK_TYPES } from "./prompts";

export type TaskStatus = "queued" | "in_progress" | "completed" | "failed";

export interface ChainSpec {
  type: TaskType;
  promptPrefix?: string;
}

export type IdeaConfidence = "Low" | "Medium" | "High";

export interface PublishedIdea {
  summary: string;
  confidence: IdeaConfidence;
  risks: string;
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
  publishIdea?: boolean;
  idea?: PublishedIdea;
  createdAt: string;
  updatedAt: string;
}

function parseIdea(text: string): PublishedIdea | undefined {
  const summaryMatch = text.match(/IDEA_SUMMARY:\s*(.+)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*(Low|Medium|High)/i);
  const risksMatch = text.match(/KEY_RISKS:\s*(.+)/i);
  if (!summaryMatch || !confidenceMatch || !risksMatch) return undefined;

  const confidence = confidenceMatch[1][0].toUpperCase() + confidenceMatch[1].slice(1).toLowerCase();
  return {
    summary: summaryMatch[1].trim(),
    confidence: confidence as IdeaConfidence,
    risks: risksMatch[1].trim(),
  };
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

  submit(
    type: TaskType,
    prompt: string,
    chainTo?: ChainSpec,
    spawnedFrom?: string,
    publishIdea?: boolean,
  ): AgentTask {
    const now = new Date().toISOString();
    const task: AgentTask = {
      id: uuid(),
      type,
      prompt,
      status: "queued",
      chainTo,
      spawnedFrom,
      publishIdea: publishIdea && RESEARCH_TASK_TYPES.includes(type) ? true : undefined,
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

  get totalWorkers(): number {
    return this.workerCount;
  }

  busyWorkerCount(): number {
    return Array.from(this.tasks.values()).filter((t) => t.status === "in_progress").length;
  }

  statusByType(): Record<
    TaskType,
    {
      queued: number;
      inProgress: number;
      completed: number;
      failed: number;
      lastActivityAt?: string;
      currentTask?: string;
    }
  > {
    type Bucket = {
      queued: number;
      inProgress: number;
      completed: number;
      failed: number;
      lastActivityAt?: string;
      currentTask?: string;
    };
    const byType = {} as Record<TaskType, Bucket>;
    for (const type of ALL_TASK_TYPES) {
      byType[type] = { queued: 0, inProgress: 0, completed: 0, failed: 0 };
    }
    for (const task of this.tasks.values()) {
      const bucket = byType[task.type];
      const key = task.status === "in_progress" ? "inProgress" : task.status;
      bucket[key]++;
      if (!bucket.lastActivityAt || task.updatedAt > bucket.lastActivityAt) {
        bucket.lastActivityAt = task.updatedAt;
      }
      if (task.status === "in_progress") {
        bucket.currentTask = task.prompt.length > 70 ? `${task.prompt.slice(0, 70)}…` : task.prompt;
      }
    }
    return byType;
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
      const systemPrompt = SYSTEM_PROMPTS[task.type] + (task.publishIdea ? IDEA_INSTRUCTIONS : "");
      const result = await runCompletion(systemPrompt, [{ role: "user", content: task.prompt }]);
      task.status = "completed";
      task.result = result;
      if (task.publishIdea) {
        task.idea = parseIdea(result);
      }

      // Task chaining: auto-queue a follow-up drafting task from this result.
      // This only ever produces another draft for a human to read — it never
      // executes a trade, order, or any external action on its own.
      if (task.chainTo) {
        const prefix = task.chainTo.promptPrefix ?? "Based on the following research, draft:";
        this.submit(task.chainTo.type, `${prefix}\n\n${result}`, undefined, task.id);
      }
    } catch (err) {
      task.status = "failed";
      task.error = cleanErrorMessage(err);
    } finally {
      task.updatedAt = new Date().toISOString();
      this.idleWorkers.push(workerId);
      this.dispatch();
    }
  }
}

export const agentPool = new AgentPool(Number(process.env.WORKER_COUNT ?? 3));
