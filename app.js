const SHEET_ID = "1iDwcpwO82rt4QqUc-B3SxE5NfaTLlzJWcozrOf3LKJA";
const SHEET_QUERY = encodeURIComponent("select A, B, D, E, F, J, K, M, N, P, Q, R where A <> '不公開'");
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&tq=${SHEET_QUERY}`;

const state = { rows: [], search: "", status: "all", sortKey: "date", sortDirection: "desc" };
const elements = {
  activeBody: document.querySelector("#active-work-table-body"), closedBody: document.querySelector("#closed-work-table-body"),
  activeEmpty: document.querySelector("#active-empty-state"), closedEmpty: document.querySelector("#closed-empty-state"),
  activeTableCount: document.querySelector("#active-table-count"), closedTableCount: document.querySelector("#closed-table-count"),
  tables: document.querySelector("#tables-container"), loading: document.querySelector("#loading-state"),
  message: document.querySelector("#status-message"), search: document.querySelector("#search-input"), status: document.querySelector("#status-filter"),
  refresh: document.querySelector("#refresh-button"), resultCount: document.querySelector("#result-count"),
  visibleCount: document.querySelector("#visible-count"), activeCount: document.querySelector("#active-count"), closedCount: document.querySelector("#closed-count"),
  leaderboard: document.querySelector("#leaderboard"), leaderboardList: document.querySelector("#leaderboard-list"),
};

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); if (row.some((cell) => cell.trim() !== "")) rows.push(row); }
  return rows;
}

function normalizeHeader(header) { return String(header || "").replace(/^\uFEFF/, "").trim(); }

function parseDate(raw) {
  const value = String(raw || "").trim();
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
  return value;
}

function toRow(headers, values) {
  const item = {};
  headers.forEach((header, index) => { item[header] = String(values[index] || "").trim(); });
  return {
    visibility: item["公開"] || "", status: item["狀態"] || "",
    serviceCount: item["服務人數"] || "", computerCount: item["電腦數"] || "", colleague: item["需求者姓名(公開)"] || "", department: item["需求者系所"] || "", title: item["標題"] || "",
    assignees: item["承辦人"] || "", points: item["積分"] || "", date: item["立案日"] || "", expectedDate: item["預完日"] || "", closeDate: item["結案日"] || "",
  };
}

function statusClass(status) {
  if (status.includes("處理")) return "status-processing";
  if (status.includes("結案")) return "status-closed";
  if (status.includes("立案")) return "status-open";
  return "status-other";
}

function splitAssignees(value) {
  return String(value || "")
    .split(/[、；，。,.;]+/)
    .map((person) => person.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function getAssigneeSurnames(value) {
  return splitAssignees(value).map((person) => person.charAt(0));
}

function calculateLeaderboard(rows) {
  const totals = new Map();
  rows.forEach((item) => {
    if (!item.points) return;
    const points = Number(item.points.replace(/,/g, ""));
    if (!Number.isFinite(points)) return;
    new Set(splitAssignees(item.assignees)).forEach((person) => {
      totals.set(person, (totals.get(person) || 0) + points);
    });
  });
  return [...totals].map(([person, points]) => ({ person, points }))
    .sort((a, b) => b.points - a.points || a.person.localeCompare(b.person, "zh-Hant"))
    .slice(0, 3);
}

function renderLeaderboard() {
  const leaders = calculateLeaderboard(state.rows);
  const maxPoints = Math.max(0, ...leaders.map(({ points }) => points));
  const pointFormat = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
  elements.leaderboardList.innerHTML = leaders.length
    ? leaders.map(({ person, points }, index) => {
      const percent = maxPoints > 0 ? Math.max(0, points / maxPoints * 100) : 0;
      const surname = escapeHtml(person.charAt(0));
      const label = escapeHtml(`第 ${index + 1} 名，${person.charAt(0)}，${pointFormat.format(points)} 分`);
      return `<li class="leaderboard-item" aria-label="${label}">
        <div class="leaderboard-track" style="--score-percent: ${percent.toFixed(2)}%">
          <span class="leaderboard-fill"></span><span class="leaderboard-surname">${surname}</span>
        </div>
      </li>`;
    }).join("")
    : '<li class="leaderboard-empty">目前沒有積分資料</li>';
  elements.leaderboard.hidden = false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function filteredRows() {
  const query = state.search.toLocaleLowerCase("zh-Hant");
  return state.rows.filter((item) => {
    const searchable = `${item.title} ${item.department} ${item.colleague}`.toLocaleLowerCase("zh-Hant");
    return (!query || searchable.includes(query)) && (state.status === "all" || item.status === state.status);
  });
}

function sortedRows(rows) {
  return [...rows].sort((first, second) => {
    const firstValue = String(first[state.sortKey] || "").trim();
    const secondValue = String(second[state.sortKey] || "").trim();
    if (!firstValue && secondValue) return 1;
    if (firstValue && !secondValue) return -1;
    if (!firstValue && !secondValue) return 0;
    const comparison = ["serviceCount", "computerCount"].includes(state.sortKey)
      ? (Number(firstValue) || 0) - (Number(secondValue) || 0)
      : firstValue.localeCompare(secondValue, "zh-Hant", { numeric: true, sensitivity: "base" });
    return state.sortDirection === "asc" ? comparison : -comparison;
  });
}

function updateSortIndicators() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const active = button.dataset.sortKey === state.sortKey;
    const indicator = button.querySelector(".sort-indicator");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-label", `${button.textContent.trim()}，${active ? (state.sortDirection === "asc" ? "目前正序" : "目前反序") : "點擊排序"}`);
    if (active) indicator.dataset.direction = state.sortDirection;
    else delete indicator.dataset.direction;
  });
}

function renderRows(rows) {
  return rows.map((item) => `
    <tr>
      <td>${item.status ? `<span class="status-badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span>` : ""}</td>
      <td class="service-count-cell">${escapeHtml(item.serviceCount)}</td>
      <td class="computer-count-cell">${escapeHtml(item.computerCount)}</td>
      <td class="colleague-cell">${escapeHtml(item.colleague)}</td>
      <td class="department-cell">${escapeHtml(item.department)}</td>
      <td class="title-cell">${escapeHtml(item.title)}</td>
      <td><div class="assignee-list">${getAssigneeSurnames(item.assignees).map((surname) => `<span class="assignee-avatar">${escapeHtml(surname)}</span>`).join("")}</div></td>
      <td class="date-cell">${escapeHtml(parseDate(item.date))}</td>
      <td class="date-cell">${escapeHtml(parseDate(item.expectedDate))}</td>
      <td class="date-cell">${escapeHtml(parseDate(item.closeDate))}</td>
    </tr>`).join("");
}

function render() {
  const rows = sortedRows(filteredRows());
  const activeRows = rows.filter((item) => item.status !== "結案");
  const closedRows = rows.filter((item) => item.status === "結案");
  elements.activeBody.innerHTML = renderRows(activeRows);
  elements.closedBody.innerHTML = renderRows(closedRows);
  elements.activeEmpty.hidden = activeRows.length !== 0;
  elements.closedEmpty.hidden = closedRows.length !== 0;
  elements.activeTableCount.textContent = `${activeRows.length} 筆`;
  elements.closedTableCount.textContent = `${closedRows.length} 筆`;
  elements.resultCount.textContent = `共 ${rows.length} 筆`;
  elements.visibleCount.textContent = state.rows.filter((item) => item.status === "立案").length;
  elements.activeCount.textContent = state.rows.filter((item) => item.status.includes("處理")).length;
  elements.closedCount.textContent = state.rows.filter((item) => item.status.includes("結案")).length;
  updateSortIndicators();
  elements.tables.hidden = false;
}

function setOptions(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="all">${label}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = values.includes(current) ? current : "all";
}

function showError(error) {
  elements.message.textContent = `資料載入失敗：${error.message || "請稍後再試"}`;
  elements.message.hidden = false;
  elements.loading.hidden = true;
}

async function loadData() {
  elements.refresh.disabled = true;
  elements.refresh.classList.add("is-loading");
  elements.message.hidden = true;
  elements.tables.hidden = true;
  elements.leaderboard.hidden = true;
  elements.activeEmpty.hidden = true;
  elements.closedEmpty.hidden = true;
  elements.loading.hidden = false;
  try {
    const response = await fetch(`${CSV_URL}&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google 試算表回應 ${response.status}`);
    const parsed = parseCsv(await response.text());
    if (parsed.length < 2) throw new Error("試算表沒有可顯示的資料");
    const headers = parsed[0].map(normalizeHeader);
    state.rows = parsed.slice(1).map((values) => toRow(headers, values)).filter((item) => item.visibility !== "不公開");
    setOptions(elements.status, [...new Set(state.rows.map((item) => item.status).filter(Boolean))], "所有狀態");
    renderLeaderboard();
    render();
    elements.loading.hidden = true;
  } catch (error) {
    showError(error);
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.classList.remove("is-loading");
  }
}

elements.search.addEventListener("input", (event) => { state.search = event.target.value.trim(); render(); });
elements.status.addEventListener("change", (event) => { state.status = event.target.value; render(); });
elements.refresh.addEventListener("click", loadData);
document.querySelectorAll(".sort-button").forEach((button) => {
  button.addEventListener("click", () => {
    const nextKey = button.dataset.sortKey;
    if (state.sortKey === nextKey) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    else { state.sortKey = nextKey; state.sortDirection = "asc"; }
    render();
  });
});
window.addEventListener("pageshow", (event) => { if (event.persisted) loadData(); });
loadData();
