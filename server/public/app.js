const TASK_TYPE_LABELS = {
  "crypto-research": "Crypto Research",
  "polymarket-research": "Polymarket Research",
  "stock-research": "Stock Research",
  "commodity-research": "Commodity Research",
  "digital-product": "Digital Product Draft",
};

const api = {
  async chat(messages) {
    return request("/chat", "POST", { messages });
  },
  async submitTask(type, prompt, chainTo) {
    return request("/tasks", "POST", { type, prompt, chainTo });
  },
  async fetchTasks() {
    return request("/tasks", "GET");
  },
  async createSchedule(type, prompt, intervalMinutes) {
    return request("/schedules", "POST", { type, prompt, intervalMinutes });
  },
  async fetchSchedules() {
    return request("/schedules", "GET");
  },
  async cancelSchedule(id) {
    return request(`/schedules/${id}`, "DELETE");
  },
};

async function request(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch (_) {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Tabs ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "tasks") refreshTasks();
    if (btn.dataset.tab === "schedules") refreshSchedules();
  });
});

// --- Chat ---
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatError = document.getElementById("chat-error");
let chatMessages = [];

function renderChat() {
  chatLog.innerHTML = "";
  for (const msg of chatMessages) {
    const div = document.createElement("div");
    div.className = `bubble ${msg.role}`;
    div.textContent = msg.content;
    chatLog.appendChild(div);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatMessages.push({ role: "user", content: text });
  chatInput.value = "";
  renderChat();
  chatError.textContent = "";
  try {
    const { reply } = await api.chat(chatMessages);
    chatMessages.push({ role: "assistant", content: reply });
    renderChat();
  } catch (err) {
    chatError.textContent = err.message;
  }
});

// --- Tasks ---
const taskList = document.getElementById("task-list");
const tasksError = document.getElementById("tasks-error");
const newTaskDialog = document.getElementById("new-task-dialog");
const newTaskForm = document.getElementById("new-task-form");
const taskTypeSelect = document.getElementById("task-type");
const taskChainRow = document.getElementById("task-chain-row");

for (const [value, label] of Object.entries(TASK_TYPE_LABELS)) {
  const opt = new Option(label, value);
  taskTypeSelect.add(opt);
}
taskTypeSelect.addEventListener("change", () => {
  taskChainRow.style.display = taskTypeSelect.value === "digital-product" ? "none" : "flex";
});

document.getElementById("new-task-btn").addEventListener("click", () => newTaskDialog.showModal());
newTaskDialog.querySelector("[data-close]").addEventListener("click", () => newTaskDialog.close());

newTaskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = taskTypeSelect.value;
  const prompt = document.getElementById("task-prompt").value.trim();
  const chain = document.getElementById("task-chain").checked;
  if (!prompt) return;
  const chainTo = chain
    ? { type: "digital-product", promptPrefix: "Draft a short write-up summarizing this research for a general audience:" }
    : undefined;
  try {
    await api.submitTask(type, prompt, chainTo);
    newTaskDialog.close();
    newTaskForm.reset();
    await refreshTasks();
  } catch (err) {
    tasksError.textContent = err.message;
  }
});

function taskCard(task) {
  const li = document.createElement("li");
  li.className = "card";
  const branch = task.spawnedFrom ? " ↳" : "";
  li.innerHTML = `
    <div class="card-title-row">
      <strong>${TASK_TYPE_LABELS[task.type] ?? task.type}${branch}</strong>
      <span class="status-pill ${task.status}">${task.status}</span>
    </div>
    <div class="card-prompt">${escapeHtml(task.prompt)}</div>
    ${task.result ? `<div class="card-result">${escapeHtml(task.result)}</div>` : ""}
    ${task.error ? `<div class="card-result" style="color:var(--danger)">${escapeHtml(task.error)}</div>` : ""}
  `;
  return li;
}

async function refreshTasks() {
  try {
    const tasks = await api.fetchTasks();
    taskList.innerHTML = "";
    tasks.forEach((t) => taskList.appendChild(taskCard(t)));
    tasksError.textContent = "";
  } catch (err) {
    tasksError.textContent = err.message;
  }
}

// --- Schedules ---
const scheduleList = document.getElementById("schedule-list");
const schedulesError = document.getElementById("schedules-error");
const newScheduleDialog = document.getElementById("new-schedule-dialog");
const newScheduleForm = document.getElementById("new-schedule-form");
const scheduleTypeSelect = document.getElementById("schedule-type");

for (const [value, label] of Object.entries(TASK_TYPE_LABELS)) {
  scheduleTypeSelect.add(new Option(label, value));
}

document.getElementById("new-schedule-btn").addEventListener("click", () => newScheduleDialog.showModal());
newScheduleDialog.querySelector("[data-close]").addEventListener("click", () => newScheduleDialog.close());

newScheduleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = scheduleTypeSelect.value;
  const prompt = document.getElementById("schedule-prompt").value.trim();
  const intervalMinutes = Number(document.getElementById("schedule-interval").value);
  if (!prompt) return;
  try {
    await api.createSchedule(type, prompt, intervalMinutes);
    newScheduleDialog.close();
    newScheduleForm.reset();
    await refreshSchedules();
  } catch (err) {
    schedulesError.textContent = err.message;
  }
});

function scheduleCard(schedule) {
  const li = document.createElement("li");
  li.className = "card";
  li.innerHTML = `
    <div class="card-title-row">
      <strong>${TASK_TYPE_LABELS[schedule.type] ?? schedule.type}</strong>
      <button class="card-cancel">Cancel</button>
    </div>
    <div class="card-prompt">${escapeHtml(schedule.prompt)}</div>
    <div class="card-meta">Every ${schedule.intervalMinutes} min · next run ${new Date(schedule.nextRunAt).toLocaleString()}</div>
  `;
  li.querySelector(".card-cancel").addEventListener("click", async () => {
    try {
      await api.cancelSchedule(schedule.id);
      await refreshSchedules();
    } catch (err) {
      schedulesError.textContent = err.message;
    }
  });
  return li;
}

async function refreshSchedules() {
  try {
    const schedules = await api.fetchSchedules();
    scheduleList.innerHTML = "";
    schedules.forEach((s) => scheduleList.appendChild(scheduleCard(s)));
    schedulesError.textContent = "";
  } catch (err) {
    schedulesError.textContent = err.message;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

refreshTasks();
