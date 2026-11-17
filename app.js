const state = {
  tab: "overview",
  chapIdx: 0,
  notes: null,
  exams: [],
  mastered: new Set(JSON.parse(localStorage.getItem("fp_mastered_v1") || "[]")),
  filters: { q: "", exam: "all", era: "all", subj: "all", chap: "all", coreOnly: false },
  page: 1,
  pageSize: 25,
  expandedIds: new Set(),
};

function saveMastered() {
  localStorage.setItem("fp_mastered_v1", JSON.stringify([...state.mastered]));
  document.getElementById("progressPill").textContent = `已掌握 ${state.mastered.size}`;
}

function toggleMastered(key) {
  if (state.mastered.has(key)) state.mastered.delete(key);
  else state.mastered.add(key);
  saveMastered();
  render();
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMathInEl(el) {
  if (typeof renderMathInElement === "function" && el) {
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
    });
  }
}

function renderOverview() {
  const total = state.exams.length;
  const recent = state.exams.filter((x) => x.y >= 2017).length;
  const mid = state.exams.filter((x) => x.y >= 2010 && x.y <= 2016).length;
  const early = state.exams.filter((x) => x.y > 0 && x.y < 2010).length;
  const coreCnt = state.exams.filter((x) => x.c).length;

  const bySubj = {};
  for (const r of state.exams) {
    bySubj[r.subj] = (bySubj[r.subj] || 0) + 1;
  }

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">去重历年真题总量 (1987–2026)</div>
        <div class="stat-val">${total}</div>
        <div class="stat-desc">已剔除模拟卷 · 含 64 道 2024–2026 补全分类</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">年代分段分布</div>
        <div class="stat-val">${recent} / ${mid} / ${early}</div>
        <div class="stat-desc">近十年(17-26) / 10-16年 / 早年(87-09)</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">985 严选核心母题</div>
        <div class="stat-val">${coreCnt}</div>
        <div class="stat-desc">高数 ${(bySubj["高等数学"]||0)} · 线代 ${(bySubj["线性代数"]||0)} · 概率 ${(bySubj["概率统计"]||0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">个人复盘进度</div>
        <div class="stat-val">${state.mastered.size}</div>
        <div class="stat-desc">本地浏览器持久化保存</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">📖 使用指南（大观园分类 × Maki 讲义复盘流）</h2>
        <span class="badge teal">先知识 → 再易错 → 后真题与最优解</span>
      </div>
      <p>1. 点击上方 <b>高等数学 / 线性代数 / 概率统计</b>，按网站章节树先看 <b>📘 知识卡片</b> 与 <b>⚠️ 提醒/易错</b>，再看对应 <b>🎯 典型真题最优解替换</b> 与 <b>🔗 同类题手法共通之处</b>。</p>
      <p>2. 点击 <b>🔍 全量真题库</b>，可按考种（数一/二/三）、年代（含 1987–2009 早年真题与 2024–2026 补全真题）、学科章节、985 严选、或题号 <code>#ID</code> 检索全部 <b>${total}</b> 道真题。</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
        <button class="btn-sm" onclick="jumpBank({era:'recent'})">查看近十年真题 (2017–2026)</button>
        <button class="btn-sm" onclick="jumpBank({era:'early'})">查看早年经典 (1987–2009)</button>
        <button class="btn-sm" onclick="jumpBank({coreOnly:true})">只看 985 严选母题</button>
      </div>
    </div>
  `;
}

function renderSubjectLecture(subjKey) {
  const subj = state.notes.subjects.find((s) => s.key === subjKey);
  if (!subj) return "";
  const chaps = subj.chapters;
  const idx = Math.min(state.chapIdx, chaps.length - 1);
  const ch = chaps[idx];

  const qByChap = state.exams.filter((r) => r.subj === subjKey && r.ch.includes(ch.name.split("（")[0].slice(0, 2)));

  return `
    <div class="lecture-layout">
      <aside class="sidebar">
        <div class="sidebar-title">${escHtml(subj.key)} 章节导航</div>
        ${chaps.map((c, i) => `
          <button class="chap-btn ${i === idx ? "active" : ""}" onclick="selectChap(${i})">
            <span>${escHtml(c.name)}</span>
          </button>
        `).join("")}
        <hr style="border:none;border-top:1px solid var(--border);margin:10px 0;" />
        <button class="btn-sm" style="width:100%" onclick="jumpBank({subj:'${subjKey}'})">在全量题库中浏览 ${subjKey} →</button>
      </aside>

      <section>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${escHtml(ch.name)}</h2>
            <span class="badge">${escHtml(ch.badge)}</span>
          </div>

          ${ch.knowledge.map((k, ki) => {
            const mKey = `k:${subjKey}:${ch.name}:${ki}`;
            const done = state.mastered.has(mKey);
            return `
              <div class="k-block">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                  <h4>📘 ${escHtml(k.title)}</h4>
                  <button class="mastery-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}')">${done ? "✓ 已掌握" : "标记已掌握"}</button>
                </div>
                <div class="k-chain">🔗 知识链：${escHtml(k.chain)}</div>
                <div>${escHtml(k.content)}</div>
              </div>
            `;
          }).join("")}

          <div class="pitfall-block">
            <h4>⚠️ 高频提醒 / 易错边界</h4>
            <ul>${ch.pitfalls.map((p) => `<li>${escHtml(p)}</li>`).join("")}</ul>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🎯 典型真题详解、最优解替换与手法共通</h3>
            <span class="badge purple">共 ${ch.cases.length} 组精讲</span>
          </div>
          ${ch.cases.map((c) => {
            const rawQ = state.exams.find((x) => x.id === c.id);
            const mKey = `q:${c.id}`;
            const done = state.mastered.has(mKey);
            return `
              <div class="case-card">
                <div class="case-meta">
                  <span class="badge">#${c.id}</span>
                  <span class="badge teal">${escHtml(c.src)}</span>
                  <span class="badge orange">${"★".repeat(c.stars)}${"☆".repeat(5 - c.stars)}</span>
                  <strong style="flex:1">${escHtml(c.title)}</strong>
                  <button class="mastery-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}')">${done ? "✓ 已复盘" : "标记复盘"}</button>
                </div>
                ${rawQ ? `<div class="q-stem">${escHtml(rawQ.q)}</div>` : ""}
                <div class="case-section"><span class="case-label">⚡ 最优解与详解：</span>${escHtml(c.optimal)}</div>
                <div class="case-section"><span class="case-label common">🔗 手法/思想共通之处：</span>${escHtml(c.common)}</div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function getFilteredExams() {
  const f = state.filters;
  const kw = f.q.trim().toLowerCase();
  return state.exams.filter((r) => {
    if (f.exam !== "all" && !r.e.includes(f.exam)) return false;
    if (f.era === "recent" && r.y < 2017) return false;
    if (f.era === "mid" && (r.y < 2010 || r.y > 2016)) return false;
    if (f.era === "early" && (r.y === 0 || r.y >= 2010)) return false;
    if (f.subj !== "all" && r.subj !== f.subj) return false;
    if (f.chap !== "all" && r.ch !== f.chap) return false;
    if (f.coreOnly && !r.c) return false;
    if (kw) {
      const hay = `#${r.id} ${r.s} ${r.subj} ${r.ch} ${r.sub} ${r.q}`.toLowerCase();
      if (!kw.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function renderBank() {
  const list = getFilteredExams();
  const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
  if (state.page > totalPages) state.page = 1;
  const slice = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

  const chaps = [...new Set(
    state.exams.filter((r) => state.filters.subj === "all" || r.subj === state.filters.subj).map((r) => r.ch)
  )].sort();

  return `
    <div class="filter-bar">
      <input id="searchInput" placeholder="搜索题号(#7881)、知识点(泰勒)、年份(2026)..." value="${escHtml(state.filters.q)}" oninput="onSearch(this.value)" />
      <select onchange="onFilter('exam', this.value)">
        <option value="all" ${state.filters.exam==="all"?"selected":""}>全部考种</option>
        <option value="数一" ${state.filters.exam==="数一"?"selected":""}>数学一</option>
        <option value="数二" ${state.filters.exam==="数二"?"selected":""}>数学二</option>
        <option value="数三" ${state.filters.exam==="数三"?"selected":""}>数学三</option>
      </select>
      <select onchange="onFilter('era', this.value)">
        <option value="all" ${state.filters.era==="all"?"selected":""}>全部年代 (1987–2026)</option>
        <option value="recent" ${state.filters.era==="recent"?"selected":""}>近十年 (2017–2026)</option>
        <option value="mid" ${state.filters.era==="mid"?"selected":""}>2010–2016</option>
        <option value="early" ${state.filters.era==="early"?"selected":""}>早年经典 (1987–2009)</option>
      </select>
      <select onchange="onFilter('subj', this.value); onFilter('chap', 'all')">
        <option value="all" ${state.filters.subj==="all"?"selected":""}>全部学科</option>
        <option value="高等数学" ${state.filters.subj==="高等数学"?"selected":""}>高等数学</option>
        <option value="线性代数" ${state.filters.subj==="线性代数"?"selected":""}>线性代数</option>
        <option value="概率统计" ${state.filters.subj==="概率统计"?"selected":""}>概率统计</option>
      </select>
      <select onchange="onFilter('chap', this.value)">
        <option value="all">全部章节</option>
        ${chaps.map((c) => `<option value="${escHtml(c)}" ${state.filters.chap===c?"selected":""}>${escHtml(c)}</option>`).join("")}
      </select>
      <label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" ${state.filters.coreOnly?"checked":""} onchange="onFilter('coreOnly', this.checked)" style="min-width:auto;" /> 985严选
      </label>
      <span class="badge">匹配 ${list.length} 题</span>
    </div>

    ${slice.map((r) => {
      const open = state.expandedIds.has(r.id);
      const mKey = `q:${r.id}`;
      const done = state.mastered.has(mKey);
      return `
        <div class="q-item">
          <div class="case-meta">
            <span class="badge">#${r.id}</span>
            <span class="badge teal">${escHtml(r.s)}</span>
            <span class="badge purple">${escHtml(r.subj)} / ${escHtml(r.ch)} / ${escHtml(r.sub)}</span>
            ${r.c ? '<span class="badge orange">985严选</span>' : ""}
            <span style="flex:1"></span>
            <button class="mastery-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}')">${done ? "✓ 已掌握" : "标记掌握"}</button>
            <button class="btn-sm" onclick="toggleExpand(${r.id})">${open ? "收起解析" : "查看答案与解析"}</button>
          </div>
          <div class="q-stem">${escHtml(r.q)}</div>
          ${r.o && r.o.length ? `<div class="q-opts">${r.o.map((opt) => `<div class="q-opt">${escHtml(opt)}</div>`).join("")}</div>` : ""}
          ${open ? `
            <div class="q-expl">
              <div><strong>答案：</strong>${escHtml(r.a)}</div>
              <div style="margin-top:6px;"><strong>解析：</strong>${escHtml(r.x).replace(/\n/g, "<br/>")}</div>
            </div>
          ` : ""}
        </div>
      `;
    }).join("")}

    <div class="pagination">
      <button class="btn-sm" ${state.page<=1?"disabled":""} onclick="goPage(${state.page-1})">上一页</button>
      <span>第 ${state.page} / ${totalPages} 页</span>
      <button class="btn-sm" ${state.page>=totalPages?"disabled":""} onclick="goPage(${state.page+1})">下一页</button>
    </div>
  `;
}

function render() {
  const root = document.getElementById("appRoot");
  if (!state.notes) return;
  const activeId = document.activeElement && document.activeElement.id;
  const selStart = activeId === "searchInput" ? document.activeElement.selectionStart : null;
  if (state.tab === "overview") root.innerHTML = renderOverview();
  else if (state.tab === "bank") root.innerHTML = renderBank();
  else root.innerHTML = renderSubjectLecture(state.tab);
  renderMathInEl(root);
  if (activeId === "searchInput") {
    const inp = document.getElementById("searchInput");
    if (inp) {
      inp.focus();
      if (selStart !== null) inp.setSelectionRange(selStart, selStart);
    }
  }
}

window.selectChap = (i) => { state.chapIdx = i; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
window.toggleExpand = (id) => {
  if (state.expandedIds.has(id)) state.expandedIds.delete(id);
  else state.expandedIds.add(id);
  render();
};
window.toggleMastered = toggleMastered;
window.onFilter = (k, v) => { state.filters[k] = v; state.page = 1; render(); };
window.onSearch = (v) => { state.filters.q = v; state.page = 1; render(); };
window.goPage = (p) => { state.page = p; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
window.jumpBank = (opts) => {
  state.tab = "bank";
  state.filters = { q: "", exam: "all", era: "all", subj: "all", chap: "all", coreOnly: false, ...opts };
  state.page = 1;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "bank"));
  render();
};

document.getElementById("navTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  state.tab = btn.dataset.tab;
  state.chapIdx = 0;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem("fp_theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem("fp_theme") === "dark") document.documentElement.classList.add("dark");
saveMastered();

Promise.all([
  fetch("./data/review_notes.json").then((r) => r.json()),
  fetch("./data/real_exams.json").then((r) => r.json()),
]).then(([notes, exams]) => {
  state.notes = notes;
  state.exams = exams;
  render();
}).catch((err) => {
  document.getElementById("appRoot").innerHTML = `<div class="loading-box">数据加载失败：${escHtml(err.message)}</div>`;
});
