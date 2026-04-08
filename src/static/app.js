const statusBadge = document.querySelector("#statusBadge");
const statusCopy = document.querySelector("#statusCopy");
const dryRunToggle = document.querySelector("#dryRunToggle");
const autoApproveSelect = document.querySelector("#autoApproveSelect");
const approvalList = document.querySelector("#approvalList");
const logList = document.querySelector("#logList");
const domainList = document.querySelector("#domainList");
const processList = document.querySelector("#processList");
const stopButton = document.querySelector("#stopButton");

async function refresh() {
  const response = await fetch("/api/status");
  const status = await response.json();

  dryRunToggle.checked = Boolean(status.dryRun);
  autoApproveSelect.value = String(status.autoApproveMinutes ?? 0);
  renderStatus(status.activeLeases, status.autoApproveMinutes);
  renderAllowlists(status.policySummary);
  renderApprovals(status.pendingApprovals);
  renderLogs(status.recentLogs);
}

function renderStatus(activeLeases, autoApproveMinutes) {
  if (!activeLeases.length && !autoApproveMinutes) {
    statusBadge.textContent = "Idle";
    statusBadge.className = "status-badge idle";
    statusCopy.textContent = "No active control lease.";
    return;
  }

  if (autoApproveMinutes > 0) {
    statusBadge.textContent = "Auto-Approve On";
    statusBadge.className = "status-badge active";
    const leasePart = activeLeases.length ? ` Active leases: ${activeLeases.length}.` : "";
    statusCopy.textContent = `All actions auto-approved with ${autoApproveMinutes}m sessions.${leasePart}`;
    return;
  }

  const soonestExpiry = activeLeases
    .map((lease) => new Date(lease.expiresAt))
    .sort((left, right) => left - right)[0];
  statusBadge.textContent = "AI Control Active";
  statusBadge.className = "status-badge active";
  statusCopy.textContent = `Active leases: ${activeLeases.length}. Earliest expiry: ${soonestExpiry.toLocaleTimeString()}.`;
}

function renderAllowlists(summary) {
  domainList.innerHTML = summary.browserDomains.map((domain) => `<li>${domain}</li>`).join("");
  processList.innerHTML = summary.desktopProcesses.map((entry) => `<li>${entry}</li>`).join("");
}

function renderApprovals(approvals) {
  if (!approvals.length) {
    approvalList.className = "approval-list empty-state";
    approvalList.textContent = "No pending approvals.";
    return;
  }

  approvalList.className = "approval-list";
  approvalList.innerHTML = approvals
    .map(
      (approval) => `
        <article class="approval-card">
          <header>
            <div>
              <h3>${approval.action.summary}</h3>
              <p class="muted">Requested ${new Date(approval.createdAt).toLocaleTimeString()}</p>
            </div>
            <div class="chips">
              <span class="chip">${approval.action.scope}</span>
              <span class="chip ${approval.action.sensitivity === "critical" ? "critical" : ""}">${approval.action.sensitivity}</span>
            </div>
          </header>
          <p class="muted">Approval expires at ${new Date(approval.expiresAt).toLocaleTimeString()}.</p>
          <div class="card-actions">
            <button data-action="approve_once" data-approval="${approval.id}">Approve Once</button>
            <button data-action="approve_session_5" data-approval="${approval.id}">Approve 5m</button>
            <button data-action="approve_session_15" data-approval="${approval.id}">Approve 15m</button>
            <button data-action="approve_session_30" data-approval="${approval.id}">Approve 30m</button>
            <button data-action="approve_session_60" data-approval="${approval.id}">Approve 1hr</button>
            <button data-action="deny" data-approval="${approval.id}" class="secondary">Deny</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderLogs(entries) {
  if (!entries.length) {
    logList.className = "log-list empty-state";
    logList.textContent = "No log entries yet.";
    return;
  }

  logList.className = "log-list";
  logList.innerHTML = entries
    .map(
      (entry) => `
        <article class="log-entry">
          <header>
            <strong>${entry.action.summary}</strong>
            <span class="chip ${entry.action.sensitivity === "critical" ? "critical" : ""}">${entry.outcome}</span>
          </header>
          <p>${entry.message}</p>
          <p class="muted">${new Date(entry.timestamp).toLocaleString()}</p>
        </article>
      `
    )
    .join("");
}

approvalList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-approval]");
  if (!button) {
    return;
  }

  const approvalId = button.dataset.approval;
  const action = button.dataset.action;
  const sessionDurations = {
    approve_session_5: 5,
    approve_session_15: 15,
    approve_session_30: 30,
    approve_session_60: 60
  };

  const body =
    action === "deny"
      ? { state: "denied", reason: "Denied from control UI." }
      : sessionDurations[action]
        ? { state: "approved", mode: "approve_session", durationMinutes: sessionDurations[action] }
        : { state: "approved", mode: "approve_once" };

  await fetch(`/api/approvals/${approvalId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  await refresh();
});

autoApproveSelect.addEventListener("change", async () => {
  await fetch("/api/runtime/auto-approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ durationMinutes: Number(autoApproveSelect.value) })
  });
  await refresh();
});

dryRunToggle.addEventListener("change", async () => {
  await fetch("/api/runtime/dry-run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: dryRunToggle.checked })
  });
  await refresh();
});

stopButton.addEventListener("click", async () => {
  await fetch("/api/emergency-stop", { method: "POST" });
  await refresh();
});

setInterval(() => {
  void refresh();
}, 2000);

void refresh();
