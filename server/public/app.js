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
  async submitTask(type, prompt, chainTo, publishIdea) {
    return request("/tasks", "POST", { type, prompt, chainTo, publishIdea });
  },
  async fetchTasks() {
    return request("/tasks", "GET");
  },
  async createSchedule(type, prompt, intervalMinutes, publishIdea) {
    return request("/schedules", "POST", { type, prompt, intervalMinutes, publishIdea });
  },
  async fetchSchedules() {
    return request("/schedules", "GET");
  },
  async cancelSchedule(id) {
    return request(`/schedules/${id}`, "DELETE");
  },
  async openPosition(taskId, label, side, entryPrice, quantity) {
    return request("/paper-positions", "POST", { taskId, label, side, entryPrice, quantity });
  },
  async fetchPositions() {
    return request("/paper-positions", "GET");
  },
  async closePosition(id, exitPrice) {
    return request(`/paper-positions/${id}/close`, "POST", { exitPrice });
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
    if (btn.dataset.tab === "portfolio") refreshPortfolio();
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
const taskIdeaRow = document.getElementById("task-idea-row");

for (const [value, label] of Object.entries(TASK_TYPE_LABELS)) {
  const opt = new Option(label, value);
  taskTypeSelect.add(opt);
}
taskTypeSelect.addEventListener("change", () => {
  const isDraft = taskTypeSelect.value === "digital-product";
  taskChainRow.style.display = isDraft ? "none" : "flex";
  taskIdeaRow.style.display = isDraft ? "none" : "flex";
});

document.getElementById("new-task-btn").addEventListener("click", () => newTaskDialog.showModal());
newTaskDialog.querySelector("[data-close]").addEventListener("click", () => newTaskDialog.close());

newTaskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = taskTypeSelect.value;
  const prompt = document.getElementById("task-prompt").value.trim();
  const chain = document.getElementById("task-chain").checked;
  const publishIdea = document.getElementById("task-idea").checked;
  if (!prompt) return;
  const chainTo = chain
    ? { type: "digital-product", promptPrefix: "Draft a short write-up summarizing this research for a general audience:" }
    : undefined;
  try {
    await api.submitTask(type, prompt, chainTo, publishIdea);
    newTaskDialog.close();
    newTaskForm.reset();
    await refreshTasks();
  } catch (err) {
    tasksError.textContent = err.message;
  }
});

function confidenceClass(confidence) {
  return (confidence || "").toLowerCase();
}

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

  if (task.idea) {
    const ideaEl = document.createElement("div");
    ideaEl.className = "idea-block";
    ideaEl.innerHTML = `
      <div class="idea-block-header">
        <strong>${escapeHtml(task.idea.summary)}</strong>
        <span class="confidence-pill ${confidenceClass(task.idea.confidence)}">${escapeHtml(task.idea.confidence)}</span>
      </div>
      <p class="idea-caveat">Confidence is the model's own qualitative gut-check, not a calculated probability or backtest.</p>
      <div class="idea-risks">Key risks: ${escapeHtml(task.idea.risks)}</div>
      <button class="track-idea-btn" type="button">+ Add to paper portfolio</button>
    `;
    ideaEl.querySelector(".track-idea-btn").addEventListener("click", () => {
      openPositionForm.dataset.taskId = task.id;
      document.getElementById("position-label").value = task.idea.summary;
      openPositionDialog.showModal();
    });
    li.appendChild(ideaEl);
  }

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
  const publishIdea = document.getElementById("schedule-idea").checked;
  if (!prompt) return;
  try {
    await api.createSchedule(type, prompt, intervalMinutes, publishIdea);
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

// --- Paper Portfolio ---
const portfolioList = document.getElementById("portfolio-list");
const portfolioError = document.getElementById("portfolio-error");
const openPositionDialog = document.getElementById("open-position-dialog");
const openPositionForm = document.getElementById("open-position-form");
const closePositionDialog = document.getElementById("close-position-dialog");
const closePositionForm = document.getElementById("close-position-form");

openPositionDialog.querySelector("[data-close]").addEventListener("click", () => openPositionDialog.close());
closePositionDialog.querySelector("[data-close]").addEventListener("click", () => closePositionDialog.close());

openPositionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const taskId = openPositionForm.dataset.taskId || undefined;
  const label = document.getElementById("position-label").value.trim();
  const side = document.getElementById("position-side").value;
  const entryPrice = Number(document.getElementById("position-entry").value);
  const quantity = Number(document.getElementById("position-qty").value);
  if (!label || !entryPrice || !quantity) return;
  try {
    await api.openPosition(taskId, label, side, entryPrice, quantity);
    openPositionDialog.close();
    openPositionForm.reset();
    delete openPositionForm.dataset.taskId;
    if (document.getElementById("portfolio").classList.contains("active")) await refreshPortfolio();
  } catch (err) {
    portfolioError.textContent = err.message;
  }
});

closePositionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = closePositionForm.dataset.positionId;
  const exitPrice = Number(document.getElementById("close-exit-price").value);
  if (!id || !exitPrice) return;
  try {
    await api.closePosition(id, exitPrice);
    closePositionDialog.close();
    closePositionForm.reset();
    await refreshPortfolio();
  } catch (err) {
    portfolioError.textContent = err.message;
  }
});

function positionCard(position) {
  const li = document.createElement("li");
  li.className = "card";
  const pnlHtml =
    position.status === "closed"
      ? `<div class="card-meta">Exit: ${position.exitPrice} · P&amp;L: <span class="${position.pnl >= 0 ? "pnl-positive" : "pnl-negative"}">${position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}</span></div>`
      : "";
  li.innerHTML = `
    <div class="position-header">
      <strong>${escapeHtml(position.label)}</strong>
      <span class="side-tag ${position.side}">${position.side}</span>
    </div>
    <div class="card-meta">Entry: ${position.entryPrice} · Qty: ${position.quantity} · ${position.status}</div>
    ${pnlHtml}
  `;
  if (position.status === "open") {
    const closeBtn = document.createElement("button");
    closeBtn.className = "card-cancel";
    closeBtn.textContent = "Close position";
    closeBtn.addEventListener("click", () => {
      closePositionForm.dataset.positionId = position.id;
      closePositionDialog.showModal();
    });
    li.appendChild(closeBtn);
  }
  return li;
}

async function refreshPortfolio() {
  try {
    const positions = await api.fetchPositions();
    portfolioList.innerHTML = "";
    positions.forEach((p) => portfolioList.appendChild(positionCard(p)));
    portfolioError.textContent = "";
  } catch (err) {
    portfolioError.textContent = err.message;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

refreshTasks();
