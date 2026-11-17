const state = {
  tab: "高等数学",
  chapIdx: 0,
  globalExam: "all",
  globalEra: "recent",
  notes: null,
  exams: [],
  kmap: [],
  deepMap: {},
  mastered: new Set(JSON.parse(localStorage.getItem("fp_mastered_v1") || "[]")),
  filters: { q: "", exam: "all", era: "all", subj: "all", chap: "all", coreOnly: false },
  kmFilter: { q: "", status: "all", exam: 0 },
  kmZoom: 0.72,
  kmPan: { x: 10, y: 10 },
  kmHighlight: null, // { key, prereqKeys: Set, succKeys: Set }
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

function renderMathMarkdown(content, questionId) {
  if (!content) return "";
  let str = String(content);

  // 0. Promote multiline single-$ blocks containing \begin{...} (without crossing other $) to $$...$$
  str = str.replace(/(?<!\$)\$(?!\$)([^\$]*?\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}[^\$]*?)(?<!\$)\$(?!\$)/g, (_, inner) => `$$${inner}$$`);

  // 1. Render block math $$...$$ and \[...\] first
  const blocks = [];
  str = str.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (full, m1, m2) => {
    const math = (m1 !== undefined ? m1 : m2).trim();
    try {
      const rendered = typeof katex !== "undefined"
        ? katex.renderToString(math, { displayMode: true, throwOnError: false, strict: false })
        : `$$${math}$$`;
      const idx = blocks.length;
      blocks.push(rendered);
      return `@@BLOCK_${idx}@@`;
    } catch {
      return full;
    }
  });

  // 2. Render inline math $...$ and \(...\)
  const inlines = [];
  str = str.replace(/\$([^\$\n]+?)\$|\\\(([\s\S]*?)\\\)/g, (full, m1, m2) => {
    const math = (m1 !== undefined ? m1 : m2).trim();
    try {
      const rendered = typeof katex !== "undefined"
        ? katex.renderToString(math, { displayMode: false, throwOnError: false, strict: false })
        : `$${math}$`;
      const idx = inlines.length;
      inlines.push(rendered);
      return `@@INLINE_${idx}@@`;
    } catch {
      return full;
    }
  });

  // 3. Handle Markdown images ![alt](url) including asset://sha256/...
  const images = [];
  str = str.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, url) => {
    let cleanUrl = url.trim();
    const idx = images.length;
    const safeAlt = (alt || "题图").replace(/"/g, "&quot;");
    const shaMatch = cleanUrl.match(/^asset:\/\/sha256\/([0-9a-f]{64})$/i);
    if (shaMatch && questionId) {
      cleanUrl = `https://cxyonly.fans/api/v1/questions/${questionId}/assets/${shaMatch[1]}`;
    }
    if (/^(https?:\/\/|\.\/|\/)/.test(cleanUrl)) {
      images.push(`<img src="${cleanUrl}" alt="${safeAlt}" referrerpolicy="no-referrer" loading="lazy" style="max-width:100%;max-height:320px;border-radius:8px;border:1px solid var(--border);background:#fff;padding:4px;margin:6px 0;display:block;" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-block';" /><span class="pill-badge" style="display:none;">🖼️ ${escHtml(safeAlt)}</span>`);
    } else {
      images.push(`<span class="pill-badge">🖼️ ${escHtml(safeAlt)}</span>`);
    }
    return `@@IMAGE_${idx}@@`;
  });

  // 4. Escape remaining HTML safely and convert basic Markdown
  str = escHtml(str);
  str = str.replace(/^### (.*?)$/gm, '<div style="font-weight:700;margin:10px 0 4px;color:var(--blue);">$1</div>');
  str = str.replace(/^#### (.*?)$/gm, '<div style="font-weight:600;margin:8px 0 4px;">$1</div>');
  str = str.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  str = str.replace(/\n\n/g, '<div style="height:8px;"></div>');
  str = str.replace(/\n/g, "<br/>");

  // 5. Restore placeholders
  str = str.replace(/@@BLOCK_(\d+)@@/g, (_, idx) => `<div class="katex-display">${blocks[Number(idx)]}</div>`);
  str = str.replace(/@@INLINE_(\d+)@@/g, (_, idx) => inlines[Number(idx)]);
  str = str.replace(/@@IMAGE_(\d+)@@/g, (_, idx) => images[Number(idx)]);
  return str;
}

function renderMathInEl(el) {
  // Handled inline via renderMathMarkdown; keep as no-op for compatibility
}

function updateRail() {
  document.querySelectorAll(".rail-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
  const rc = document.getElementById("railChapters");
  if (!state.notes || state.tab === "overview" || state.tab === "bank" || state.tab === "knowledge") {
    rc.innerHTML = "";
    return;
  }
  const subj = state.notes.subjects.find((s) => s.key === state.tab);
  if (!subj) { rc.innerHTML = ""; return; }
  rc.innerHTML = `
    <div class="rail-section-label">${escHtml(subj.key)} · 章节</div>
    ${subj.chapters.map((c, i) => {
      const deep = state.deepMap[`${subj.key}::${c.name}`];
      return `
        <button class="rail-chap-btn ${i === state.chapIdx ? "active" : ""}" onclick="selectChap(${i})">${escHtml(c.name)}</button>
        ${i === state.chapIdx && deep ? `
          <div style="padding-left:10px;margin:2px 0 6px;border-left:2px solid var(--border);">
            ${deep.families.map((fam, fi) => `
              <button class="rail-chap-btn" style="font-size:11.5px;padding:4px 8px;color:var(--muted);" onclick="scrollToFamily(${fi})">${escHtml(fam.name.split("（")[0])}</button>
            `).join("")}
          </div>
        ` : ""}
      `;
    }).join("")}
  `;
}

function updateBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  if (state.tab === "knowledge") bc.textContent = "APP / 知识库 / 考研数学知识地图";
  else if (state.tab === "overview") bc.textContent = "APP / 全局总览";
  else if (state.tab === "bank") bc.textContent = "APP / 题库 / 1987–2026 历年真题";
  else if (state.notes) {
    const subj = state.notes.subjects.find((s) => s.key === state.tab);
    const ch = subj && subj.chapters[state.chapIdx];
    bc.textContent = `APP / 复盘讲义 / ${state.tab}${ch ? " / " + ch.name : ""}`;
  }
}

function getAllKnowledgeNodes() {
  const list = [];
  for (const subj of state.kmap || []) {
    for (const ch of subj.chapters) {
      for (const n of ch.nodes) {
        list.push({ key: `km:${n.id}`, subjKey: subj.key, ch, n });
      }
    }
  }
  return list;
}

function renderKnowledgeMap() {
  const allNodes = getAllKnowledgeNodes();
  const masteredNodes = allNodes.filter((x) => state.mastered.has(x.key)).length;
  const kw = state.kmFilter.q.trim().toLowerCase();
  const st = state.kmFilter.status;
  const ex = state.kmFilter.exam;
  const hl = state.kmHighlight;

  return `
    <div class="km-toolbar">
      <div class="km-controls">
        <input id="kmSearchInput" placeholder="搜索 387 个考点标题或编号(C01.01)..." value="${escHtml(state.kmFilter.q)}" oninput="onKmSearch(this.value)" style="border:1px solid var(--border);background:var(--surface-subtle);color:var(--text);border-radius:6px;padding:5px 10px;font-size:13px;min-width:210px;" />
        <select onchange="onKmExam(Number(this.value))" style="border:1px solid var(--border);background:var(--surface-subtle);color:var(--text);border-radius:6px;padding:5px 8px;font-size:13px;">
          <option value="0" ${ex===0?"selected":""}>全部考种</option>
          <option value="1" ${ex===1?"selected":""}>数学一</option>
          <option value="2" ${ex===2?"selected":""}>数学二</option>
          <option value="3" ${ex===3?"selected":""}>数学三</option>
        </select>
        <select onchange="onKmStatus(this.value)" style="border:1px solid var(--border);background:var(--surface-subtle);color:var(--text);border-radius:6px;padding:5px 8px;font-size:13px;">
          <option value="all" ${st==="all"?"selected":""}>全部节点 (${allNodes.length})</option>
          <option value="unmastered" ${st==="unmastered"?"selected":""}>未掌握 (${allNodes.length - masteredNodes})</option>
          <option value="mastered" ${st==="mastered"?"selected":""}>已掌握 (${masteredNodes})</option>
        </select>
        <span class="pill-badge" style="margin:0;">已掌握 ${masteredNodes} / ${allNodes.length}</span>
        ${hl ? `<button class="maki-btn" onclick="clearKmHighlight()">清除引用高亮</button>` : ""}
      </div>
      <div class="km-controls">
        <div class="km-legend">
          <span><i class="lg-dot unmastered"></i>未掌握</span>
          <span><i class="lg-dot mastered"></i>已掌握</span>
          <span><i class="lg-dot prereq"></i>前置</span>
          <span><i class="lg-dot succ"></i>后续</span>
        </div>
        <button class="maki-btn" onclick="zoomKm(-0.1)">-</button>
        <span style="font-size:12px;color:var(--muted);min-width:38px;text-align:center;">${Math.round(state.kmZoom * 100)}%</span>
        <button class="maki-btn" onclick="zoomKm(0.1)">+</button>
        <button class="maki-btn" onclick="resetKmView()">全览</button>
      </div>
    </div>

    <div class="km-viewport" id="kmViewport">
      <div class="km-canvas" id="kmCanvas" style="transform: translate(${state.kmPan.x}px, ${state.kmPan.y}px) scale(${state.kmZoom});">
        ${state.kmap.map((subj) => {
          const subjTotal = subj.chapters.reduce((acc, c) => acc + c.nodes.length, 0);
          return `
            <div class="km-partition">
              <div class="km-part-head">
                <span>${escHtml(subj.key)} · 分区</span>
                <span class="stat-lbl">${subj.chapters.length} 章 · ${subjTotal} 个知识点</span>
              </div>
              <div class="km-subgrid">
                ${subj.chapters.map((ch) => {
                  const nodes = ch.nodes.filter((n) => {
                    const key = `km:${n.id}`;
                    const isM = state.mastered.has(key);
                    if (ex && !(n.ex || []).includes(ex)) return false;
                    if (st === "mastered" && !isM) return false;
                    if (st === "unmastered" && isM) return false;
                    if (kw && !(n.id + " " + n.name + " " + n.kw + " " + ch.name).toLowerCase().includes(kw)) return false;
                    return true;
                  });
                  if (nodes.length === 0) return "";
                  return `
                    <div class="km-subpart">
                      <div class="km-sub-head">
                        <span>${escHtml(ch.id)} ${escHtml(ch.name)}</span>
                        <span>${nodes.length} 考点</span>
                      </div>
                      <div class="km-nodes">
                        ${nodes.map((n) => {
                          const key = `km:${n.id}`;
                          const isM = state.mastered.has(key);
                          let cls = isM ? "mastered" : "";
                          if (hl && hl.prereqKeys.has(key)) cls += " prereq";
                          if (hl && hl.succKeys.has(key)) cls += " succ";
                          return `
                            <button class="km-node ${cls}" onclick="openAtomKnowledgeModal('${subj.key}', '${ch.id}', '${n.id}')">
                              <div>${escHtml(n.name)}</div>
                              <div class="km-node-meta">${escHtml(n.id)} · ${n.qc ? n.qc + " 真题" : (n.kw || "核心概念")}</div>
                            </button>
                          `;
                        }).join("")}
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
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

function renderDeepChapter(deep) {
  const exFilter = state.globalExam;
  const eraFilter = state.globalEra;
  const matchQ = (q) => (exFilter === "all" || q.exams.includes(exFilter)) && (eraFilter === "all" || q.era === eraFilter);
  const allCount = deep.families.reduce((acc, fam) => acc + fam.questions.filter(matchQ).length, 0);

  return `
    <div class="maki-panel" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="margin:0;font-size:18px;">${escHtml(deep.subject)} · ${escHtml(deep.chapter)}（逐题精讲讲义）</h2>
        <div class="stat-lbl">${escHtml(deep.subtitle)} · 当前筛选共 ${allCount} 道独立母题</div>
      </div>
      <button class="maki-btn" onclick="jumpBank({subj:'${deep.subject}', chap:'${deep.chapter}', era:'${eraFilter}'})">在题库中查看本章全部真题 →</button>
    </div>

    <div class="maki-panel" style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:12.5px;font-weight:700;color:var(--muted);">📑 题型族快捷跳转：</span>
      ${deep.families.map((fam, fi) => {
        const cnt = fam.questions.filter(matchQ).length;
        if (cnt === 0) return "";
        return `<button class="maki-btn" onclick="scrollToFamily(${fi})">${escHtml(fam.name.split("（")[0])} (${cnt})</button>`;
      }).join("")}
    </div>

    ${deep.families.map((fam, fi) => {
      const qs = fam.questions.filter(matchQ);
      if (qs.length === 0) return "";
      const mKey = `fam:${deep.chapter}:${fi}`;
      const done = state.mastered.has(mKey);
      return `
        <div class="maki-panel" id="fam-${fi}" style="scroll-margin-top:68px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <h3 style="margin:0;font-size:16px;">${escHtml(fam.name)}</h3>
            <span class="pill-badge" style="margin:0;">${qs.length} 道近十年真题</span>
          </div>

          <div class="callout ${fi % 2 === 0 ? "blue" : "purple"}">
            <div class="callout-head">
              <span class="callout-tag">定理 / 公式 · ${escHtml(fam.knowledge.title)}</span>
              <button class="maki-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}')">${done ? "✓ 已掌握本节" : "标记本节为已掌握"}</button>
            </div>
            <div class="chain-line">前置 → 后续：${escHtml(fam.knowledge.chain)}</div>
            <div>${renderMathMarkdown(fam.knowledge.content)}</div>
          </div>

          <div class="callout orange">
            <div class="callout-head"><span class="callout-tag">提醒 / 本节易错边界</span></div>
            <ul style="margin:0;padding-left:18px;">${fam.pitfalls.map((p) => `<li>${renderMathMarkdown(p)}</li>`).join("")}</ul>
          </div>

          <div style="font-weight:700;margin:14px 0 10px;">🎯 同类真题逐题精讲（按「同构手法对照组」紧邻排列，先看最优解再对照原站解析）</div>
          ${qs.map((q, qi) => {
            const raw = state.exams.find((r) => r.id === q.id);
            const qKey = `q:${q.id}`;
            const qDone = state.mastered.has(qKey);
            const showGroupHeader = q.group && (qi === 0 || qs[qi - 1].group !== q.group);
            return `
              ${showGroupHeader ? `<div style="margin:14px 0 8px;padding:6px 10px;border-radius:6px;background:var(--surface-subtle);border-left:3px solid var(--teal);font-size:13px;font-weight:700;color:var(--teal);">🔀 ${escHtml(q.group)}</div>` : ""}
              <div class="deep-q-card">
                <div class="deep-q-head">
                  <span class="pill-badge" style="margin:0;">#${q.id}</span>
                  <span class="pill-badge purple" style="margin:0;">${escHtml(q.badge)}</span>
                  <span class="modal-stars">${"★".repeat(q.stars)}${"☆".repeat(5 - q.stars)}</span>
                  <span style="flex:1"></span>
                  <button class="maki-btn ${qDone ? "done" : ""}" onclick="toggleMastered('${qKey}')">${qDone ? "✓ 已复盘" : "标记已复盘"}</button>
                </div>

                ${raw ? `<div style="font-size:15px;margin:8px 0;overflow-x:auto;">${renderMathMarkdown(raw.q, raw.id)}</div>` : ""}
                ${raw && raw.o && raw.o.length ? `<div class="q-opts">${raw.o.map((o) => {
                  const lbl = typeof o === "object" && o !== null ? o.label : "";
                  const txt = typeof o === "object" && o !== null ? o.text : o;
                  return `<div class="q-opt">${lbl ? `<strong>${escHtml(lbl)}.</strong> ` : ""}${renderMathMarkdown(txt, raw.id)}</div>`;
                }).join("")}</div>` : ""}

                <div class="deep-grid">
                  <div class="deep-box kp"><strong>📌 考点：</strong>${renderMathMarkdown(q.kp, q.id)}</div>
                  <div class="deep-box opt"><strong>⚡ 最优解 / 原解审查：</strong>${renderMathMarkdown(q.opt, q.id)}</div>
                  <div class="deep-box common"><strong>🔗 手法与同类题共通之处：</strong>${renderMathMarkdown(q.common, q.id)}</div>
                  <div class="deep-box pit"><strong>⚠️ 本题易错点：</strong>${renderMathMarkdown(q.pitfall, q.id)}</div>
                </div>

                ${raw ? `
                  <details style="margin-top:8px;">
                    <summary style="cursor:pointer;font-size:12.5px;color:var(--muted);font-weight:600;">展开原题答案与原站解析对照</summary>
                    <div class="acc-body" style="margin-top:6px;border:1px solid var(--border);border-radius:8px;background:var(--surface-subtle);">
                      <div><strong>原题答案：</strong>${renderMathMarkdown(raw.a, raw.id)}</div>
                      <div style="margin-top:6px;">${renderMathMarkdown(raw.x, raw.id)}</div>
                    </div>
                  </details>
                ` : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }).join("")}
  `;
}

function renderSubjectLecture(subjKey) {
  const subj = state.notes.subjects.find((s) => s.key === subjKey);
  if (!subj) return "";
  const ch = subj.chapters[Math.min(state.chapIdx, subj.chapters.length - 1)];

  const deep = state.deepMap[`${subjKey}::${ch.name}`];
  if (deep) {
    return renderDeepChapter(deep);
  }

  // Group all real exam questions in this chapter by subtopic (r.sub)
  const chapExams = state.exams.filter((r) => r.subj === subjKey && r.ch === ch.name);
  const bySub = new Map();
  for (const r of chapExams) {
    const key = r.sub || ch.name;
    if (!bySub.has(key)) bySub.set(key, []);
    bySub.get(key).push(r);
  }
  const subEntries = [...bySub.entries()].sort((a, b) => b[1].length - a[1].length);
  window._chapSubList = subEntries.map((e) => e[1]);

  return `
    <div class="maki-panel" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="margin:0;font-size:18px;">${escHtml(ch.name)}</h2>
        <div class="stat-lbl">${escHtml(ch.badge)} · 本章共 ${chapExams.length} 道真题</div>
      </div>
      <button class="maki-btn" onclick="jumpBank({subj:'${subjKey}', chap:'${escHtml(ch.name)}'})">在题库中筛选本章 (${chapExams.length}题) →</button>
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
          <div>${renderMathMarkdown(k.content)}</div>
        </div>
      `;
    }).join("")}

    <div class="callout orange">
      <div class="callout-head"><span class="callout-tag">提醒 / 易错边界</span></div>
      <ul style="margin:0;padding-left:18px;">${ch.pitfalls.map((p) => `<li>${renderMathMarkdown(p)}</li>`).join("")}</ul>
    </div>

    <div class="maki-panel">
      <div style="font-weight:700;margin-bottom:10px;">🎯 典型真题详解、最优解替换与手法共通（点击打开弹窗）</div>
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

    <div class="maki-panel">
      <div style="font-weight:700;margin-bottom:10px;">📚 本章全量真题按细分考点分类（1987–2026 共 ${chapExams.length} 题 · 点击任意题目复盘）</div>
      ${subEntries.map(([subName, items], subIdx) => `
        <details class="acc-item" ${subEntries.length <= 4 ? "open" : ""}>
          <summary class="acc-head" style="list-style:none;">
            <span class="dot teal"></span>
            <span style="flex:1">${escHtml(subName)}</span>
            <span class="pill-badge" style="margin:0">${items.length} 题</span>
          </summary>
          <div class="q-list" style="border:none;border-top:1px solid var(--border);border-radius:0;">
            ${items.map((r, idx) => `
              <div class="q-row" onclick="openSubGroupModal(${subIdx}, ${idx})">
                <span class="q-doc-icon">📄</span>
                <span class="q-row-id">#${r.id}</span>
                <span class="q-row-src">${escHtml(r.s)}</span>
                <span class="q-row-preview">${escHtml(r.q.replace(/\s+/g, " ").slice(0, 80))}</span>
                <span class="q-row-diff">${r.c ? "★ 严选" : (state.mastered.has("q:" + r.id) ? "✓" : "")}</span>
              </div>
            `).join("")}
          </div>
        </details>
      `).join("")}
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

    <div style="font-size:15px;margin:10px 0;overflow-x:auto;">${renderMathMarkdown(raw.q, raw.id)}</div>
    ${raw.o && raw.o.length ? `<div class="q-opts">${raw.o.map((o) => {
      const lbl = typeof o === "object" && o !== null ? o.label : "";
      const txt = typeof o === "object" && o !== null ? o.text : o;
      return `<div class="q-opt">${lbl ? `<strong>${escHtml(lbl)}.</strong> ` : ""}${renderMathMarkdown(txt, raw.id)}</div>`;
    }).join("")}</div>` : ""}

    ${caseNote ? `
      <div class="acc-item">
        <div class="acc-head"><span class="dot purple"></span> 考点与命题核心</div>
        <div class="acc-body">${renderMathMarkdown(caseNote.title, raw.id)}</div>
      </div>
      <div class="acc-item">
        <div class="acc-head"><span class="dot blue"></span> 最优解与详解</div>
        <div class="acc-body">${renderMathMarkdown(caseNote.optimal, raw.id)}</div>
      </div>
      <div class="acc-item">
        <div class="acc-head"><span class="dot teal"></span> 结论与同类题手法共通</div>
        <div class="acc-body">${renderMathMarkdown(caseNote.common, raw.id)}</div>
      </div>
    ` : ""}

    <div class="acc-item">
      <div class="acc-head"><span class="dot orange"></span> 原题答案与完整解析</div>
      <div class="acc-body">
        <div><strong>答案：</strong>${renderMathMarkdown(raw.a, raw.id)}</div>
        <div style="margin-top:8px;">${renderMathMarkdown(raw.x, raw.id)}</div>
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

window.openSubGroupModal = (subIdx, idx) => {
  const items = (window._chapSubList && window._chapSubList[subIdx]) || [];
  state.modalList = items.map((r) => ({ raw: r, caseNote: null }));
  state.modalIndex = idx;
  renderModal();
};

window.openAtomKnowledgeModal = (subjKey, chapId, nodeId) => {
  const subjTree = state.kmap.find((t) => t.key === subjKey);
  const kCh = subjTree && subjTree.chapters.find((c) => c.id === chapId);
  const node = kCh && kCh.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  const noteSubj = state.notes.subjects.find((s) => s.key === subjKey);
  const noteChapIdx = noteSubj ? noteSubj.chapters.findIndex((c) => c.name === kCh.noteChap) : -1;
  const noteCh = noteChapIdx >= 0 ? noteSubj.chapters[noteChapIdx] : null;

  const mKey = `km:${node.id}`;
  const done = state.mastered.has(mKey);
  const examTags = (node.ex || []).map((e) => `数${["一","二","三"][e-1]}`).join(" / ");

  // Collect matched real-exam questions (or fallback by keyword in this subject)
  let matched = (node.qids || []).map((id) => state.exams.find((r) => r.id === id)).filter(Boolean);
  if (matched.length === 0 && node.kw) {
    const kw = node.kw.toLowerCase();
    matched = state.exams.filter((r) => r.subj === subjKey && (r.q + " " + r.sub).toLowerCase().includes(kw)).slice(0, 15);
  }
  window._atomModalList = matched;

  state.modalIndex = -1;
  document.getElementById("mTitle").textContent = `${node.id} · ${node.name}`;
  document.getElementById("mStars").textContent = examTags;
  document.getElementById("mFootInfo").textContent = `关联真题 ${matched.length} 题`;
  document.getElementById("mPrevBtn").disabled = true;
  document.getElementById("mNextBtn").disabled = true;

  const body = document.getElementById("mBody");
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
      <div>
        <span class="pill-badge">${escHtml(subjKey)} / ${escHtml(kCh.name)}</span>
        <span class="pill-badge purple">${done ? "已掌握" : "未掌握 · 保存在本浏览器"}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="maki-btn" onclick="highlightAtomRelations('${subjKey}', '${chapId}', '${nodeId}')">查看引用关系</button>
        <button class="maki-btn ${done ? "done" : ""}" onclick="toggleMastered('${mKey}'); openAtomKnowledgeModal('${subjKey}', '${chapId}', '${nodeId}');">${done ? "✓ 已掌握" : "标记为已掌握"}</button>
        ${noteChapIdx >= 0 ? `<button class="maki-btn" onclick="enterChapterLecture('${subjKey}', ${noteChapIdx})">进入本章讲义 →</button>` : ""}
      </div>
    </div>

    ${noteCh ? noteCh.knowledge.map((k) => `
      <div class="callout blue">
        <div class="callout-head"><span class="callout-tag">章节核心 · ${escHtml(k.title)}</span></div>
        <div class="chain-line">前置 → 后续：${escHtml(k.chain)}</div>
        <div>${renderMathMarkdown(k.content)}</div>
      </div>
    `).join("") : ""}

    ${noteCh ? `
      <div class="callout orange">
        <div class="callout-head"><span class="callout-tag">提醒 / 易错边界</span></div>
        <ul style="margin:0;padding-left:18px;">${noteCh.pitfalls.map((p) => `<li>${renderMathMarkdown(p)}</li>`).join("")}</ul>
      </div>
    ` : ""}

    <div style="font-weight:700;margin:12px 0 8px;">🎯 关联真题演练（${matched.length} 题 · 点击进入完整解析与最优解）</div>
    <div class="q-list">
      ${matched.length ? matched.map((r, idx) => `
        <div class="q-row" onclick="openAtomExamModal(${idx})">
          <span class="q-doc-icon">📄</span>
          <span class="q-row-id">#${r.id}</span>
          <span class="q-row-src">${escHtml(r.s)}</span>
          <span class="q-row-preview">${escHtml(r.q.replace(/\s+/g, " ").slice(0, 75))}</span>
          <span class="q-row-diff">${r.c ? "★ 严选" : escHtml(r.ch)}</span>
        </div>
      `).join("") : `<div style="padding:14px;color:var(--muted);font-size:13px;">本考点暂无直接绑定真题，可点击「进入本章讲义」查看本章全部真题。</div>`}
    </div>
  `;
  document.getElementById("qModalBackdrop").classList.remove("hidden");
};

window.openAtomExamModal = (idx) => {
  state.modalList = (window._atomModalList || []).map((r) => ({ raw: r, caseNote: null }));
  state.modalIndex = idx;
  renderModal();
};

window.highlightAtomRelations = (subjKey, chapId, nodeId) => {
  const subjTree = state.kmap.find((t) => t.key === subjKey);
  const cIdx = subjTree.chapters.findIndex((c) => c.id === chapId);
  const ch = subjTree.chapters[cIdx];
  const nIdx = ch.nodes.findIndex((n) => n.id === nodeId);
  const prereqKeys = new Set();
  const succKeys = new Set();
  ch.nodes.forEach((n, i) => {
    if (i < nIdx) prereqKeys.add(`km:${n.id}`);
    else if (i > nIdx) succKeys.add(`km:${n.id}`);
  });
  if (cIdx > 0) subjTree.chapters[cIdx - 1].nodes.forEach((n) => prereqKeys.add(`km:${n.id}`));
  if (cIdx + 1 < subjTree.chapters.length) subjTree.chapters[cIdx + 1].nodes.forEach((n) => succKeys.add(`km:${n.id}`));
  state.kmHighlight = { key: `km:${nodeId}`, prereqKeys, succKeys };
  document.getElementById("qModalBackdrop").classList.add("hidden");
  render();
};

window.onKmExam = (v) => { state.kmFilter.exam = v; render(); };

window.highlightRelations = (subjKey, chapIdx, kIdx) => {
  const subj = state.notes.subjects.find((s) => s.key === subjKey);
  const ch = subj.chapters[chapIdx];
  const curKey = `k:${subjKey}:${ch.name}:${kIdx}`;
  const prereqKeys = new Set();
  const succKeys = new Set();
  ch.knowledge.forEach((_, i) => {
    const key = `k:${subjKey}:${ch.name}:${i}`;
    if (i < kIdx) prereqKeys.add(key);
    else if (i > kIdx) succKeys.add(key);
  });
  if (chapIdx > 0) {
    const prevCh = subj.chapters[chapIdx - 1];
    prevCh.knowledge.forEach((_, i) => prereqKeys.add(`k:${subjKey}:${prevCh.name}:${i}`));
  }
  if (chapIdx + 1 < subj.chapters.length) {
    const nextCh = subj.chapters[chapIdx + 1];
    nextCh.knowledge.forEach((_, i) => succKeys.add(`k:${subjKey}:${nextCh.name}:${i}`));
  }
  state.kmHighlight = { key: curKey, prereqKeys, succKeys };
  document.getElementById("qModalBackdrop").classList.add("hidden");
  render();
};

window.clearKmHighlight = () => { state.kmHighlight = null; render(); };
window.enterChapterLecture = (subjKey, chapIdx) => {
  document.getElementById("qModalBackdrop").classList.add("hidden");
  state.tab = subjKey;
  state.chapIdx = chapIdx;
  render();
};
window.onKmSearch = (v) => { state.kmFilter.q = v; render(); };
window.onKmStatus = (v) => { state.kmFilter.status = v; render(); };
window.zoomKm = (delta) => { state.kmZoom = Math.min(1.5, Math.max(0.45, +(state.kmZoom + delta).toFixed(2))); render(); };
window.resetKmView = () => { state.kmZoom = 0.78; state.kmPan = { x: 10, y: 10 }; render(); };

function bindKmPanZoom() {
  const vp = document.getElementById("kmViewport");
  if (!vp) return;
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  vp.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    ox = state.kmPan.x; oy = state.kmPan.y;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    state.kmPan.x = ox + (e.clientX - sx);
    state.kmPan.y = oy + (e.clientY - sy);
    const cv = document.getElementById("kmCanvas");
    if (cv) cv.style.transform = `translate(${state.kmPan.x}px, ${state.kmPan.y}px) scale(${state.kmZoom})`;
  });
  window.addEventListener("mouseup", () => { dragging = false; });
  vp.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.zoomKm(e.deltaY < 0 ? 0.08 : -0.08);
    }
  }, { passive: false });
}

