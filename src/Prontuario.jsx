import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";

const SECTIONS = [
  { id: "sop", label: "SOP", icon: "📄", kind: "doc" },
  { id: "datasheet", label: "Datasheet reagenti", icon: "🧪", kind: "doc" },
  { id: "protocolli", label: "Protocolli", icon: "📑", kind: "doc" },
  { id: "cause", label: "Cause di aumento / diminuzione", icon: "📈", kind: "cause" },
];

const BUCKET = "prontuario";
const MAX_MB = 50;

const CSS = `
.pr-wrap { display:flex; gap:24px; align-items:flex-start; }
.pr-side { width:230px; flex-shrink:0; display:flex; flex-direction:column; gap:4px; }
.pr-side-title { font-size:11px; font-weight:700; color:#475569; letter-spacing:.04em; margin-bottom:6px; }
.pr-side-btn { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; text-align:left; padding:9px 12px; border:none; border-radius:6px; background:transparent; font-family:inherit; font-size:13px; color:#1e293b; cursor:pointer; }
.pr-side-btn:hover { background:#f1f5f9; }
.pr-side-btn.on { background:#f0fdfa; color:#0f766e; font-weight:600; }
.pr-count { font-size:10.5px; font-weight:700; background:#f1f5f9; color:#475569; border-radius:999px; padding:1px 7px; }
.pr-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:14px; }
.pr-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.pr-title { font-size:16px; font-weight:700; }
.pr-search { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-family:inherit; font-size:13px; }
.pr-search:focus { outline:none; border-color:#0f766e; box-shadow:0 0 0 2px #ccfbf1; }
.pr-tablebox { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; overflow-x:auto; }
.pr-table { width:100%; border-collapse:collapse; font-size:13px; }
.pr-table th { text-align:left; color:#475569; font-weight:600; padding:9px 12px; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
.pr-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; vertical-align:top; color:#334155; line-height:1.5; white-space:pre-wrap; }
.pr-table tr:last-child td { border-bottom:none; }
.pr-sect-tag { display:inline-block; font-size:10px; padding:1px 8px; border-radius:999px; background:#f1f5f9; color:#475569; font-weight:600; margin-top:4px; }
.pr-reparto { display:inline-block; font-size:10.5px; padding:1px 8px; border-radius:999px; font-weight:600; white-space:nowrap; }
.pr-btn { padding:6px 12px; border-radius:6px; background:#0f766e; color:#fff; border:none; font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.pr-btn:hover { background:#115e59; }
.pr-btn:disabled { opacity:.5; cursor:default; }
.pr-btn.ghost { background:#fff; color:#334155; border:1px solid #cbd5e1; }
.pr-btn.ghost:hover { background:#f1f5f9; }
.pr-btn.danger { background:#fff; color:#b91c1c; border:1px solid #fca5a5; }
.pr-btn.danger:hover { background:#fef2f2; }
.pr-actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.pr-empty { padding:28px; text-align:center; color:#64748b; font-size:13px; border:1px dashed #cbd5e1; border-radius:8px; }
.pr-form { border:1px solid #99f6e4; background:#f0fdfa; border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:10px; }
.pr-form label { font-size:11.5px; font-weight:600; color:#475569; display:flex; flex-direction:column; gap:4px; }
.pr-form input, .pr-form select, .pr-form textarea { padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit; font-size:12.5px; background:#fff; }
.pr-form textarea { resize:vertical; min-height:70px; line-height:1.5; }
.pr-form textarea.pr-json { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; min-height:160px; }
.pr-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.pr-err { color:#b91c1c; font-size:12.5px; font-weight:600; }
.pr-note { font-size:11.5px; color:#64748b; }
.pr-body { font-size:12.5px; color:#475569; margin-top:4px; }

/* elenco parametri */
.pr-chips { display:flex; gap:6px; flex-wrap:wrap; }
.pr-chip { font-size:12px; font-weight:600; padding:5px 12px; border-radius:999px; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; cursor:pointer; font-family:inherit; }
.pr-chip.on { background:#ecfeff; color:#0e7490; border-color:#67e8f9; }
.pr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:8px; }
.pr-pbtn { display:flex; justify-content:space-between; align-items:center; gap:8px; text-align:left; padding:12px 14px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; font-family:inherit; font-size:13.5px; font-weight:600; color:#1e293b; cursor:pointer; }
.pr-pbtn:hover { border-color:#0f766e; background:#f0fdfa; }
.pr-pbtn small { font-weight:500; color:#64748b; font-size:11.5px; white-space:nowrap; }
.pr-grp { font-size:11px; font-weight:700; color:#475569; letter-spacing:.04em; margin:6px 0 2px; }

/* scheda parametro */
.pr-back { align-self:flex-start; }
.pr-ptitle { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.pr-ptitle h2 { margin:0; font-size:20px; }
.pr-box { border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; padding:12px 14px; font-size:13.5px; line-height:1.65; color:#334155; }
.pr-box h3 { margin:0 0 6px; font-size:12px; letter-spacing:.04em; color:#475569; }
.pr-box ul { margin:0; padding-left:18px; }
.pr-box li { margin-bottom:4px; }
.pr-warn { border-color:#fcd34d; background:#fffbeb; color:#78350f; }
.pr-warn h3 { color:#92400e; }
.pr-tabs { display:flex; gap:6px; align-items:flex-end; }
.pr-tab { padding:10px 18px; border-radius:8px 8px 0 0; font-family:inherit; font-size:13.5px; font-weight:700; border:1px solid #e2e8f0; border-bottom:none; background:#f8fafc; color:#475569; cursor:pointer; }
.pr-tab.up.on { background:#fef2f2; color:#b91c1c; border-color:#fca5a5; }
.pr-tab.dn.on { background:#eff6ff; color:#1d4ed8; border-color:#93c5fd; }
.pr-tabpane { border:1px solid #e2e8f0; border-radius:0 8px 8px 8px; padding:12px; display:flex; flex-direction:column; gap:8px; margin-top:-15px; }
.pr-tabpane.up { border-color:#fca5a5; }
.pr-tabpane.dn { border-color:#93c5fd; }
.pr-tools { display:flex; justify-content:flex-end; gap:6px; }
.pr-cause { border:1px solid #e2e8f0; border-radius:8px; background:#fff; }
.pr-cause.open { border-color:#94a3b8; }
.pr-chead { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; width:100%; text-align:left; padding:11px 14px; border:none; background:transparent; font-family:inherit; cursor:pointer; }
.pr-chev { font-size:12px; color:#64748b; width:12px; }
.pr-ctitle { font-size:14px; font-weight:700; color:#0f172a; }
.pr-sp { font-size:10.5px; font-weight:600; color:#475569; background:#f1f5f9; border-radius:999px; padding:1px 8px; }
.pr-inline { display:flex; gap:5px; flex-wrap:wrap; margin-left:22px; width:100%; }
.pr-pill { font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:6px; background:#f1f5f9; color:#334155; white-space:nowrap; }
.pr-pill b { font-weight:700; }
.v-up { color:#b91c1c; }
.v-dn { color:#1d4ed8; }
.v-mix { color:#b45309; }
.v-wri { color:#475569; }
.pr-cbody { padding:2px 14px 14px 36px; display:flex; flex-direction:column; gap:10px; font-size:13.5px; line-height:1.65; color:#334155; }
.pr-cbody h4 { margin:0 0 3px; font-size:11px; letter-spacing:.04em; color:#475569; }
.pr-ctable { border-collapse:collapse; font-size:13px; }
.pr-ctable td { padding:4px 14px 4px 0; vertical-align:top; }
.pr-extra { border-left:3px solid #cbd5e1; padding:6px 12px; background:#f8fafc; border-radius:0 6px 6px 0; }
.pr-ptable td, .pr-ptable th { white-space:normal; text-align:center; }
.pr-ptable td:first-child, .pr-ptable th:first-child { text-align:left; font-weight:600; }
mark.pr-mark { background:#fde68a; color:inherit; border-radius:3px; padding:0 1px; }
.pr-hit { text-align:left; width:100%; border:1px solid #e2e8f0; border-radius:8px; background:#fff; padding:10px 14px; font-family:inherit; cursor:pointer; display:flex; flex-direction:column; gap:3px; }
.pr-hit:hover { border-color:#0f766e; background:#f0fdfa; }
.pr-hit .p { font-size:13.5px; font-weight:700; color:#0f172a; }
.pr-hit .w { font-size:11.5px; font-weight:600; color:#0f766e; }
.pr-hit .s { font-size:12.5px; color:#475569; line-height:1.5; }
.pr-src { font-size:11.5px; color:#64748b; line-height:1.5; }
/* datasheet */
.pr-meta { display:flex; gap:6px 14px; flex-wrap:wrap; font-size:12.5px; color:#475569; }
.pr-meta b { color:#1e293b; }
.pr-spec { font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px; background:#f1f5f9; color:#475569; }
.pr-spec.vet { background:#ecfdf5; color:#047857; }
.pr-lv { display:flex; gap:10px; align-items:flex-start; padding:9px 12px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; font-size:13.5px; line-height:1.6; color:#334155; }
.pr-lv .b { flex-shrink:0; font-size:10.5px; font-weight:800; letter-spacing:.03em; padding:2px 8px; border-radius:6px; margin-top:2px; white-space:nowrap; }
.pr-lv.stop { border-color:#fca5a5; background:#fef2f2; } .pr-lv.stop .b { background:#b91c1c; color:#fff; }
.pr-lv.warn { border-color:#fcd34d; background:#fffbeb; } .pr-lv.warn .b { background:#b45309; color:#fff; }
.pr-lv.info { border-color:#cbd5e1; background:#f8fafc; } .pr-lv.info .b { background:#475569; color:#fff; }
.pr-lv.ok { border-color:#bbf7d0; background:#f0fdf4; } .pr-lv.ok .b { background:#15803d; color:#fff; }
.pr-lv .t { font-weight:700; color:#0f172a; }
.pr-kv { display:grid; grid-template-columns:130px 1fr; gap:4px 12px; font-size:13.5px; line-height:1.6; }
.pr-kv dt { font-weight:700; color:#475569; } .pr-kv dd { margin:0; }
.pr-lvtag { font-size:10.5px; font-weight:800; padding:1px 7px; border-radius:6px; color:#fff; margin-left:6px; }
.pr-lvtag.stop { background:#b91c1c; } .pr-lvtag.warn { background:#b45309; } .pr-lvtag.info { background:#475569; } .pr-lvtag.ok { background:#15803d; }
@media (max-width:760px) { .pr-kv { grid-template-columns:1fr; } .pr-wrap { flex-direction:column; } .pr-side { width:100%; flex-direction:row; flex-wrap:wrap; } .pr-row { grid-template-columns:1fr; } .pr-cbody { padding-left:14px; } }
`;

