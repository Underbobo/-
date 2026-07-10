const state = {
  section: "overview",
  platform: "all",
  pendingTask: null,
  tasks: [],
  jobs: [],
  summary: null,
};

const sectionMeta = {
  overview: ["交付看板", "按平台完成每日数据交付"],
  tasks: ["数据采集", "选择平台后，按步骤完成采集、同步和汇总"],
  jobs: ["任务中心", "查看任务状态、耗时、退出码和运行日志"],
  guide: ["操作指南", "三步完成日常数据交付"],
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function fmtNumber(value) {
  const num = Number(value || 0);
  return num.toLocaleString("zh-CN");
}

function fmtBytes(value) {
  const size = Number(value || 0);
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setSection(section) {
  state.section = section;
  document.querySelectorAll(".section").forEach((node) => {
    node.classList.toggle("active", node.id === section);
  });
  document.querySelectorAll(".nav-item").forEach((node) => {
    node.classList.toggle("active", node.dataset.section === section);
  });
  const [title, sub] = sectionMeta[section];
  document.querySelector("#sectionTitle").textContent = title;
  document.querySelector("#sectionSub").textContent = sub;
}

function renderServiceStatus() {
  const schedule = state.summary?.daily_schedule || {};
  document.querySelector("#serviceStatus").innerHTML = schedule.lock?.active
    ? `<i></i> 自动化运行中`
    : `<i></i> 服务就绪`;
}

function renderRecentJobs() {
  const jobs = state.jobs.slice(0, 6);
  const el = document.querySelector("#recentJobs");
  if (!jobs.length) {
    el.innerHTML = `<div class="compact-item"><strong>暂无记录</strong><span>运行一次任务后这里会显示状态</span><span></span></div>`;
    return;
  }
  el.innerHTML = jobs
    .map(
      (job) => `
        <div class="compact-item">
          <strong class="status-${job.status}">${statusText(job.status)}</strong>
          <span>${escapeHtml(job.task_title || job.task_id)}</span>
          <span>${escapeHtml(job.started_at || "")}</span>
        </div>
      `,
    )
    .join("");
}

function statusText(status) {
  return {
    running: "运行中",
    success: "成功",
    failed: "失败",
  }[status] || status;
}

function renderTasks() {
  const platforms = [...new Set(state.tasks.map((task) => task.platform))];
  const selected = state.platform === "all" ? platforms : [state.platform];
  document.querySelector("#platformTabs").innerHTML = ["all", ...platforms]
    .map((platform) => {
      const label = platform === "all" ? "全部平台" : platform;
      return `<button class="platform-tab ${state.platform === platform ? "active" : ""}" data-platform="${escapeHtml(platform)}">${escapeHtml(label)}</button>`;
    })
    .join("");

  const kindGuide = {
    collect: ["1", "采集数据", "从平台获取最新数据"],
    upload: ["2", "同步飞书", "将本地结果同步到日报数据表"],
    report: ["3", "生成日报", "按当前数据计算日报结果"],
  };
  document.querySelector("#taskGrid").innerHTML = selected
    .map((platform) => {
      const tasks = state.tasks.filter((task) => task.platform === platform);
      const blocks = ["collect", "upload", "report"]
        .map((kind) => {
          const group = tasks.filter((task) => task.kind === kind);
          if (!group.length) return "";
          const [step, title, description] = kindGuide[kind];
          return `
            <section class="task-step">
              <div class="task-step-head"><span>${step}</span><div><h3>${title}</h3><p>${description}</p></div></div>
              <div class="task-grid">${group.map(renderTaskCard).join("")}</div>
            </section>`;
        })
        .join("");
      return `<section class="platform-task-group"><div class="platform-task-head"><h2>${escapeHtml(platform)}</h2><span>${tasks.length} 项可操作任务</span></div>${blocks}</section>`;
    })
    .join("");
}

function renderTaskCard(task) {
  const missing = !task.script_exists;
  const outputCount = task.outputs?.filter((item) => item.exists).length || 0;
  return `
    <article class="task">
      <div class="task-body">
        <div class="task-top">
          <h3>${escapeHtml(task.title)}</h3>
          <span class="badge ${task.kind}">${escapeHtml(task.kind_label)}</span>
        </div>
        <p>${escapeHtml(task.description)}</p>
        <div class="task-meta">
          <span class="badge ${missing ? "failed" : ""}">${missing ? "暂不可用" : "可运行"}</span>
          <span class="badge">已就绪 ${outputCount}/${task.outputs?.length || 0}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="button" data-run="${escapeHtml(task.id)}" ${missing ? "disabled" : ""}>选择方式并运行</button>
      </div>
    </article>`;
}

function renderDeliveryBoard() {
  const platforms = [...new Set(state.tasks.map((task) => task.platform))];
  const el = document.querySelector("#deliveryBoard");
  el.innerHTML = platforms
    .map((platform) => {
      const tasks = state.tasks.filter((task) => task.platform === platform);
      const recent = state.jobs.find((job) => job.platform === platform);
      const status = recent ? statusText(recent.status) : "等待操作";
      return `<button class="delivery-card" data-open-platform="${escapeHtml(platform)}"><strong>${escapeHtml(platform)}</strong><span>${tasks.length} 项任务</span><em class="status-${recent?.status || "running"}">${escapeHtml(status)}</em><b>进入操作 →</b></button>`;
    })
    .join("");
}

function renderJobs() {
  const rows = state.jobs
    .map(
      (job) => `
        <tr data-job="${escapeHtml(job.id)}">
          <td class="status-${job.status}">${statusText(job.status)}</td>
          <td>${escapeHtml(job.task_title || job.task_id)}<br><span class="muted">${escapeHtml(job.platform || "")}</span></td>
          <td>${job.mode === "preview" ? "预览" : "正常"}</td>
          <td>${escapeHtml(job.started_at || "")}</td>
          <td>${job.duration_seconds ? `${job.duration_seconds}s` : "-"}</td>
          <td>${job.returncode ?? "-"}</td>
        </tr>
      `,
    )
    .join("");
  document.querySelector("#jobsTable").innerHTML = rows || `<tr><td colspan="6">暂无运行记录</td></tr>`;
}

function renderAll() {
  renderServiceStatus();
  renderDeliveryBoard();
  renderTasks();
  renderJobs();
}

async function refreshAll() {
  const [summary, tasks, jobs] = await Promise.all([
    api("/api/summary"),
    api("/api/tasks"),
    api("/api/jobs?limit=60"),
  ]);
  state.summary = summary;
  state.tasks = tasks;
  state.jobs = jobs;
  renderAll();
}

async function runTask(taskId, mode) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const job = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, mode }),
  });
  showToast(`已启动：${task.title}`);
  state.section = "jobs";
  setSection("jobs");
  await refreshAll();
  await showJobLog(job.id);
}