function render() {
  const root = document.getElementById("appRoot");
  if (!state.notes) return;
  const activeId = document.activeElement && document.activeElement.id;
  const selStart = (activeId === "searchInput" || activeId === "kmSearchInput") ? document.activeElement.selectionStart : null;

  updateRail();
  updateBreadcrumb();

  if (state.tab === "knowledge") {
    root.innerHTML = renderKnowledgeMap();
    bindKmPanZoom();
  } else if (state.tab === "overview") root.innerHTML = renderOverview();
  else if (state.tab === "bank") root.innerHTML = renderBank();
  else root.innerHTML = renderSubjectLecture(state.tab);
  renderMathInEl(root);

  if (activeId === "searchInput" || activeId === "kmSearchInput") {
    const inp = document.getElementById(activeId);
    if (inp) {
      inp.focus();
      if (selStart !== null) inp.setSelectionRange(selStart, selStart);
    }
  }
}

window.selectChap = (i) => { state.chapIdx = i; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
window.scrollToFamily = (fi) => {
  const el = document.getElementById(`fam-${fi}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};
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

document.getElementById("eraPills").addEventListener("click", (e) => {
  const btn = e.target.closest(".exam-pill");
  if (!btn) return;
  const era = btn.dataset.era;
  state.globalEra = era;
  state.filters.era = era;
  document.querySelectorAll("#eraPills .exam-pill").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

document.getElementById("examPills").addEventListener("click", (e) => {
  const btn = e.target.closest(".exam-pill");
  if (!btn) return;
  const ex = btn.dataset.exam;
  state.globalExam = ex;
  state.filters.exam = ex;
  state.kmFilter.exam = ex === "数一" ? 1 : (ex === "数二" ? 2 : (ex === "数三" ? 3 : 0));
  document.querySelectorAll("#examPills .exam-pill").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

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

if (window.__FP_NOTES__ && window.__FP_EXAMS__ && window.__FP_KMAP__) {
  state.notes = window.__FP_NOTES__;
  state.exams = window.__FP_EXAMS__;
  state.kmap = window.__FP_KMAP__;
  state.deepMap = window.__FP_DEEP_MAP__ || {};
  render();
} else {
  Promise.all([
    fetch("./data/review_notes.json").then((r) => r.json()),
    fetch("./data/real_exams.json").then((r) => r.json()),
    fetch("./data/knowledge_map.json").then((r) => r.json()),
    fetch("./data/deep_chapters.json").then((r) => r.json()).catch(() => ({})),
  ]).then(([notes, exams, kmap, deepMap]) => {
    state.notes = notes;
    state.exams = exams;
    state.kmap = kmap;
    state.deepMap = deepMap;
    render();
  }).catch((err) => {
    document.getElementById("appRoot").innerHTML = `<div class="loading-box">数据加载失败：${escHtml(err.message)}</div>`;
  });
}
