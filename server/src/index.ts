import express from "express";
import cors from "cors";
import { agentPool } from "./agentPool";
import { TaskType, SYSTEM_PROMPTS, CHAT_SYSTEM_PROMPT } from "./prompts";
import { runCompletion, ChatMessage } from "./claude";

const app = express();
app.use(cors());
app.use(express.json());

const TASK_TYPES = Object.keys(SYSTEM_PROMPTS) as TaskType[];

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
    res.status(502).json({ error: err instanceof Error ? err.message : "completion failed" });
  }
});

app.post("/tasks", (req, res) => {
  const { type, prompt } = req.body ?? {};
  if (!TASK_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${TASK_TYPES.join(", ")}` });
    return;
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const task = agentPool.submit(type, prompt.trim());
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

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Hermes agent pool server listening on :${port}`);
});
