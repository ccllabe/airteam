const SHEET_ID = "1iDwcpwO82rt4QqUc-B3SxE5NfaTLlzJWcozrOf3LKJA";
const SHEET_QUERY = encodeURIComponent("select A, B, D, E, I, K, M, N where A <> '不公開'");
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&tq=${SHEET_QUERY}`;

const state = { rows: [], search: "", status: "all" };
const elements = {
  body: document.querySelector("#work-table-body"), empty: document.querySelector("#empty-state"), loading: document.querySelector("#loading-state"),
  message: document.querySelector("#status-message"), search: document.querySelector("#search-input"), status: document.querySelector("#status-filter"),
  refresh: document.querySelector("#refresh-button"), resultCount: document.querySelector("#result-count"),
  visibleCount: document.querySelector("#visible-count"), activeCount: document.querySelector("#active-count"), closedCount: document.querySelector("#closed-count"),
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
  return value || "—";
}

function toRow(headers, values) {
  const item = {};
  headers.forEach((header, index) => { item[header] = String(values[index] || "").trim(); });
  return {
    visibility: item["公開"] || "", status: item["狀態"] || "未分類",
    serviceCount: item["服務人數"] || "—", department: item["需求者系所"] || "—", title: item["標題"] || "未命名需求",
    assignees: item["承辦人"] || "", date: item["立案日"] || "", closeDate: item["結案日"] || "",
  };
}

function statusClass(status) {
  if (status.includes("處理")) return "status-processing";
  if (status.includes("結案")) return "status-closed";
  if (status.includes("立案")) return "status-open";
  return "status-other";
}

function getAssigneeSurnames(value) {
  return String(value || "")
    .split(/[、；，。,.;]+/)
    .map((person) => person.trim())
    .filter(Boolean)
    .map((person) => person.charAt(0));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function filteredRows() {
  const query = state.search.toLocaleLowerCase("zh-Hant");
  return state.rows.filter((item) => {
    const searchable = `${item.title} ${item.department}`.toLocaleLowerCase("zh-Hant");
    return (!query || searchable.includes(query)) && (state.status === "all" || item.status === state.status);
  });
}

function render() {
  const rows = filteredRows();
  elements.body.innerHTML = rows.map((item) => `
    <tr>
      <td><span class="status-badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td class="service-count-cell">${escapeHtml(item.serviceCount)}</td>
      <td class="department-cell">${escapeHtml(item.department)}</td>
      <td class="title-cell">${escapeHtml(item.title)}</td>
      <td><div class="assignee-list">${getAssigneeSurnames(item.assignees).map((surname) => `<span class="assignee-avatar">${escapeHtml(surname)}</span>`).join("") || "—"}</div></td>
      <td class="date-cell">${escapeHtml(parseDate(item.date))}</td>
      <td class="date-cell">${escapeHtml(parseDate(item.closeDate))}</td>
    </tr>`).join("");
  elements.empty.hidden = rows.length !== 0;
  elements.resultCount.textContent = `共 ${rows.length} 筆`;
  elements.visibleCount.textContent = state.rows.length;
  elements.activeCount.textContent = state.rows.filter((item) => item.status.includes("處理")).length;
  elements.closedCount.textContent = state.rows.filter((item) => item.status.includes("結案")).length;
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
  elements.empty.hidden = true;
  elements.loading.hidden = false;
  try {
    const response = await fetch(`${CSV_URL}&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google 試算表回應 ${response.status}`);
    const parsed = parseCsv(await response.text());
    if (parsed.length < 2) throw new Error("試算表沒有可顯示的資料");
    const headers = parsed[0].map(normalizeHeader);
    state.rows = parsed.slice(1).map((values) => toRow(headers, values)).filter((item) => item.visibility !== "不公開");
    setOptions(elements.status, [...new Set(state.rows.map((item) => item.status).filter(Boolean))], "所有狀態");
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
window.addEventListener("pageshow", (event) => { if (event.persisted) loadData(); });
loadData();