function fmtDate(d) {
  if (!d) return "";
  const [y, m, g] = String(d).split("-");
  return g && m && y ? `${g}/${m}/${y}` : d;
}

// minuscolo e senza accenti, mantenendo la stessa lunghezza (serve per evidenziare
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[àáâä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o")
    .replace(/[ùúûü]/g, "u");
}

// gruppi di sinonimi (radici): cercando una voce si trovano anche le altre
const SYN = [
  ["emoli", "emoglobin", "emolitic"],
  ["lipemi", "trigliceridi", "torbid"],
  ["itter", "bilirubin"],
  ["biotin", "vitamina b7"],
  ["eparin"],
  ["edta"],
];

// una parola digitata -> lei più i suoi sinonimi
function expandWord(w) {
  const out = new Set([w]);
  if (w.length >= 4) {
    SYN.forEach((g) => {
      if (g.some((x) => w.startsWith(x) || x.startsWith(w))) g.forEach((x) => out.add(x));
    });
  }
  return Array.from(out);
}

// gruppi di parole: ogni parola digitata deve comparire (lei o un sinonimo)
function wordGroups(term) {
  return fold(term).split(/\s+/).filter(Boolean).map(expandWord);
}

// tutti i termini da evidenziare
function expandTerms(term) {
  return Array.from(new Set(wordGroups(term).flat()));
}

