const state = {
  section: "overview",
  filter: "all",
  tasks: [],
  jobs: [],
  datasets: [],
  scripts: [],
  summary: null,
};

const sectionMeta = {
  overview: ["总览", "自营直播、投流、订单与飞书日报的内网操作台"],
  tasks: ["采集与飞书", "按平台触发采集、上传、日报汇总脚本"],
  jobs: ["运行记录", "查看任务状态、耗时、退出码和日志尾部"],
  datasets: ["数据仓库", "扫描各来源 warehouse 目录里的 CSV 底表"],
  scripts: ["脚本档案", "目录下采集、飞书、汇总和辅助脚本清单"],
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

function renderMetrics() {
  const summary = state.summary || {};
  const schedule = summary.daily_schedule || {};
  const enabledTasks = (schedule.enabled_task_ids || []).join(" / ") || "未启用";
  const automationStatus = schedule.lock?.active ? `运行中：${schedule.lock.owner}` : "空闲";
  const metrics = [
    ["控制台任务", summary.task_count],
    ["脚本档案", summary.script_count],
    ["CSV 底表", summary.dataset_count],
    ["底表总行数", summary.total_dataset_rows],
    ["运行中任务", summary.running_jobs],
    ["最近失败", summary.recent_failed_jobs],
    ["每日计划", schedule.schedule || "未配置"],
    ["定时任务", enabledTasks],
    ["自动化状态", automationStatus],
    ["最新刷新", summary.generated_at || "-"],
    ["Python", summary.python ? "已配置" : "-"],
  ];

  document.querySelector("#metricsGrid").innerHTML = metrics
    .map(
      ([label, value]) => `
        <div class="metric">
          <span>${escapeHtml(label)}</span>
          <strong>${typeof value === "number" ? fmtNumber(value) : escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join("");

  document.querySelector("#projectPath").textContent = summary.project_dir || "-";
  document.querySelector("#pythonPath").textContent = summary.python || "-";
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

function renderLatestDataset() {
  const latest = state.summary?.latest_dataset;
  const el = document.querySelector("#latestDataset");
  if (!latest) {
    el.innerHTML = `<h4>暂无 CSV 底表</h4><p class="muted">采集或上传脚本生成 warehouse CSV 后会显示。</p>`;
    return;
  }
  el.innerHTML = `
    <h4>${escapeHtml(latest.name)}</h4>
    <p>${escapeHtml(latest.path)}</p>
    <div class="dataset-stats">
      <div><span>平台</span><strong>${escapeHtml(latest.platform)}</strong></div>
      <div><span>行数</span><strong>${fmtNumber(latest.rows)}</strong></div>
      <div><span>更新时间</span><strong>${escapeHtml(latest.modified_at)}</strong></div>
    </div>
  `;
}

function statusText(status) {
  return {
    running: "运行中",
    success: "成功",
    failed: "失败",
  }[status] || status;
}

function renderTasks() {
  const tasks = state.tasks.filter((task) => state.filter === "all" || task.kind === state.filter);
  document.querySelector("#taskGrid").innerHTML = tasks
    .map((task) => {
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
              <span class="badge">${escapeHtml(task.platform)}</span>
              <span class="badge ${missing ? "failed" : ""}">${missing ? "脚本缺失" : "脚本可用"}</span>
              <span class="badge">底表 ${outputCount}/${task.outputs?.length || 0}</span>
            </div>
            <p>${escapeHtml(task.script)}</p>
          </div>
          <div class="task-actions">
            <button class="button" data-run="${escapeHtml(task.id)}" data-mode="normal" ${missing ? "disabled" : ""}>运行</button>
            <button class="button ghost" data-run="${escapeHtml(task.id)}" data-mode="preview" ${!task.has_preview || missing ? "disabled" : ""}>预览</button>
          </div>
        </article>
      `;
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

function renderDatasets() {
  const el = document.querySelector("#datasetGrid");
  if (!state.datasets.length) {
    el.innerHTML = `<div class="panel"><div class="dataset-main"><h3>暂无 CSV 底表</h3><p>运行飞书上传或本地入库脚本后，warehouse 目录里的 CSV 会出现在这里。</p></div></div>`;
    return;
  }
  el.innerHTML = state.datasets
    .map(
      (item) => `
        <article class="dataset">
          <div class="dataset-main">
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.path)}</p>
            <p>${escapeHtml((item.columns || []).slice(0, 8).join(" / "))}</p>
          </div>
          <div class="dataset-stats">
            <div><span>平台</span><strong>${escapeHtml(item.platform)}</strong></div>
            <div><span>行数</span><strong>${fmtNumber(item.rows)}</strong></div>
            <div><span>大小</span><strong>${fmtBytes(item.size)}</strong></div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderScripts() {
  const rows = state.scripts
    .map(
      (script) => `
        <tr>
          <td>${escapeHtml(script.role)}</td>
          <td>${escapeHtml(script.path)}</td>
          <td>${fmtBytes(script.size)}</td>
          <td>${escapeHtml(script.modified_at)}</td>
        </tr>
      `,
    )
    .join("");
  document.querySelector("#scriptsTable").innerHTML = rows || `<tr><td colspan="4">暂无脚本</td></tr>`;
}

function renderAll() {
  renderMetrics();
  renderRecentJobs();
  renderLatestDataset();
  renderTasks();
  renderJobs();
  renderDatasets();
  renderScripts();
}

async function refreshAll() {
  const [summary, tasks, jobs, datasets, scripts] = await Promise.all([
    api("/api/summary"),
    api("/api/tasks"),
    api("/api/jobs?limit=60"),
    api("/api/datasets"),
    api("/api/scripts"),
  ]);
  state.summary = summary;
  state.tasks = tasks;
  state.jobs = jobs;
  state.datasets = datasets;
  state.scripts = scripts;
  renderAll();
}

async function runTask(taskId, mode) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (mode === "normal") {
    const ok = window.confirm(`确认运行：${task.title}\n\n该操作可能打开浏览器、下载数据或写入飞书。`);
    if (!ok) return;
  }
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

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("active", node === filter));
    renderTasks();
    return;
  }

  const run = event.target.closest("[data-run]");
  if (run) {
    try {
      await runTask(run.dataset.run, run.dataset.mode);
    } catch (error) {
      showToast(error.message);
    }
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
