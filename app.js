const state = {
  tab: "overview",
  chapIdx: 0,
  notes: null,
  exams: [],
  mastered: new Set(JSON.parse(localStorage.getItem("fp_mastered_v1") || "[]")),
  filters: { q: "", exam: "all", era: "all", subj: "all", chap: "all", coreOnly: false },
  page: 1,
  pageSize: 30,
  modalList: [],
  modalIndex: -1,
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
  if (state.modalIndex >= 0) renderModal();
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

function updateRail() {
  document.querySelectorAll(".rail-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
  const rc = document.getElementById("railChapters");
  if (!state.notes || state.tab === "overview" || state.tab === "bank") {
    rc.innerHTML = "";
    return;
  }
  const subj = state.notes.subjects.find((s) => s.key === state.tab);
  if (!subj) { rc.innerHTML = ""; return; }
  rc.innerHTML = `
    <div class="rail-section-label">${escHtml(subj.key)} · 章节</div>
    ${subj.chapters.map((c, i) => `
      <button class="rail-chap-btn ${i === state.chapIdx ? "active" : ""}" onclick="selectChap(${i})">${escHtml(c.name)}</button>
    `).join("")}
  `;
}

function updateBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  if (state.tab === "overview") bc.textContent = "APP / 全局总览";
  else if (state.tab === "bank") bc.textContent = "APP / 题库 / 1987–2026 历年真题";
  else if (state.notes) {
    const subj = state.notes.subjects.find((s) => s.key === state.tab);
    const ch = subj && subj.chapters[state.chapIdx];
    bc.textContent = `APP / 复盘讲义 / ${state.tab}${ch ? " / " + ch.name : ""}`;
  }
}

function renderOverview() {
  const total = state.exams.length;
  const recent = state.exams.filter((x) => x.y >= 2017).length;
  const mid = state.exams.filter((x) => x.y >= 2010 && x.y <= 2016).length;
  const early = state.exams.filter((x) => x.y > 0 && x.y < 2010).length;
  const coreCnt = state.exams.filter((x) => x.c).length;

  return `
    <div class="stats-grid">
      <div class="maki-panel">
        <div class="stat-lbl">去重真题总量 (1987–2026)</div>
        <div class="stat-num">${total}</div>
        <div class="stat-lbl">含 64 道 2024–2026 补全分类</div>
      </div>
      <div class="maki-panel">
        <div class="stat-lbl">年代分层 (17–26 / 10–16 / 87–09)</div>
        <div class="stat-num">${recent} / ${mid} / ${early}</div>
        <div class="stat-lbl">三十年真题全覆盖</div>
      </div>
      <div class="maki-panel">
        <div class="stat-lbl">985 严选核心母题</div>
        <div class="stat-num">${coreCnt}</div>
        <div class="stat-lbl">高频母题重点突破</div>
      </div>
      <div class="maki-panel">
        <div class="stat-lbl">本地掌握进度</div>
        <div class="stat-num">${state.mastered.size}</div>
        <div class="stat-lbl">保存在本浏览器</div>
      </div>
    </div>

    <div class="callout blue">
      <div class="callout-head"><span class="callout-tag">定义 / 导学 · 复盘联动工作流</span></div>
      <div>仿照 Maki Math 讲义结构：在左侧 <b>NAVIGATION</b> 切换学科章节，先阅读 <b>定理/公式卡片</b> 并标记掌握，再结合 <b>提醒/易错</b> 查看对应真题的 <b>最优解替换</b> 与 <b>同类题手法共通</b>。</div>
    </div>

    <div class="maki-panel" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <span style="font-weight:700;font-size:13.5px;">快捷入口：</span>
      <button class="maki-btn" onclick="jumpBank({era:'recent'})">近十年真题 (2017–2026)</button>
      <button class="maki-btn" onclick="jumpBank({era:'early'})">早年经典 (1987–2009)</button>
      <button class="maki-btn" onclick="jumpBank({coreOnly:true})">只看 985 严选母题</button>
    </div>
  `;
}

function renderSubjectLecture(subjKey) {
  const subj = state.notes.subjects.find((s) => s.key === subjKey);
  if (!subj) return "";
  const ch = subj.chapters[Math.min(state.chapIdx, subj.chapters.length - 1)];

  return `
    <div class="maki-panel" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="margin:0;font-size:18px;">${escHtml(ch.name)}</h2>
        <div class="stat-lbl">${escHtml(ch.badge)}</div>
      </div>
      <button class="maki-btn" onclick="jumpBank({subj:'${subjKey}'})">在题库中查看全部 ${subjKey} →</button>
    </div>

    ${ch.knowledge.map((k, ki) => {
      const mKey = `k:${subjKey}:${ch.name}:${ki}`;
      const done = state.mastered.has(mKey);
      return `
        <div class="callout ${ki % 2 === 0 ? "blue" : "purple"}">
          <div class="callout-head">
            <span class="callout-tag">${ki % 2 === 0 ? "定理 / 公式" : "定义 / 通法"} · ${escHtml(k.title)}</span>
            <button class="maki-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}')">${done ? "✓ 已掌握" : "标记此知识点为已掌握"}</button>
          </div>
          <div class="chain-line">前置 → 后续：${escHtml(k.chain)}</div>
          <div>${escHtml(k.content)}</div>
        </div>
      `;
    }).join("")}

    <div class="callout orange">
      <div class="callout-head"><span class="callout-tag">提醒 / 易错边界</span></div>
      <ul style="margin:0;padding-left:18px;">${ch.pitfalls.map((p) => `<li>${escHtml(p)}</li>`).join("")}</ul>
    </div>

    <div class="maki-panel">
      <div style="font-weight:700;margin-bottom:10px;">🎯 对应真题演练（点击行打开 Maki 详情弹窗，支持上一题 / 下一题）</div>
      <div class="q-list">
        ${ch.cases.map((c, idx) => {
          const rawQ = state.exams.find((x) => x.id === c.id);
          return `
            <div class="q-row" onclick="openCaseModal('${subjKey}', ${state.chapIdx}, ${idx})">
              <span class="q-doc-icon">📄</span>
              <span class="q-row-id">#${c.id}</span>
              <span class="q-row-src">${escHtml(c.src)}</span>
              <span class="q-row-preview">${escHtml(c.title)}${rawQ ? " — " + escHtml(rawQ.q.slice(0, 60)) : ""}</span>
              <span class="q-row-diff">难度 ${c.stars} / 5</span>
            </div>
          `;
        }).join("")}
      </div>
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
  const start = (state.page - 1) * state.pageSize;
  const slice = list.slice(start, start + state.pageSize);
  window._lastBankList = list;

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
      <label style="font-size:12.5px;display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" ${state.filters.coreOnly?"checked":""} onchange="onFilter('coreOnly', this.checked)" style="min-width:auto;" /> 985严选
      </label>
      <span class="pill-badge">匹配 ${list.length} 题</span>
    </div>

    <div class="q-list">
      ${slice.map((r, i) => `
        <div class="q-row" onclick="openBankModal(${start + i})">
          <span class="q-doc-icon">📄</span>
          <span class="q-row-id">#${r.id}</span>
          <span class="q-row-src">${escHtml(r.s)}</span>
          <span class="q-row-preview">${escHtml(r.q.replace(/\s+/g, " ").slice(0, 90))}</span>
          <span class="q-row-diff">${r.c ? "★ 严选" : escHtml(r.ch)}</span>
        </div>
      `).join("")}
    </div>

    <div class="pagination">
      <button class="maki-btn" ${state.page<=1?"disabled":""} onclick="goPage(${state.page-1})">上一页</button>
      <span style="font-size:13px;color:var(--muted);">第 ${state.page} / ${totalPages} 页</span>
      <button class="maki-btn" ${state.page>=totalPages?"disabled":""} onclick="goPage(${state.page+1})">下一页</button>
    </div>
  `;
}

function renderModal() {
  const item = state.modalList[state.modalIndex];
  if (!item) return;
  const raw = item.raw || item;
  const caseNote = item.caseNote || null;
  const mKey = `q:${raw.id}`;
  const done = state.mastered.has(mKey);

  document.getElementById("mTitle").textContent = `题目详情 · #${raw.id}`;
  document.getElementById("mStars").textContent = caseNote ? "★".repeat(caseNote.stars) + "☆".repeat(5 - caseNote.stars) : (raw.c ? "★★★★☆ (985严选)" : "");
  document.getElementById("mFootInfo").textContent = `${state.modalIndex + 1} / ${state.modalList.length}`;
  document.getElementById("mPrevBtn").disabled = state.modalIndex <= 0;
  document.getElementById("mNextBtn").disabled = state.modalIndex >= state.modalList.length - 1;

  const body = document.getElementById("mBody");
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
      <div>
        <span class="pill-badge">${escHtml(raw.s)}</span>
        <span class="pill-badge purple">${escHtml(raw.subj)} / ${escHtml(raw.ch)} / ${escHtml(raw.sub)}</span>
        ${raw.c ? '<span class="pill-badge orange">985严选</span>' : ""}
      </div>
      <button class="maki-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}')">${done ? "✓ 已掌握" : "标记已掌握"}</button>
    </div>

    <div style="font-size:15px;margin:10px 0;overflow-x:auto;">${escHtml(raw.q)}</div>
    ${raw.o && raw.o.length ? `<div class="q-opts">${raw.o.map((o) => `<div class="q-opt">${escHtml(o)}</div>`).join("")}</div>` : ""}

    ${caseNote ? `
      <div class="acc-item">
        <div class="acc-head"><span class="dot purple"></span> 考点与命题核心</div>
        <div class="acc-body">${escHtml(caseNote.title)}</div>
      </div>
      <div class="acc-item">
        <div class="acc-head"><span class="dot blue"></span> 最优解与详解</div>
        <div class="acc-body">${escHtml(caseNote.optimal)}</div>
      </div>
      <div class="acc-item">
        <div class="acc-head"><span class="dot teal"></span> 结论与同类题手法共通</div>
        <div class="acc-body">${escHtml(caseNote.common)}</div>
      </div>
    ` : ""}

    <div class="acc-item">
      <div class="acc-head"><span class="dot orange"></span> 原题答案与完整解析</div>
      <div class="acc-body">
        <div><strong>答案：</strong>${escHtml(raw.a)}</div>
        <div style="margin-top:8px;">${escHtml(raw.x).replace(/\n/g, "<br/>")}</div>
      </div>
    </div>
  `;
  renderMathInEl(body);
  document.getElementById("qModalBackdrop").classList.remove("hidden");
}

window.openCaseModal = (subjKey, chapIdx, caseIdx) => {
  const subj = state.notes.subjects.find((s) => s.key === subjKey);
  const ch = subj.chapters[chapIdx];
  state.modalList = ch.cases.map((c) => ({
    raw: state.exams.find((x) => x.id === c.id) || { id: c.id, s: c.src, subj: subjKey, ch: ch.name, sub: "", q: c.title, o: [], a: "", x: "" },
    caseNote: c,
  }));
  state.modalIndex = caseIdx;
  renderModal();
};

window.openBankModal = (idx) => {
  state.modalList = (window._lastBankList || []).map((r) => ({ raw: r, caseNote: null }));
  state.modalIndex = idx;
  renderModal();
};

function render() {
  const root = document.getElementById("appRoot");
  if (!state.notes) return;
  const activeId = document.activeElement && document.activeElement.id;
  const selStart = activeId === "searchInput" ? document.activeElement.selectionStart : null;

  updateRail();
  updateBreadcrumb();

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
window.toggleMastered = toggleMastered;
window.onFilter = (k, v) => { state.filters[k] = v; state.page = 1; render(); };
window.onSearch = (v) => { state.filters.q = v; state.page = 1; render(); };
window.goPage = (p) => { state.page = p; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
window.jumpBank = (opts) => {
  state.tab = "bank";
  state.filters = { q: "", exam: "all", era: "all", subj: "all", chap: "all", coreOnly: false, ...opts };
  state.page = 1;
  render();
  setTimeout(() => { const inp = document.getElementById("searchInput"); if (inp) inp.focus(); }, 30);
};

document.getElementById("railNav").addEventListener("click", (e) => {
  const btn = e.target.closest(".rail-item");
  if (!btn) return;
  state.tab = btn.dataset.tab;
  state.chapIdx = 0;
  render();
});

document.getElementById("quickSearchBtn").addEventListener("click", () => jumpBank({}));
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    jumpBank({});
  } else if (e.key === "Escape") {
    document.getElementById("qModalBackdrop").classList.add("hidden");
  }
});

document.getElementById("mCloseBtn").addEventListener("click", () => document.getElementById("qModalBackdrop").classList.add("hidden"));
document.getElementById("qModalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "qModalBackdrop") e.target.classList.add("hidden");
});
document.getElementById("mPrevBtn").addEventListener("click", () => { if (state.modalIndex > 0) { state.modalIndex--; renderModal(); } });
document.getElementById("mNextBtn").addEventListener("click", () => { if (state.modalIndex < state.modalList.length - 1) { state.modalIndex++; renderModal(); } });

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