// vero se OGNI parola digitata compare nel testo (in qualunque ordine)
function matchAny(text, groups, extra) {
  if (!groups.length) return false;
  const f = fold(text) + " " + fold(extra || "");
  return groups.every((g) => g.some((t) => f.includes(t)));
}

function Mark({ text, term }) {
  const terms = expandTerms(term);
  const s = String(text || "");
  if (terms.length === 0) return <>{s}</>;
  const f = fold(s);
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const out = [];
  let i = 0;
  let k = 0;
  let m;
  while ((m = re.exec(f)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (m.index > i) out.push(s.slice(i, m.index));
    out.push(<mark className="pr-mark" key={k++}>{s.slice(m.index, m.index + m[0].length)}</mark>);
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push(s.slice(i));
  return <>{out}</>;
}

function vClass(v) {
  const s = String(v || "");
  const up = s.includes("↑");
  const dn = s.includes("↓");
  if (up && dn) return "v-mix";
  if (up) return "v-up";
  if (dn) return "v-dn";
  return "v-wri";
}

function snippet(text, term) {
  const s = String(text || "");
  const f = fold(s);
  let j = -1;
  expandTerms(term).forEach((t) => {
    const p = f.indexOf(t);
    if (p !== -1 && (j === -1 || p < j)) j = p;
  });
  if (j === -1) return s.slice(0, 140);
  const a = Math.max(0, j - 50);
  const b = Math.min(s.length, j + 110);
  return (a > 0 ? "…" : "") + s.slice(a, b) + (b < s.length ? "…" : "");
}

const LV = {
  stop: { label: "INTERFERISCE", rank: 0 },
  warn: { label: "ATTENZIONE", rank: 1 },
  info: { label: "NOTA", rank: 2 },
  ok: { label: "NESSUN EFFETTO", rank: 3 },
};

// cerca dentro la scheda strutturata (parametro o datasheet)
function searchDetail(item, term) {
  const groups = wordGroups(term);
  const d = item.detail;
  if (groups.length === 0 || !d) return [];
  const hits = [];
  const has = (x) => matchAny(x, groups, item.title);
  (d.info || []).forEach((x) => { if (has(x)) hits.push({ tab: null, where: "Info generiche", text: x }); });
  if (d.uso && has(d.uso)) hits.push({ tab: null, where: "Uso previsto", text: d.uso });
  if (d.strumento && has(d.strumento + " " + (d.specie || ""))) hits.push({ tab: null, where: "Strumento / specie", text: d.strumento + " · " + (d.specie || "") });
  if (d.fonte && has(d.fonte)) hits.push({ tab: null, where: "Fonte", text: d.fonte });
  if (d.codice && has(d.codice)) hits.push({ tab: null, where: "Codice", text: d.codice });
  (d.interferenze || []).forEach((x) => {
    if (has(x.t) || has(x.d)) {
      hits.push({ tab: null, where: "Interferenze · " + x.t, text: x.d, level: x.livello || "info" });
    }
  });
  if (d.campione) {
    const c = d.campione;
    [c.tipo, c.volume, c.conservazione, ...(c.note || [])].filter(Boolean).forEach((x) => {
      if (has(x)) hits.push({ tab: null, where: "Campione e conservazione", text: x });
    });
  }
  (d.limiti || []).forEach((l) => {
    if (has(l.t) || has(l.d)) hits.push({ tab: null, where: "Limiti di misura · " + l.t, text: l.d });
  });
  (d.prestazioni || []).forEach((l) => {
    if (has(l.t) || has(l.d)) hits.push({ tab: null, where: "Prestazioni · " + l.t, text: l.d });
  });
  if (d.riferimento && has(d.riferimento)) hits.push({ tab: null, where: "Valori di riferimento", text: d.riferimento });
  ["aumento", "diminuzione"].forEach((tab) => {
    (d[tab] || []).forEach((c, idx) => {
      const corr = (c.correlati || []).map((r) => r.p + " " + r.v).join(" ");
      const all = [c.causa, c.specie, c.patogenesi, c.note, corr].join(" ");
      if (has(all)) {
        const src = [c.patogenesi, c.note, corr, c.causa].find((x) => has(x)) || c.patogenesi;
        hits.push({
          tab, idx,
          where: (tab === "aumento" ? "▲ Cause di aumento" : "▼ Cause di diminuzione") + " · " + c.causa,
          text: src,
        });
      }
    });
  });
  return hits;
}

function Pill({ p, v }) {
  return (
    <span className="pr-pill">
      {p}: <b className={vClass(v)}>{v}</b>
    </span>
  );
}

function CauseCard({ c, open, onToggle, term }) {
  return (
    <div className={"pr-cause " + (open ? "open" : "")}>
      <button className="pr-chead" aria-expanded={open} onClick={onToggle}>
        <span className="pr-chev">{open ? "▾" : "▸"}</span>
        <span className="pr-ctitle"><Mark text={c.causa} term={term} /></span>
        {c.specie ? <span className="pr-sp">{c.specie}</span> : null}
        {c.correlati && c.correlati.length > 0 && (
          <span className="pr-inline">
            {c.correlati.map((r, i) => <Pill key={i} p={r.p} v={r.v} />)}
          </span>
        )}
      </button>
      {open && (
        <div className="pr-cbody">
          {c.patogenesi && (
            <div><h4>PATOGENESI</h4><Mark text={c.patogenesi} term={term} /></div>
          )}
          {c.correlati && c.correlati.length > 0 && (
            <div>
              <h4>COSA CONTROLLARE E COME ATTENDERLO</h4>
              <table className="pr-ctable">
                <tbody>
                  {c.correlati.map((r, i) => (
                    <tr key={i}>
                      <td><b><Mark text={r.p} term={term} /></b></td>
                      <td><b className={vClass(r.v)}><Mark text={r.v} term={term} /></b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.note && (
            <div className="pr-extra"><Mark text={c.note} term={term} /></div>
          )}
        </div>
      )}
    </div>
  );
}

function CauseView({ item, tab, setTab, openKeys, setOpenKeys, term, isMaster, onEdit, onDelete, onBack, repTag }) {
  const d = item.detail;

  if (!d) {
    // scheda semplice (testo)
    return (
      <>
        <button className="pr-btn ghost pr-back" onClick={onBack}>← Tutti i parametri</button>
        <div className="pr-ptitle"><h2>{item.title}</h2>{repTag(item.reparto)}</div>
        {item.aumento && <div className="pr-box"><h3>▲ CAUSE DI AUMENTO</h3><div style={{ whiteSpace: "pre-wrap" }}>{item.aumento}</div></div>}
        {item.diminuzione && <div className="pr-box"><h3>▼ CAUSE DI DIMINUZIONE</h3><div style={{ whiteSpace: "pre-wrap" }}>{item.diminuzione}</div></div>}
        {item.body && <div className="pr-box"><div style={{ whiteSpace: "pre-wrap" }}>{item.body}</div></div>}
        {isMaster && (
          <div className="pr-actions">
            <button className="pr-btn ghost" onClick={() => onEdit(item)}>Modifica</button>
            <button className="pr-btn danger" onClick={() => onDelete(item)}>Elimina</button>
          </div>
        )}
      </>
    );
  }

  const list = d[tab] || [];
  const keyOf = (i) => `${item.id}-${tab}-${i}`;
  const allOpen = list.length > 0 && list.every((_, i) => openKeys.has(keyOf(i)));
  const toggleAll = () => {
    const n = new Set(openKeys);
    list.forEach((_, i) => { allOpen ? n.delete(keyOf(i)) : n.add(keyOf(i)); });
    setOpenKeys(n);
  };
  const toggleOne = (i) => {
    const n = new Set(openKeys);
    n.has(keyOf(i)) ? n.delete(keyOf(i)) : n.add(keyOf(i));
    setOpenKeys(n);
  };

  return (
    <>
      <button className="pr-btn ghost pr-back" onClick={onBack}>← Tutti i parametri</button>
      <div className="pr-ptitle">
        <h2>{item.title}</h2>
        {repTag(item.reparto)}
        {isMaster && (
          <span className="pr-actions" style={{ marginLeft: "auto" }}>
            <button className="pr-btn ghost" onClick={() => onEdit(item)}>Modifica</button>
            <button className="pr-btn danger" onClick={() => onDelete(item)}>Elimina</button>
          </span>
        )}
      </div>

      {d.info && d.info.length > 0 && (
        <div className="pr-box">
          <h3>INFO GENERICHE</h3>
          <ul>{d.info.map((x, i) => <li key={i}><Mark text={x} term={term} /></li>)}</ul>
        </div>
      )}

      {d.limiti && d.limiti.length > 0 && (
        <div className="pr-box pr-warn">
          <h3>⚠ LIMITI DI MISURA E INTERFERENZE</h3>
          <ul>
            {d.limiti.map((l, i) => (
              <li key={i}><b><Mark text={l.t} term={term} />:</b> <Mark text={l.d} term={term} /></li>
            ))}
          </ul>
        </div>
      )}

      <div className="pr-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "aumento"} className={"pr-tab up " + (tab === "aumento" ? "on" : "")} onClick={() => setTab("aumento")}>
          ▲ Cause di aumento ({(d.aumento || []).length})
        </button>
        <button role="tab" aria-selected={tab === "diminuzione"} className={"pr-tab dn " + (tab === "diminuzione" ? "on" : "")} onClick={() => setTab("diminuzione")}>
          ▼ Cause di diminuzione ({(d.diminuzione || []).length})
        </button>
      </div>
      <div className={"pr-tabpane " + (tab === "aumento" ? "up" : "dn")}>
        <div className="pr-tools">
          <button className="pr-btn ghost" onClick={toggleAll}>{allOpen ? "Comprimi tutto" : "Espandi tutto"}</button>
        </div>
        {list.length === 0 && <div className="pr-note">Nessuna voce.</div>}
        {list.map((c, i) => (
          <CauseCard key={i} c={c} open={openKeys.has(keyOf(i))} onToggle={() => toggleOne(i)} term={term} />
        ))}
        {tab === "diminuzione" && d.nonrilevabili && (
          <div className="pr-extra"><b>Non rilevabili dal solo totale.</b> <Mark text={d.nonrilevabili} term={term} /></div>
        )}
      </div>

      {d.pattern && (
        <div>
          <div className="pr-grp">PATTERN TIPICI A COLPO D'OCCHIO</div>
          <div className="pr-tablebox">
            <table className="pr-table pr-ptable">
              <thead>
                <tr><th>Condizione</th>{d.pattern.cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {d.pattern.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r[0]}</td>
                    {r.slice(1).map((v, j) => <td key={j}><b className={vClass(v)}>{v}</b></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.pattern.nota && <div className="pr-src" style={{ marginTop: 6 }}>{d.pattern.nota}</div>}
        </div>
      )}

      {d.fonte && <div className="pr-src">Fonte: {d.fonte}</div>}
    </>
  );
}

function DatasheetView({ item, term, isMaster, onEdit, onDelete, onBack, repTag, openFile, opening }) {
  const d = item.detail || {};
  const c = d.campione || {};
  const interf = [...(d.interferenze || [])].sort(
    (a, b) => (LV[a.livello]?.rank ?? 2) - (LV[b.livello]?.rank ?? 2)
  );
  return (
    <>
      <button className="pr-btn ghost pr-back" onClick={onBack}>← Tutti i datasheet</button>
      <div className="pr-ptitle">
        <h2>{item.title}</h2>
        {repTag(item.reparto)}
        {d.specie && <span className={"pr-spec " + (d.specie === "umano" ? "" : "vet")}>{d.specie === "umano" ? "Datasheet per uso umano" : "Uso veterinario · " + d.specie}</span>}
        <span className="pr-actions" style={{ marginLeft: "auto" }}>
          {item.file_path && (
            <button className="pr-btn" disabled={opening} onClick={() => openFile(item)}>{opening ? "Apro…" : "Apri PDF originale"}</button>
          )}
          {isMaster && (
            <>
              <button className="pr-btn ghost" onClick={() => onEdit(item)}>Modifica</button>
              <button className="pr-btn danger" onClick={() => onDelete(item)}>Elimina</button>
            </>
          )}
        </span>
      </div>
      <div className="pr-meta">
        {d.strumento && <span>Strumento: <b>{d.strumento}</b></span>}
        {d.codice && <span>Codice: <b><Mark text={d.codice} term={term} /></b></span>}
        {item.revision && <span>Rev.: <b>{item.revision}</b></span>}
      </div>

      {d.uso && (
        <div className="pr-box"><h3>USO PREVISTO</h3><Mark text={d.uso} term={term} /></div>
      )}

      {interf.length > 0 && (
        <div>
          <div className="pr-grp">⚠ INTERFERENZE E LIMITI DI MISURA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {interf.map((x, i) => {
              const lv = LV[x.livello] ? x.livello : "info";
              return (
                <div key={i} className={"pr-lv " + lv}>
                  <span className="b">{LV[lv].label}</span>
                  <div><span className="t"><Mark text={x.t} term={term} />.</span> <Mark text={x.d} term={term} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {d.limiti && d.limiti.length > 0 && (
        <div className="pr-box pr-warn">
          <h3>ALTRI LIMITI DEL METODO</h3>
          <ul>{d.limiti.map((l, i) => <li key={i}><b><Mark text={l.t} term={term} />:</b> <Mark text={l.d} term={term} /></li>)}</ul>
        </div>
      )}

      {d.campione && (
        <div className="pr-box">
          <h3>CAMPIONE E CONSERVAZIONE</h3>
          <dl className="pr-kv">
            {c.tipo && (<><dt>Campione</dt><dd><Mark text={c.tipo} term={term} /></dd></>)}
            {c.volume && (<><dt>Volume</dt><dd><Mark text={c.volume} term={term} /></dd></>)}
            {c.conservazione && (<><dt>Conservazione</dt><dd><Mark text={c.conservazione} term={term} /></dd></>)}
          </dl>
          {c.note && c.note.length > 0 && (
            <ul style={{ marginTop: 8 }}>{c.note.map((x, i) => <li key={i}><Mark text={x} term={term} /></li>)}</ul>
          )}
        </div>
      )}

      {d.prestazioni && d.prestazioni.length > 0 && (
        <div className="pr-box">
          <h3>PRESTAZIONI</h3>
          <dl className="pr-kv">
            {d.prestazioni.map((p, i) => (<React.Fragment key={i}><dt>{p.t}</dt><dd><Mark text={p.d} term={term} /></dd></React.Fragment>))}
          </dl>
        </div>
      )}

      {d.riferimento && (
        <div className="pr-box"><h3>VALORI DI RIFERIMENTO</h3><Mark text={d.riferimento} term={term} /></div>
      )}

      {item.body && <div className="pr-box"><div style={{ whiteSpace: "pre-wrap" }}>{item.body}</div></div>}
      <div className="pr-src">
        {d.fonte && <>Fonte: {d.fonte} </>}
        I valori numerici e le tabelle complete (es. bilirubina, trigliceridi, emoglobina) sono nel PDF originale del produttore.
      </div>
    </>
  );
}

export default function Prontuario({ isMaster, currentUser, reparti }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [section, setSection] = useState("sop");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [rowError, setRowError] = useState(null);

  // scheda parametro aperta
  const [selId, setSelId] = useState(null);
  const [tab, setTab] = useState("aumento");
  const [openKeys, setOpenKeys] = useState(new Set());
  const [hl, setHl] = useState("");
  const [repFilter, setRepFilter] = useState("tutti");
  const [specFilter, setSpecFilter] = useState("tutti");

  const repartoMap = useMemo(() => {
    const m = {};
    (reparti || []).forEach((r) => { m[r.id] = r; });
    return m;
  }, [reparti]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("prontuario_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (error) setLoadError(error.message);
    else { setItems(data || []); setLoadError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = {};
    items.forEach((i) => { c[i.section] = (c[i.section] || 0) + 1; });
    return c;
  }, [items]);

  const searching = q.trim().length > 0;
  const term = q.trim();

  const secOf = (id) => SECTIONS.find((s) => s.id === id);

  // risultati ricerca
  const results = useMemo(() => {
    if (!term) return { docs: [], hits: [] };
    const groups = wordGroups(term);
    const docs = [];
    const hits = [];
    items.forEach((i) => {
      if (i.detail) {
        const h = searchDetail(i, term);
        if (h.length === 0 && matchAny(i.title + " " + JSON.stringify(i.detail) + " " + (i.body || ""), groups)) {
          hits.push({ item: i, tab: "aumento", idx: null, where: "Scheda", text: i.title });
        }
        h.forEach((x) => hits.push({ item: i, ...x }));
      } else {
        const match = [i.title, i.body, i.aumento, i.diminuzione, i.reparto, i.revision]
          .filter(Boolean)
          .some((x) => matchAny(x, groups));
        if (match) docs.push(i);
      }
    });
    // prima le interferenze che alterano il risultato, poi le altre, per ultime "nessun effetto"
    hits.sort((a, b) => (LV[a.level]?.rank ?? 2) - (LV[b.level]?.rank ?? 2));
    return { docs, hits };
  }, [items, term]);

  const sectionItems = useMemo(() => items.filter((i) => i.section === section), [items, section]);
  const currentSec = secOf(section);
  const selItem = selId ? items.find((i) => i.id === selId) : null;

  const goTo = (hit) => {
    setHl(term);
    setSelId(hit.item.id);
    setSection(hit.item.section);
    const tb = hit.tab || "aumento";
    setTab(tb);
    const n = new Set();
    if (hit.idx !== null && hit.idx !== undefined) n.add(`${hit.item.id}-${tb}-${hit.idx}`);
    setOpenKeys(n);
    setQ("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openParam = (it) => {
    setSelId(it.id);
    setTab("aumento");
    setOpenKeys(new Set());
    setHl("");
    setForm(null);
  };

  const backToList = () => { setSelId(null); setHl(""); };

  const openNew = () => {
    setFormError(null);
    setForm({
      id: null, section, title: "", reparto: "", body: "", aumento: "", diminuzione: "",
      revision: "", revision_date: "", file_path: null, newFile: null, removeFile: false, detailText: "",
    });
  };

  const openEdit = (it) => {
    setFormError(null);
    setForm({
      ...it,
      reparto: it.reparto || "", body: it.body || "", aumento: it.aumento || "",
      diminuzione: it.diminuzione || "", revision: it.revision || "",
      revision_date: it.revision_date || "", newFile: null, removeFile: false,
      detailText: it.detail ? JSON.stringify(it.detail, null, 2) : "",
    });
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setFormError("Il titolo è obbligatorio."); return; }
    const sec = secOf(form.section);
    if (form.newFile && form.newFile.size > MAX_MB * 1024 * 1024) {
      setFormError(`Il file supera ${MAX_MB} MB.`); return;
    }
    let detail = null;
    const hasDetail = sec.kind === "cause" || sec.id === "datasheet";
    if (hasDetail && form.detailText.trim()) {
      try { detail = JSON.parse(form.detailText); }
      catch (e) { setFormError("Il testo della scheda strutturata non è un JSON valido: " + e.message); return; }
    }
    setSaving(true);
    setFormError(null);
    try {
      let file_path = form.file_path;
      let oldPathToDelete = null;

      if (form.newFile) {
        const safe = form.newFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${form.section}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, form.newFile, { contentType: form.newFile.type || "application/pdf" });
        if (upErr) throw new Error("Caricamento file non riuscito: " + upErr.message);
        if (file_path) oldPathToDelete = file_path;
        file_path = path;
      } else if (form.removeFile && file_path) {
        oldPathToDelete = file_path;
        file_path = null;
      }

      const payload = {
        section: form.section,
        title: form.title.trim(),
        reparto: form.reparto || null,
        body: form.body.trim() || null,
        aumento: sec.kind === "cause" ? (form.aumento.trim() || null) : null,
        diminuzione: sec.kind === "cause" ? (form.diminuzione.trim() || null) : null,
        file_path,
        revision: form.revision.trim() || null,
        revision_date: form.revision_date || null,
        updated_by: currentUser,
        updated_at: new Date().toISOString(),
      };
      if (hasDetail) payload.detail = detail;

      let dbErr;
      if (form.id) {
        ({ error: dbErr } = await supabase.from("prontuario_items").update(payload).eq("id", form.id));
      } else {
        ({ error: dbErr } = await supabase
          .from("prontuario_items")
          .insert({ ...payload, created_by: currentUser }));
      }
      if (dbErr) throw new Error("Salvataggio non riuscito: " + dbErr.message);

      if (oldPathToDelete) await supabase.storage.from(BUCKET).remove([oldPathToDelete]);

      setForm(null);
      await load();
    } catch (e) {
      setFormError(e.message);
    }
    setSaving(false);
  };

  const remove = async (it) => {
    if (!window.confirm(`Eliminare definitivamente "${it.title}"?`)) return;
    setRowError(null);
    const { error } = await supabase.from("prontuario_items").delete().eq("id", it.id);
    if (error) { setRowError("Eliminazione non riuscita: " + error.message); return; }
    if (it.file_path) await supabase.storage.from(BUCKET).remove([it.file_path]);
    setSelId(null);
    await load();
  };

  const openFile = async (it) => {
    setRowError(null);
    setOpeningId(it.id);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(it.file_path, 300);
    setOpeningId(null);
    if (error || !data?.signedUrl) {
      setRowError("Impossibile aprire il file: " + (error?.message || "errore sconosciuto"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const repTag = (id) => {
    if (!id) return <span className="pr-note">—</span>;
    const r = repartoMap[id];
    if (!r) return <span className="pr-reparto" style={{ background: "#f1f5f9", color: "#475569" }}>{id}</span>;
    return (
      <span className="pr-reparto" style={{ background: r.bg, color: r.text }}>
        {r.icon} {r.label}
      </span>
    );
  };

  const adminCell = (it) =>
    isMaster ? (
      <>
        <button className="pr-btn ghost" onClick={() => openEdit(it)}>Modifica</button>
        <button className="pr-btn danger" onClick={() => remove(it)}>Elimina</button>
      </>
    ) : null;

  const renderDocRows = (list) =>
    list.map((it) => (
      <tr key={it.id}>
        <td>
          <b><Mark text={it.title} term={term} /></b>
          {searching && <div><span className="pr-sect-tag">{secOf(it.section)?.icon} {secOf(it.section)?.label}</span></div>}
          {it.body && <div className="pr-body"><Mark text={it.body} term={term} /></div>}
        </td>
        <td>{repTag(it.reparto)}</td>
        <td>{it.revision || it.revision_date ? `${it.revision ? "Rev. " + it.revision : ""}${it.revision && it.revision_date ? " · " : ""}${fmtDate(it.revision_date)}` : "—"}</td>
        <td>
          <div className="pr-actions">
            {it.file_path ? (
              <button className="pr-btn" disabled={openingId === it.id} onClick={() => openFile(it)}>
                {openingId === it.id ? "Apro…" : "Apri PDF"}
              </button>
            ) : (
              <span className="pr-note">nessun file</span>
            )}
            {adminCell(it)}
          </div>
        </td>
      </tr>
    ));

  // elenco parametri (sezione "cause")
  const paramList = useMemo(() => {
    const list = sectionItems.filter((i) => repFilter === "tutti" || i.reparto === repFilter);
    const g = {};
    list.forEach((i) => {
      const k = i.reparto || "_";
      (g[k] = g[k] || []).push(i);
    });
    return g;
  }, [sectionItems, repFilter]);

  const usedReparti = useMemo(() => {
    const ids = new Set(sectionItems.map((i) => i.reparto).filter(Boolean));
    return (reparti || []).filter((r) => ids.has(r.id));
  }, [sectionItems, reparti]);

  const formSec = form ? secOf(form.section) : null;

  const showCauseView = section === "cause" && !searching && selItem;
  const showParamGrid = section === "cause" && !searching && !selItem;
  const showDsView = section === "datasheet" && !searching && selItem && selItem.detail;
  const showDsGrid = section === "datasheet" && !searching && !showDsView;
  const dsCards = sectionItems.filter((i) => i.detail && (specFilter === "tutti" || i.detail.specie === specFilter));
  const dsPlain = sectionItems.filter((i) => !i.detail);
  const dsSpecies = Array.from(new Set(sectionItems.map((i) => i.detail && i.detail.specie).filter(Boolean)));

  return (
    <div>
      <style>{CSS}</style>
      <div className="pr-wrap">
        <div className="pr-side">
          <div className="pr-side-title">SEZIONI</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={"pr-side-btn " + (section === s.id && !searching ? "on" : "")}
              onClick={() => { setSection(s.id); setQ(""); setForm(null); setSelId(null); setHl(""); }}
            >
              <span>{s.icon} {s.label}</span>
              <span className="pr-count">{counts[s.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="pr-main">
          <div className="pr-head">
            <div className="pr-title">
              {searching
                ? `Risultati per "${term}" (${results.docs.length + results.hits.length})`
                : (showCauseView || showDsView) ? "" : `${currentSec.icon} ${currentSec.label}`}
            </div>
            {isMaster && !searching && !form && !showCauseView && !showDsView && (
              <button className="pr-btn" onClick={openNew}>+ Aggiungi</button>
            )}
          </div>

          <input
            className="pr-search"
            type="search"
            aria-label="Cerca nel Prontuario"
            placeholder="Cerca un parametro, una causa, un reagente, una SOP… (es. emolisi, EDTA, linfoma)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {loadError && <div className="pr-err">Errore nel caricamento del Prontuario: {loadError}</div>}
          {rowError && <div className="pr-err">{rowError}</div>}

          {form && (
            <div className="pr-form">
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {form.id ? "Modifica voce" : "Nuova voce"} · {formSec.icon} {formSec.label}
              </div>
              <label>
                {formSec.kind === "cause" ? "Parametro" : "Titolo"}
                <input value={form.title} onChange={(e) => setF("title", e.target.value)} />
              </label>
              <div className="pr-row">
                <label>
                  Settore
                  <select value={form.reparto} onChange={(e) => setF("reparto", e.target.value)}>
                    <option value="">— nessuno / generale —</option>
                    {(reparti || []).map((r) => (
                      <option key={r.id} value={r.id}>{r.icon} {r.label}</option>
                    ))}
                  </select>
                </label>
                {formSec.kind === "doc" && (
                  <label>
                    Revisione
                    <input value={form.revision} onChange={(e) => setF("revision", e.target.value)} placeholder="es. 3" />
                  </label>
                )}
              </div>
              {formSec.kind === "doc" && (
                <label>
                  Data revisione
                  <input type="date" value={form.revision_date} onChange={(e) => setF("revision_date", e.target.value)} />
                </label>
              )}
              {formSec.kind === "cause" ? (
                <>
                  <label>
                    Scheda strutturata (JSON, avanzato: di norma la carico io)
                    <textarea className="pr-json" value={form.detailText} onChange={(e) => setF("detailText", e.target.value)} />
                  </label>
                  <label>
                    Oppure testo semplice: cause di aumento
                    <textarea value={form.aumento} onChange={(e) => setF("aumento", e.target.value)} />
                  </label>
                  <label>
                    Oppure testo semplice: cause di diminuzione
                    <textarea value={form.diminuzione} onChange={(e) => setF("diminuzione", e.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Note / testo (facoltativo, ricercabile)
                    <textarea value={form.body} onChange={(e) => setF("body", e.target.value)} />
                  </label>
                  {formSec.id === "datasheet" && (
                    <label>
                      Scheda strutturata (JSON, avanzato: di norma la carico io)
                      <textarea className="pr-json" value={form.detailText} onChange={(e) => setF("detailText", e.target.value)} />
                    </label>
                  )}
                  <label>
                    File PDF (max {MAX_MB} MB)
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => setF("newFile", e.target.files?.[0] || null)}
                    />
                  </label>
                  {form.file_path && !form.newFile && (
                    <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={form.removeFile}
                        onChange={(e) => setF("removeFile", e.target.checked)}
                      />
                      Rimuovi il file attuale
                    </label>
                  )}
                  {form.file_path && form.newFile && (
                    <div className="pr-note">Il nuovo file sostituirà quello attuale.</div>
                  )}
                </>
              )}
              {formError && <div className="pr-err">{formError}</div>}
              <div className="pr-actions">
                <button className="pr-btn" disabled={saving} onClick={save}>
                  {saving ? "Salvo…" : "Salva"}
                </button>
                <button className="pr-btn ghost" disabled={saving} onClick={() => setForm(null)}>Annulla</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="pr-empty">Caricamento…</div>
          ) : searching ? (
            results.docs.length + results.hits.length === 0 ? (
              <div className="pr-empty">Nessun risultato.</div>
            ) : (
              <>
                {results.hits.length > 0 && (
                  <>
                    <div className="pr-grp">📈🧪 SCHEDE: CAUSE, INTERFERENZE E LIMITI DI MISURA</div>
                    {results.hits.map((h, i) => (
                      <button key={i} className="pr-hit" onClick={() => goTo(h)}>
                        <span className="p">{secOf(h.item.section)?.icon} {h.item.title} {repTag(h.item.reparto)}</span>
                        <span className="w">{h.where}{h.level && <span className={"pr-lvtag " + h.level}>{LV[h.level].label}</span>}</span>
                        <span className="s"><Mark text={snippet(h.text, term)} term={term} /></span>
                      </button>
                    ))}
                  </>
                )}
                {results.docs.length > 0 && (
                  <>
                    <div className="pr-grp">📄 DOCUMENTI</div>
                    <div className="pr-tablebox">
                      <table className="pr-table">
                        <thead>
                          <tr>
                            <th>Documento</th>
                            <th style={{ width: "18%" }}>Settore</th>
                            <th style={{ width: "20%" }}>Revisione</th>
                            <th style={{ width: isMaster ? "28%" : "14%" }}></th>
                          </tr>
                        </thead>
                        <tbody>{renderDocRows(results.docs)}</tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )
          ) : showCauseView ? (
            <CauseView
              item={selItem}
              tab={tab}
              setTab={setTab}
              openKeys={openKeys}
              setOpenKeys={setOpenKeys}
              term={hl}
              isMaster={isMaster}
              onEdit={openEdit}
              onDelete={remove}
              onBack={backToList}
              repTag={repTag}
            />
          ) : showDsView ? (
            <DatasheetView
              item={selItem}
              term={hl}
              isMaster={isMaster}
              onEdit={openEdit}
              onDelete={remove}
              onBack={backToList}
              repTag={repTag}
              openFile={openFile}
              opening={openingId === selItem.id}
            />
          ) : showDsGrid && dsCards.length + dsPlain.length > 0 && dsCards.length > 0 ? (
            <>
              {dsSpecies.length > 1 && (
                <div className="pr-chips">
                  {["tutti", ...dsSpecies].map((sp) => (
                    <button key={sp} className={"pr-chip " + (specFilter === sp ? "on" : "")} onClick={() => setSpecFilter(sp)}>
                      {sp === "tutti" ? "Tutti" : sp === "umano" ? "Uso umano" : "🐕 " + sp.charAt(0).toUpperCase() + sp.slice(1)}
                    </button>
                  ))}
                </div>
              )}
              <div className="pr-grid">
                {dsCards.map((it) => (
                  <button key={it.id} className="pr-pbtn" onClick={() => openParam(it)}>
                    <span>{it.title}</span>
                    <small>{it.detail.specie === "umano" ? "umano" : "🐕 " + it.detail.specie}</small>
                  </button>
                ))}
              </div>
              {dsPlain.length > 0 && (
                <>
                  <div className="pr-grp">ALTRI DOCUMENTI</div>
                  <div className="pr-tablebox">
                    <table className="pr-table">
                      <thead><tr><th>Documento</th><th style={{ width: "18%" }}>Settore</th><th style={{ width: "20%" }}>Revisione</th><th style={{ width: isMaster ? "28%" : "14%" }}></th></tr></thead>
                      <tbody>{renderDocRows(dsPlain)}</tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : showParamGrid ? (
            sectionItems.length === 0 ? (
              <div className="pr-empty">Nessun parametro ancora. I contenuti verranno aggiunti a breve.</div>
            ) : (
              <>
                {usedReparti.length > 1 && (
                  <div className="pr-chips">
                    <button className={"pr-chip " + (repFilter === "tutti" ? "on" : "")} onClick={() => setRepFilter("tutti")}>Tutti</button>
                    {usedReparti.map((r) => (
                      <button key={r.id} className={"pr-chip " + (repFilter === r.id ? "on" : "")} onClick={() => setRepFilter(r.id)}>
                        {r.icon} {r.label}
                      </button>
                    ))}
                  </div>
                )}
                {Object.keys(paramList).map((k) => (
                  <div key={k}>
                    <div className="pr-grp">
                      {k === "_" ? "GENERALI" : `${repartoMap[k]?.icon || ""} ${(repartoMap[k]?.label || k).toUpperCase()}`}
                    </div>
                    <div className="pr-grid">
                      {paramList[k].map((it) => (
                        <button key={it.id} className="pr-pbtn" onClick={() => openParam(it)}>
                          <span>{it.title}</span>
                          <small>
                            {it.detail ? `▲ ${(it.detail.aumento || []).length} · ▼ ${(it.detail.diminuzione || []).length}` : ""}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )
          ) : sectionItems.length === 0 ? (
            <div className="pr-empty">Nessuna voce in questa sezione. I contenuti verranno aggiunti a breve.</div>
          ) : (
            <div className="pr-tablebox">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th style={{ width: "18%" }}>Settore</th>
                    <th style={{ width: "20%" }}>Revisione</th>
                    <th style={{ width: isMaster ? "28%" : "14%" }}></th>
                  </tr>
                </thead>
                <tbody>{renderDocRows(sectionItems)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
