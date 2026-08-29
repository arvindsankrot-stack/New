const TASK_TYPE_LABELS = {
  "crypto-research": "Crypto Research",
  "polymarket-research": "Polymarket Research",
  "stock-research": "Stock Research",
  "commodity-research": "Commodity Research",
  "digital-product": "Digital Product Draft",
};

// --- Icons (inline SVG, stroke-based, currentColor so they follow theme) ---
const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v10.5H9l-4 3.5v-3.5H4z"/></svg>',
  pool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="9" height="9" rx="1.5"/><rect x="11" y="11" width="9" height="9" rx="1.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V10M12 19V5M19 19v-7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-7-6.5 16-2.5-6.5L4 12z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"/></svg>',
};

function injectIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const icon = ICONS[el.dataset.icon];
    if (icon) el.innerHTML = icon;
  });
}
injectIcons();

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

// A submit button shows a spinner and disables itself for the life of an async action.
async function withBusyButton(button, action) {
  const originalText = button.textContent;
  button.disabled = true;
  button.dataset.busyText = originalText;
  button.innerHTML = '<span class="spinner spinner-inline"></span>';
  try {
    await action();
  } finally {
    button.disabled = false;
    button.textContent = button.dataset.busyText;
  }
}

function setState(prefix, { loading = false, empty = false } = {}) {
  const loadingEl = document.getElementById(`${prefix}-loading`);
  const emptyEl = document.getElementById(`${prefix}-empty`);
  if (loadingEl) loadingEl.hidden = !loading;
  if (emptyEl) emptyEl.hidden = !empty;
}

// --- Tabs ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "tasks") refreshTasks();
    if (btn.dataset.tab === "schedules") refreshSchedules();
    if (btn.dataset.tab === "portfolio") refreshPortfolio();
  });
});

// --- Chat ---
const chatLog = document.getElementById("chat-log");
const chatEmpty = document.getElementById("chat-empty");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatError = document.getElementById("chat-error");
let chatMessages = [];

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

document.getElementById("chat-clear").addEventListener("click", () => {
  chatMessages = [];
  renderChat();
});

