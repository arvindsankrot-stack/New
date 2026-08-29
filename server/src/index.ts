import express from "express";
import cors from "cors";
import path from "path";
import { agentPool, ChainSpec } from "./agentPool";
import { scheduler } from "./scheduler";
import { paperPortfolio, PositionSide } from "./paperTrading";
import { TaskType, SYSTEM_PROMPTS, CHAT_SYSTEM_PROMPT } from "./prompts";
import { runCompletion, ChatMessage, cleanErrorMessage } from "./llm";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const TASK_TYPES = Object.keys(SYSTEM_PROMPTS) as TaskType[];

function parseChainTo(body: unknown): { chainTo?: ChainSpec; error?: string } {
  const chainTo = (body as { chainTo?: unknown } | undefined)?.chainTo;
  if (chainTo === undefined) return {};
  if (
    typeof chainTo !== "object" ||
    chainTo === null ||
    !TASK_TYPES.includes((chainTo as { type?: unknown }).type as TaskType)
  ) {
    return { error: `chainTo.type must be one of ${TASK_TYPES.join(", ")}` };
  }
  const spec = chainTo as { type: TaskType; promptPrefix?: unknown };
  return {
    chainTo: {
      type: spec.type,
      promptPrefix: typeof spec.promptPrefix === "string" ? spec.promptPrefix : undefined,
    },
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/task-types", (_req, res) => {
  res.json({ types: TASK_TYPES });
});

app.post("/chat", async (req, res) => {
  const messages = req.body?.messages as ChatMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  try {
    const reply = await runCompletion(CHAT_SYSTEM_PROMPT, messages);
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: cleanErrorMessage(err) });
  }
});

app.post("/tasks", (req, res) => {
  const { type, prompt, publishIdea } = req.body ?? {};
  if (!TASK_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${TASK_TYPES.join(", ")}` });
    return;
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const { chainTo, error } = parseChainTo(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  const task = agentPool.submit(type, prompt.trim(), chainTo, undefined, Boolean(publishIdea));
  res.status(201).json(task);
});

app.get("/tasks", (_req, res) => {
  res.json(agentPool.list());
});

app.get("/tasks/:id", (req, res) => {
  const task = agentPool.get(req.params.id);
  if (!task) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(task);
});

// Schedules: recurring research that auto-queues a task on an interval, optionally
// chaining into a follow-up draft. Never triggers anything outside the task pool.
app.post("/schedules", (req, res) => {
  const { type, prompt, intervalMinutes, publishIdea } = req.body ?? {};
  if (!TASK_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${TASK_TYPES.join(", ")}` });
    return;
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  if (typeof intervalMinutes !== "number" || !Number.isFinite(intervalMinutes)) {
    res.status(400).json({ error: "intervalMinutes must be a number" });
    return;
  }

  const { chainTo, error } = parseChainTo(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  const schedule = scheduler.create(type, prompt.trim(), intervalMinutes, chainTo, Boolean(publishIdea));
  res.status(201).json(schedule);
});

app.get("/schedules", (_req, res) => {
  res.json(scheduler.list());
});

app.delete("/schedules/:id", (req, res) => {
  const removed = scheduler.cancel(req.params.id);
  if (!removed) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(204).send();
});

// Paper trading: simulated positions only. Fake money, manually-entered prices,
// no market data feed and no connection to any real exchange or brokerage —
// this can never place a real trade, by construction.
app.post("/paper-positions", (req, res) => {
  const { taskId, label, side, entryPrice, quantity } = req.body ?? {};
  if (typeof label !== "string" || label.trim().length === 0) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  if (side !== "long" && side !== "short") {
    res.status(400).json({ error: "side must be 'long' or 'short'" });
    return;
  }
  if (typeof entryPrice !== "number" || entryPrice <= 0) {
    res.status(400).json({ error: "entryPrice must be a positive number" });
    return;
  }
  if (typeof quantity !== "number" || quantity <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }

  const position = paperPortfolio.open(
    label.trim(),
    side as PositionSide,
    entryPrice,
    quantity,
    typeof taskId === "string" ? taskId : undefined,
  );
  res.status(201).json(position);
});

app.get("/paper-positions", (_req, res) => {
  res.json(paperPortfolio.list());
});

app.post("/paper-positions/:id/close", (req, res) => {
  const { exitPrice } = req.body ?? {};
  if (typeof exitPrice !== "number" || exitPrice <= 0) {
    res.status(400).json({ error: "exitPrice must be a positive number" });
    return;
  }

  const position = paperPortfolio.close(req.params.id, exitPrice);
  if (!position) {
    res.status(404).json({ error: "not found or already closed" });
    return;
  }
  res.json(position);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Hermes agent pool server listening on :${port}`);
});
