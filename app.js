(() => {
  "use strict";
  const CFG = window.APP_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const jaColl = new Intl.Collator("ja");
  const strokeColl = new Intl.Collator("zh-Hant-TW-u-co-stroke");
  const TYPE_LABEL = { female: "女歌手", male: "男歌手", band: "樂團／團體", other: "其他" };
  const NON_ANIME = "（非動漫歌曲）";

  let DB = { songs: [], ktvs: [] };
  const state = { tab: "all", q: "", filter: null, artistType: "female", animeSort: "kana", sort: "year", playlist: null };

  // ---------- 模糊搜尋 ----------
  const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  function norm(s) {
    return kata2hira(String(s || "").normalize("NFKC").toLowerCase())
      .normalize("NFKD").replace(/[̀-ͯ]/g, "") // 去掉 ō 等長音符號
      .normalize("NFC")
      .replace(/ou|oo/g, "o").replace(/uu/g, "u").replace(/ー/g, "")
      .replace(/[\s\-_~〜・.,!！?？'"’“”()（）【】\[\]/／:：―*]+/g, "");
  }
  function fuzzyScore(hay, q) {
    if (!q) return 1;
    const i = hay.indexOf(q);
    if (i >= 0) return 100 - Math.min(i, 50);
    if (q.length < 2) return 0;
    // 依序比對（允許中間有間隔），間隔越大分數越低
    let h = 0, start = -1, gaps = 0;
    for (const ch of q) {
      const j = hay.indexOf(ch, h);
      if (j < 0) return 0;
      if (start < 0) start = j; else gaps += j - h;
      h = j + 1;
    }
    return gaps > q.length * 2 ? 0 : 40 - gaps;
  }
  function search(songs, q) {
    const nq = norm(q);
    if (!nq) return songs;
    return songs
      .map((s) => {
        const best = Math.max(
          fuzzyScore(s._t, nq) + 10, // 歌名優先
          fuzzyScore(s._a, nq) + 5,
          fuzzyScore(s._o, nq)
        );
        return [best, s];
      })
      .filter(([sc]) => sc > 10)
      .sort((a, b) => b[0] - a[0])
      .map(([, s]) => s);
  }

  // ---------- 排序 ----------
  const animeKey = (s) => (s.anime ? s.animeJa + "|" + s.animeZh : NON_ANIME);
  const typeRank = (t) => {
    const m = /(OP|ED|插曲|電影|進化)/.exec(t || "");
    return [m ? ["OP", "ED", "插曲", "電影", "進化"].indexOf(m[1]) : 9, parseInt((t || "").replace(/\D+/g, "")) || 0];
  };
  const SORTS = {
    year: (a, b) => (b.year || 0) - (a.year || 0) || jaColl.compare(a.title, b.title),
    title: (a, b) => jaColl.compare(a.kanaSort || a.title, b.kanaSort || b.title),
    artist: (a, b) => jaColl.compare(a.artist, b.artist) || (a.year || 0) - (b.year || 0),
    animeKana: (a, b) => cmpAnime(a, b, "kana"),
    animeStroke: (a, b) => cmpAnime(a, b, "stroke"),
  };
  const zhKey = (t) => (t || "").replace(/^[【\[(（「]+/, "");
  function cmpAnime(a, b, mode) {
    if (!a.anime !== !b.anime) return a.anime ? -1 : 1;
    const c = mode === "kana" ? jaColl.compare(a.animeKana || a.animeJa, b.animeKana || b.animeJa) : strokeColl.compare(zhKey(a.animeZh), zhKey(b.animeZh));
    if (c) return c;
    const [ra, na] = typeRank(a.type), [rb, nb] = typeRank(b.type);
    return (a.year || 0) - (b.year || 0) || ra - rb || na - nb;
  }

  // ---------- 歌單（存在本機） ----------
  const LS = "ktv-anime-playlists";
  let playlists = [];
  try { playlists = JSON.parse(localStorage.getItem(LS)) || []; } catch { playlists = []; }
  if (!playlists.length) playlists = [{ id: "fav", name: "我的最愛", songs: [] }];
  const savePl = () => { try { localStorage.setItem(LS, JSON.stringify(playlists)); } catch {} };
  const inAnyPl = (id) => playlists.some((p) => p.songs.includes(id));

  // ---------- 畫面 ----------
  // 燈號：符號只給眼睛看，報讀時唸「凱悅：可點播」
  const LAMP = { 1: ["y", "on", "✓", "可點播"], 0: ["n", "off", "✕", "沒有"] };
  const ktvCell = (k, v, me) => {
    const [cls, lc, sym, word] = LAMP[v] || ["u", "unk", "?", "待確認"];
    return `<span class="ktv ${cls}${me ? " me" : ""}" title="${esc(k)}：${word}"><span class="lamp ${lc}" aria-hidden="true">${sym}</span>${esc(k)}<span class="sr">：${word}</span></span>`;
  };
  function card(s) {
    const kana = s.kana && s.kana !== s.title ? `<span class="kana" lang="ja">${esc(s.kana)}</span>` : "";
    const zh = s.zh ? `<span class="zh">${esc(s.zh)}</span>` : "";
    const anime = s.anime
      ? `<span class="anime">📺 <span lang="ja">${esc(s.animeJa)}</span>${s.animeZh && s.animeZh !== s.animeJa ? ` <span class="zhs">${esc(s.animeZh)}</span>` : ""}</span>`
      : `<span class="anime muted">🎵 <span lang="ja">アニメ以外</span> <span class="zhs">非動漫歌曲</span></span>`;
    return `<li class="card" data-id="${s.id}">
      <div class="r1"><b class="title" lang="ja">${esc(s.title)}</b>${kana}${zh}<a class="artist" href="#" data-artist="${esc(s.artist)}">🎙 ${esc(s.artist)}</a></div>
      <button class="heart ${inAnyPl(s.id) ? "on" : ""}" data-fav="${s.id}" aria-label="${inAnyPl(s.id) ? "已收藏，管理歌單" : "加入歌單"}">♥</button>
      <div class="r2">${anime}${s.type ? `<span class="tag">${esc(s.type)}</span>` : ""}${s.year ? `<span class="tag yr">${s.year}</span>` : ""}${/舞/.test(s.note) ? '<span class="badge dance">舞</span>' : ""}
        <button class="bug" data-bug="${s.id}" aria-label="回報這首歌的錯誤">🐞</button></div>
      <div class="r3" style="--n:${DB.known.length}">${ktvOrder().map((k) => ktvCell(k, s.ktv[k], k === prefs.where)).join("")}</div>
    </li>`;
  }

  // ---------- 我在哪家 KTV（全站狀態，存在 prefs.where；"" = 全部） ----------
  // 選了一家：✓ 列為可點、? 列為可能有、✕ 不顯示；歌單例外，✕ 集中放最後不藏
  const ktvOrder = () => (prefs.where ? [prefs.where, ...DB.known.filter((k) => k !== prefs.where)] : DB.known);
  const reachable = (s) => !prefs.where || s.ktv[prefs.where] !== 0;
  const pool = () => DB.songs.filter(reachable);
  function renderWhere() {
    const el = $("#where");
    if (!DB.known.length) { el.hidden = true; return; }
    const btn = (k, label, n) => `<button data-where="${esc(k)}" aria-pressed="${prefs.where === k}">${label}${n != null ? `<i>${n}</i>` : ""}</button>`;
    el.innerHTML = `<span class="wlabel" aria-hidden="true">我在</span>${btn("", "全部")}${DB.known.map((k) => btn(k, esc(k), DB.songs.filter((s) => s.ktv[k] === 1).length)).join("")}`;
    el.hidden = false;
  }

  function chips(items, active, attr) {
    return items.map(([v, label, n]) => `<button class="chip ${active === v ? "on" : ""}" data-${attr}="${esc(v)}">${label}${n != null ? `<i>${n}</i>` : ""}</button>`).join("");
  }
  function countBy(fn) {
    const m = new Map();
    for (const s of pool()) { const k = fn(s); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }
  const GOJUON = "あかさたなはまやらわ";
  const gyou = (k) => {
    const c = kata2hira((k || "").normalize("NFKC"))[0] || "";
    if (!/[ぁ-ゖ]/.test(c)) return "英數";
    const n = "ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをん".indexOf(c);
    const bounds = [0, 10, 20, 30, 41, 46, 61, 66, 72, 77];
    let i = bounds.length - 1; while (i > 0 && n < bounds[i]) i--;
    return GOJUON[i] + "行";
  };

  function renderFacet() {
    const el = $("#facet");
    let h = "";
    if (state.tab === "artist") {
      const cnt = countBy((s) => s.artist);
      const typeOf = new Map(DB.songs.map((s) => [s.artist, s.artistType]));
      const types = new Set([...cnt.keys()].map((a) => typeOf.get(a)));
      if (!types.has(state.artistType)) state.artistType = ["female", "male", "band", "other"].find((t) => types.has(t)) || state.artistType;
      h = `<div class="seg">${["female", "male", "band", "other"].filter((t) => types.has(t))
        .map((t) => `<button class="${state.artistType === t ? "on" : ""}" data-atype="${t}">${TYPE_LABEL[t]}</button>`).join("")}</div>`;
      const list = [...cnt].filter(([a]) => typeOf.get(a) === state.artistType).sort((a, b) => jaColl.compare(a[0], b[0]));
      h += `<div class="chips">${chips(list.map(([a, n]) => [a, esc(a), n]), state.filter?.v, "artist")}</div>`;
    } else if (state.tab === "anime") {
      h = `<div class="seg"><button class="${state.animeSort === "kana" ? "on" : ""}" data-asort="kana">あいう 50音（日文名）</button><button class="${state.animeSort === "stroke" ? "on" : ""}" data-asort="stroke">一二三 中文筆畫</button></div>`;
      const m = new Map();
      for (const s of pool()) if (s.anime) { const k = animeKey(s); if (!m.has(k)) m.set(k, { k, s, n: 0 }); m.get(k).n++; }
      const arr = [...m.values()].sort((a, b) => cmpAnime(a.s, b.s, state.animeSort));
      let last = "";
      h += '<div class="chips">';
      for (const { k, s, n } of arr) {
        const grp = state.animeSort === "kana" ? gyou(s.animeKana || s.animeJa) : [...s.animeZh.replace(/^[【\[(（]/, "")][0];
        if (grp !== last) { h += `<span class="grp">${esc(grp)}</span>`; last = grp; }
        const [main, sub] = [s.animeJa, s.animeZh]; // 統一日文在前、繁中在後
        h += `<button class="chip ${state.filter?.v === k ? "on" : ""}" data-anime="${esc(k)}"><span lang="ja">${esc(main)}</span>${sub !== main ? `<small>${esc(sub)}</small>` : ""}<i>${n}</i></button>`;
      }
      const nn = pool().filter((s) => !s.anime).length;
      if (nn) h += `<span class="grp">其他</span><button class="chip ${state.filter?.v === NON_ANIME ? "on" : ""}" data-anime="${NON_ANIME}"><span lang="ja">アニメ以外</span><small>非動漫歌曲</small><i>${nn}</i></button>`;
      h += "</div>";
    } else if (state.tab === "year") {
      const cnt = countBy((s) => s.year || 0);
      const ys = [...cnt].sort((a, b) => b[0] - a[0]);
      let last = "", hh = '<div class="chips">';
      for (const [y, n] of ys) {
        const dec = y ? `${String(y).slice(0, 3)}0 年代` : "年份不明";
        if (dec !== last) { hh += `<span class="grp">${dec}</span>`; last = dec; }
        hh += chips([[String(y), y || "不明", n]], state.filter?.v, "year");
      }
      h = hh + "</div>";
    } else if (state.tab === "fav") {
      h = `<div class="chips">${playlists.map((p) => `<button class="chip ${state.playlist === p.id ? "on" : ""}" data-pl="${p.id}">♥ ${esc(p.name)}<i>${p.songs.length}</i></button>`).join("")}
        <button class="chip add" data-plnew>＋ 新歌單</button></div>`;
      const p = playlists.find((x) => x.id === state.playlist);
      if (p) h += `<div class="pltools"><button data-plren>✏️ 重新命名</button><button data-plshare>🔗 分享歌單</button><button data-pldel>🗑 刪除</button></div>`;
    }
    el.innerHTML = h;
    el.hidden = !h;
  }

  function currentSongs() {
    let list;
    const f = state.filter;
    if (state.tab === "fav") {
      const p = playlists.find((x) => x.id === state.playlist);
      const ids = p ? p.songs : [];
      const byId = new Map(DB.songs.map((s) => [s.id, s]));
      list = ids.map((id) => byId.get(id)).filter(Boolean);
    } else {
      list = pool();
      if (f?.t === "artist") list = list.filter((s) => s.artist === f.v);
      if (f?.t === "anime") list = list.filter((s) => animeKey(s) === f.v);
      if (f?.t === "year") list = list.filter((s) => String(s.year || 0) === f.v);
    }
    if (state.q) list = search(list, state.q);
    else if (state.tab !== "fav") {
      const sort = state.tab === "anime" ? (state.animeSort === "kana" ? "animeKana" : "animeStroke") : state.sort;
      list = [...list].sort(SORTS[sort]);
    }
    // 依所在 KTV 分組（排序或搜尋名次在組內保持不變）
    const w = prefs.where;
    if (!w) return [{ songs: list }];
    return [
      { songs: list.filter((s) => s.ktv[w] === 1) },
      { title: `${w}可能有（待確認）`, songs: list.filter((s) => s.ktv[w] == null) },
      { title: `${w}點不到`, songs: list.filter((s) => s.ktv[w] === 0) },
    ].filter((g) => g.songs.length);
  }

  function render() {
    renderWhere();
    renderFacet();
    const needPick = ["artist", "anime", "year"].includes(state.tab) && !state.filter && !state.q;
    const fb = $("#filterbar");
    if (needPick) {
      fb.innerHTML = `<p class="hint">↑ 先從上面選${{ artist: "一位歌手", anime: "一部動漫", year: "一個年份" }[state.tab]}</p>`;
      $("#list").innerHTML = "";
      $("#empty").hidden = true;
      $("#legend").hidden = true;
      return;
    }
    const groups = currentSongs();
    const total = groups.reduce((n, g) => n + g.songs.length, 0);
    const w = prefs.where;
    const can = w ? groups.find((g) => !g.title)?.songs.length || 0 : total;
    const maybe = w ? groups.find((g) => g.title?.includes("待確認"))?.songs.length || 0 : 0;
    const count = !w ? `${total} 首` : state.tab === "fav" ? `${total} 首 · ${esc(w)}可點 ${can} 首` : `${esc(w)}可點 ${can} 首${maybe ? `，另有 ${maybe} 首待確認` : ""}`;
    const label = state.filter ? state.filter.label : "";
    const sortSel = state.q || state.tab === "fav" || state.tab === "anime" ? "" :
      `<select id="sort" aria-label="排序">${[["year", "年份 新→舊"], ["title", "歌名 50音"], ["artist", "歌手"], ["animeKana", "動漫 50音"], ["animeStroke", "動漫 中文筆畫"]]
        .map(([v, t]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
    fb.innerHTML = `<span class="res">${label ? `<b>${esc(label)}</b> · ` : ""}${count}${state.q ? `（搜尋「${esc(state.q)}」）` : ""}</span>${sortSel}`;
    $("#list").innerHTML = groups.map((g) => (g.title ? `<li class="sect"><h2>${esc(g.title)}</h2></li>` : "") + g.songs.map(card).join("")).join("");
    $("#legend").hidden = !total;
    const empty = $("#empty");
    empty.hidden = total > 0;
    const q = esc(state.q), clear = '<br><button class="clearq" data-clearq>清除搜尋</button>';
    if (state.tab === "fav" && !state.q) empty.innerHTML = "這個歌單還是空的～<br>在歌曲卡片按 ♥ 就能收藏 ✧";
    else if (state.tab === "fav") empty.innerHTML = `這個歌單裡沒有符合「${q}」的歌${clear}`;
    else if (w) empty.innerHTML = `${esc(w)}目前沒有符合的歌<br><button class="clearq" data-where="">看全部 KTV</button>${state.q ? clear : ""}`;
    else empty.innerHTML = `找不到「${q}」(´・ω・\`)<br>日文、中文、羅馬拼音都能搜<br>換個寫法試試看，或<a href="#" data-open="feedback">告訴我們想新增這首歌</a>${clear}`;
  }

  // ---------- 顯示設定：字級、護眼（存在本機） ----------
  const PREF = "ktv-anime-prefs";
  let prefs = { size: 1, theme: "eye", where: "" };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF))); } catch {}
  const SIZES = [0.9, 1, 1.15, 1.3, 1.5];
  function applyPrefs() {
    // 用百分比而非 px：保留使用者在瀏覽器／系統設定的預設字級（預設 16px × 112.5% = 18px）
    document.documentElement.style.fontSize = 112.5 * SIZES[prefs.size] + "%";
    document.documentElement.dataset.theme = prefs.theme;
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === prefs.theme));
    const lbl = $("#fsval"); if (lbl) lbl.textContent = ["小", "標準", "大", "特大", "超大"][prefs.size];
    try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch {}
  }
  applyPrefs();

  // ---------- 對話框：歌單 / 反饋 / 回報 / 贊助 ----------
  const dlg = $("#dlg"), body = $("#dlgbody");
  const toast = (t) => { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 1800); };
  const issueUrl = (title, text, label) => `https://github.com/${CFG.repo}/issues/new?labels=${encodeURIComponent(label)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;

  function openFav(id) {
    const s = DB.songs.find((x) => x.id === id);
    body.innerHTML = `<h3>♥ 加入歌單</h3><p class="muted">${esc(s.title)} — ${esc(s.artist)}</p>
      <div class="pllist">${playlists.map((p) => `<label><input type="checkbox" data-plcheck="${p.id}" ${p.songs.includes(id) ? "checked" : ""}> ${esc(p.name)}</label>`).join("")}</div>
      <div class="row"><input id="newpl" placeholder="新歌單名稱"><button type="button" data-plcreate="${id}">建立並加入</button></div>`;
    body.dataset.song = id;
    dlg.showModal();
  }
  function openInfo(kind, songId) {
    const s = songId && DB.songs.find((x) => x.id === songId);
    if (kind === "donate") {
      const links = (CFG.donate || []).map((d) => `<a class="big" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)}</a>`).join("");
      body.innerHTML = `<h3>☕ 贊助支持</h3><p>整理每家 KTV 的曲目需要不少時間，如果這個網站幫上你的忙，歡迎請作者喝杯飲料，讓更新持續下去 (〃∀〃)ゞ</p>
        ${links || `<p class="muted">贊助管道準備中，先幫忙分享給朋友也是很大的支持！</p>`}
        <a class="big ghost" href="https://github.com/${CFG.repo}" target="_blank" rel="noopener">⭐ 到 GitHub 按星星</a>`;
    } else {
      const isReport = kind === "report";
      const form = isReport ? CFG.reportForm : CFG.feedbackForm;
      const title = isReport ? (s ? `[錯誤回報] ${s.title} - ${s.artist}` : "[錯誤回報] ") : "[意見回饋] ";
      const text = isReport
        ? `### 哪一首歌\n${s ? `${s.title} / ${s.artist}（id: ${s.id}）` : ""}\n\n### 哪裡有錯（例如：某家 KTV 其實點得到、假名或中譯錯誤）\n\n\n### 正確資料／歌曲編號（可選）\n`
        : `### 想新增的歌曲或建議\n- 歌名：\n- 歌手：\n- 動漫：\n- 哪家 KTV 有：\n`;
      const url = form || issueUrl(title, text, isReport ? "錯誤回報" : "意見回饋");
      body.innerHTML = `<h3>${isReport ? "🐞 錯誤回報" : "💌 意見回饋"}</h3>
        <p>${isReport ? "發現 KTV 亮燈不正確、歌名／假名／中譯有誤？" : "想新增歌曲、補充資料，或對網站有建議？"}歡迎告訴我們，確認後就會更新到網站上。</p>
        ${s ? `<p class="muted">歌曲：${esc(s.title)} — ${esc(s.artist)}</p>` : ""}
        <a class="big" href="${esc(url)}" target="_blank" rel="noopener">${form ? "開啟表單" : "到 GitHub 填寫（需要 GitHub 帳號）"}</a>`;
    }
    dlg.showModal();
  }

  // ---------- 事件 ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (d.prefs != null) {
      const open = t.getAttribute("aria-expanded") !== "true";
      t.setAttribute("aria-expanded", open); $("#prefs").hidden = !open;
      return;
    }
    if (d.reload != null) return location.reload();
    if (d.clearq != null) { state.q = ""; $("#q").value = ""; $("#q").focus(); return render(); }
    if (d.fs) { prefs.size = Math.max(0, Math.min(SIZES.length - 1, prefs.size + +d.fs)); return applyPrefs(); }
    if (d.themeSet) { prefs.theme = d.themeSet; return applyPrefs(); }
    if (d.tab) {
      state.tab = d.tab; state.filter = null;
      if (d.tab === "fav" && !state.playlist) state.playlist = playlists[0].id;
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b === t));
    } else if (d.atype) state.artistType = d.atype;
    else if (d.asort) state.animeSort = d.asort;
    else if (d.artist != null) {
      e.preventDefault();
      const a = d.artist;
      if (state.tab !== "artist") { state.tab = "artist"; document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === "artist")); }
      state.artistType = DB.songs.find((s) => s.artist === a)?.artistType || state.artistType;
      state.filter = state.filter?.v === a && t.classList.contains("chip") ? null : { t: "artist", v: a, label: a };
      state.q = ""; $("#q").value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (d.anime != null) {
      const s = DB.songs.find((x) => animeKey(x) === d.anime);
      state.filter = state.filter?.v === d.anime ? null : { t: "anime", v: d.anime, label: s?.anime ? `${s.animeJa}　${s.animeZh}` : "非動漫歌曲" };
    } else if (d.year != null) state.filter = state.filter?.v === d.year ? null : { t: "year", v: d.year, label: d.year === "0" ? "年份不明" : d.year + " 年" };
    else if (d.where != null) { prefs.where = d.where; applyPrefs(); }
    else if (d.pl) state.playlist = d.pl;
    else if (d.plnew != null) {
      const n = prompt("新歌單名稱", `歌單 ${playlists.length + 1}`);
      if (!n) return;
      const p = { id: Date.now().toString(36), name: n.trim(), songs: [] };
      playlists.push(p); state.playlist = p.id; savePl();
    } else if (d.plren != null) {
      const p = playlists.find((x) => x.id === state.playlist);
      const n = prompt("歌單名稱", p.name); if (!n) return; p.name = n.trim(); savePl();
    } else if (d.pldel != null) {
      const p = playlists.find((x) => x.id === state.playlist);
      if (!confirm(`刪除歌單「${p.name}」？裡面收藏的 ${p.songs.length} 首歌會一起移除，刪除後無法復原。`)) return;
      playlists = playlists.filter((x) => x !== p);
      if (!playlists.length) playlists = [{ id: "fav", name: "我的最愛", songs: [] }];
      state.playlist = playlists[0].id; savePl();
    } else if (d.plshare != null) {
      const p = playlists.find((x) => x.id === state.playlist);
      const url = `${location.origin}${location.pathname}#pl=${encodeURIComponent(p.name)}&ids=${p.songs.join(",")}`;
      (navigator.share ? navigator.share({ title: p.name, url }) : navigator.clipboard.writeText(url).then(() => toast("已複製分享連結"))).catch(() => {});
      return;
    } else if (d.fav) return openFav(d.fav);
    else if (d.bug) return openInfo("report", d.bug);
    else if (d.open) { e.preventDefault(); return openInfo(d.open); }
    else if (d.plcreate) {
      const n = $("#newpl").value.trim(); if (!n) return;
      playlists.push({ id: Date.now().toString(36), name: n, songs: [d.plcreate] }); savePl();
      toast(`已加入「${n}」`); dlg.close();
    } else return;
    render();
  });
  dlg.addEventListener("change", (e) => {
    const id = e.target.dataset.plcheck; if (!id) return;
    const p = playlists.find((x) => x.id === id), sid = body.dataset.song;
    p.songs = e.target.checked ? [...new Set([...p.songs, sid])] : p.songs.filter((x) => x !== sid);
    savePl(); toast(e.target.checked ? `已加入「${p.name}」` : `已從「${p.name}」移除`);
  });
  dlg.addEventListener("close", () => render());
  document.addEventListener("change", (e) => { if (e.target.id === "sort") { state.sort = e.target.value; render(); } });
  let qt;
  $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120); });

  // 從分享連結匯入歌單
  function importShared() {
    const m = /#pl=([^&]*)&ids=([\w,]*)/.exec(location.hash);
    if (!m) return;
    const name = decodeURIComponent(m[1]), ids = m[2].split(",").filter(Boolean);
    history.replaceState(null, "", location.pathname);
    if (!ids.length || !confirm(`匯入朋友分享的歌單「${name}」（${ids.length} 首）？`)) return;
    const p = { id: Date.now().toString(36), name, songs: ids };
    playlists.push(p); savePl();
    state.tab = "fav"; state.playlist = p.id;
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === "fav"));
  }

  fetch("data/songs.json", { cache: "no-cache" }).then((r) => r.json()).then((db) => {
    DB = db;
    for (const s of DB.songs) {
      s._t = norm([s.title, s.kana, s.zh].join("|"));
      s._a = norm(s.artist);
      s._o = norm([s.anime, s.animeZh, s.animeJa, s.animeKana, s.type, s.year].join("|"));
      s.kanaSort = /^[ぁ-ヿ]/.test(s.kana) ? s.kana : s.title;
    }
    // 整家都還沒填資料的 KTV：卡片上不顯示燈號，KTV 分頁標「曲目整理中」；一有資料就自動恢復
    DB.pending = DB.ktvs.filter((k) => DB.songs.every((s) => s.ktv[k] == null));
    DB.known = DB.ktvs.filter((k) => !DB.pending.includes(k));
    if (prefs.where && !DB.known.includes(prefs.where)) { prefs.where = ""; applyPrefs(); }
    $("#pendingnote").textContent = DB.pending.length ? `${DB.pending.join("、")}的曲目還在整理中，目前先不顯示。` : "";
    $("#count").textContent = DB.songs.length;
    $("#updated").textContent = new Date(DB.updated).toLocaleDateString("zh-TW");
    importShared();
    render();
  }).catch(() => {
    $("#list").innerHTML = '<li class="empty">歌曲資料沒有載入成功，可能是網路不穩 (；´Д｀)<br><button class="clearq" data-reload>重新載入</button></li>';
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