function previewDescription(task) {
  if (task.kind === "collect") return "仅采集数据，不同步飞书。";
  if (task.kind === "upload") return "校验数据，不写入飞书。";
  return "仅计算结果，不写入正式日报。";
}

function openRunModal(task) {
  state.pendingTask = task;
  document.querySelector("#runModalPlatform").textContent = task.platform;
  document.querySelector("#runModalTitle").textContent = task.title;
  document.querySelector("#runModalDescription").textContent = task.description;
  const preview = document.querySelector("#previewOption");
  preview.hidden = !task.has_preview;
  document.querySelector("#previewOptionDescription").textContent = previewDescription(task);
  document.querySelector('input[name="runMode"][value="normal"]').checked = true;
  document.querySelectorAll(".run-option").forEach((node) => node.classList.toggle("selected", node.querySelector("input").checked));
  const modal = document.querySelector("#runModal");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeRunModal() {
  const modal = document.querySelector("#runModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  state.pendingTask = null;
}

async function showJobLog(jobId) {
  const job = await api(`/api/jobs/${jobId}`);
  document.querySelector("#jobLog").textContent = job.log_tail || "暂无日志输出。";
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-section]");
  if (nav) {
    setSection(nav.dataset.section);
    return;
  }

  const platform = event.target.closest("[data-platform]");
  if (platform) {
    state.platform = platform.dataset.platform;
    renderTasks();
    return;
  }

  const platformShortcut = event.target.closest("[data-open-platform]");
  if (platformShortcut) {
    state.platform = platformShortcut.dataset.openPlatform;
    setSection("tasks");
    renderTasks();
    return;
  }

  const run = event.target.closest("[data-run]");
  if (run) {
    const task = state.tasks.find((item) => item.id === run.dataset.run);
    if (task) openRunModal(task);
    return;
  }

  if (event.target.closest("[data-modal-close]")) {
    closeRunModal();
    return;
  }

  const row = event.target.closest("[data-job]");
  if (row) {
    try {
      await showJobLog(row.dataset.job);
    } catch (error) {
      showToast(error.message);
    }
  }
});

document.querySelector("#runModal").addEventListener("change", (event) => {
  if (event.target.name !== "runMode") return;
  document.querySelectorAll(".run-option").forEach((node) => node.classList.toggle("selected", node.querySelector("input").checked));
});

document.querySelector("#runModalSubmit").addEventListener("click", async () => {
  const task = state.pendingTask;
  if (!task) return;
  const mode = document.querySelector('input[name="runMode"]:checked').value;
  closeRunModal();
  try {
    await runTask(task.id, mode);
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#refreshBtn").addEventListener("click", async () => {
  try {
    await refreshAll();
    showToast("已刷新");
  } catch (error) {
    showToast(error.message);
  }
});

window.setInterval(async () => {
  if (state.jobs.some((job) => job.status === "running")) {
    try {
      await refreshAll();
    } catch {
      // keep quiet during transient reloads
    }
  }
}, 5000);

refreshAll().catch((error) => showToast(error.message));