function renderChat() {
  chatLog.innerHTML = "";
  if (chatMessages.length === 0) {
    chatLog.appendChild(chatEmpty);
    return;
  }
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
  chatInput.style.height = "auto";
  renderChat();
  chatError.textContent = "";

  const typingBubble = document.createElement("div");
  typingBubble.className = "bubble assistant typing";
  typingBubble.innerHTML = '<span class="spinner spinner-inline"></span>';
  chatLog.appendChild(typingBubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  chatSend.disabled = true;

  try {
    const { reply } = await api.chat(chatMessages);
    chatMessages.push({ role: "assistant", content: reply });
    renderChat();
  } catch (err) {
    typingBubble.remove();
    chatError.textContent = err.message;
  } finally {
    chatSend.disabled = false;
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

newTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = taskTypeSelect.value;
  const prompt = document.getElementById("task-prompt").value.trim();
  const chain = document.getElementById("task-chain").checked;
  const publishIdea = document.getElementById("task-idea").checked;
  if (!prompt) return;
  const chainTo = chain
    ? { type: "digital-product", promptPrefix: "Draft a short write-up summarizing this research for a general audience:" }
    : undefined;

  withBusyButton(newTaskForm.querySelector("button[type=submit]"), async () => {
    try {
      await api.submitTask(type, prompt, chainTo, publishIdea);
      newTaskDialog.close();
      newTaskForm.reset();
      taskChainRow.style.display = "flex";
      taskIdeaRow.style.display = "flex";
      await refreshTasks();
    } catch (err) {
      tasksError.textContent = err.message;
    }
  });
});

function confidenceClass(confidence) {
  return (confidence || "").toLowerCase();
}

function taskCard(task) {
  const li = document.createElement("li");
  li.className = "card";
  const branch = task.spawnedFrom ? ' <span class="branch-mark" title="Auto-spawned from another task">↳</span>' : "";
  li.innerHTML = `
    <div class="card-title-row">
      <strong>${TASK_TYPE_LABELS[task.type] ?? task.type}${branch}</strong>
      <span class="status-pill ${task.status}">${task.status === "in_progress" ? '<span class="spinner spinner-inline"></span>' : ""}${task.status.replace("_", " ")}</span>
    </div>
    <div class="card-prompt">${escapeHtml(task.prompt)}</div>
    ${task.result ? `<div class="card-result">${escapeHtml(task.result)}</div>` : ""}
    ${task.error ? `<div class="card-result card-error-text">${escapeHtml(task.error)}</div>` : ""}
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
      <button class="track-idea-btn" type="button">Add to paper portfolio</button>
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
  setState("tasks", { loading: taskList.children.length === 0 });
  try {
    const tasks = await api.fetchTasks();
    taskList.innerHTML = "";
    tasks.forEach((t) => taskList.appendChild(taskCard(t)));
    setState("tasks", { empty: tasks.length === 0 });
    tasksError.textContent = "";
  } catch (err) {
    tasksError.textContent = err.message;
    setState("tasks");
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

newScheduleForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = scheduleTypeSelect.value;
  const prompt = document.getElementById("schedule-prompt").value.trim();
  const intervalMinutes = Number(document.getElementById("schedule-interval").value);
  const publishIdea = document.getElementById("schedule-idea").checked;
  if (!prompt) return;

  withBusyButton(newScheduleForm.querySelector("button[type=submit]"), async () => {
    try {
      await api.createSchedule(type, prompt, intervalMinutes, publishIdea);
      newScheduleDialog.close();
      newScheduleForm.reset();
      await refreshSchedules();
    } catch (err) {
      schedulesError.textContent = err.message;
    }
  });
});

function scheduleCard(schedule) {
  const li = document.createElement("li");
  li.className = "card";
  li.innerHTML = `
    <div class="card-title-row">
      <strong>${TASK_TYPE_LABELS[schedule.type] ?? schedule.type}</strong>
      <button class="card-cancel" type="button">Cancel</button>
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
  setState("schedules", { loading: scheduleList.children.length === 0 });
  try {
    const schedules = await api.fetchSchedules();
    scheduleList.innerHTML = "";
    schedules.forEach((s) => scheduleList.appendChild(scheduleCard(s)));
    setState("schedules", { empty: schedules.length === 0 });
    schedulesError.textContent = "";
  } catch (err) {
    schedulesError.textContent = err.message;
    setState("schedules");
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

openPositionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const taskId = openPositionForm.dataset.taskId || undefined;
  const label = document.getElementById("position-label").value.trim();
  const side = document.getElementById("position-side").value;
  const entryPrice = Number(document.getElementById("position-entry").value);
  const quantity = Number(document.getElementById("position-qty").value);
  if (!label || !entryPrice || !quantity) return;

  withBusyButton(openPositionForm.querySelector("button[type=submit]"), async () => {
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
});

closePositionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = closePositionForm.dataset.positionId;
  const exitPrice = Number(document.getElementById("close-exit-price").value);
  if (!id || !exitPrice) return;

  withBusyButton(closePositionForm.querySelector("button[type=submit]"), async () => {
    try {
      await api.closePosition(id, exitPrice);
      closePositionDialog.close();
      closePositionForm.reset();
      await refreshPortfolio();
    } catch (err) {
      portfolioError.textContent = err.message;
    }
  });
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
    closeBtn.type = "button";
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
  setState("portfolio", { loading: portfolioList.children.length === 0 });
  try {
    const positions = await api.fetchPositions();
    portfolioList.innerHTML = "";
    positions.forEach((p) => portfolioList.appendChild(positionCard(p)));
    setState("portfolio", { empty: positions.length === 0 });
    portfolioError.textContent = "";
  } catch (err) {
    portfolioError.textContent = err.message;
    setState("portfolio");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

refreshTasks();
