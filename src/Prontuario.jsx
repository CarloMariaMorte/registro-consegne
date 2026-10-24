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
.pr-side-btn { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; text-align:left; padding:9px 12px; border:none; border-radius:6px; background:transparent; font-family:inherit; font-size:12.5px; color:#1e293b; cursor:pointer; }
.pr-side-btn:hover { background:#f1f5f9; }
.pr-side-btn.on { background:#f0fdfa; color:#0f766e; font-weight:600; }
.pr-count { font-size:10.5px; font-weight:700; background:#f1f5f9; color:#475569; border-radius:999px; padding:1px 7px; }
.pr-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:14px; }
.pr-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.pr-title { font-size:16px; font-weight:700; }
.pr-search { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-family:inherit; font-size:12.5px; }
.pr-search:focus { outline:none; border-color:#0f766e; box-shadow:0 0 0 2px #ccfbf1; }
.pr-tablebox { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; overflow-x:auto; }
.pr-table { width:100%; border-collapse:collapse; font-size:12.5px; }
.pr-table th { text-align:left; color:#475569; font-weight:600; padding:9px 12px; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
.pr-table td { padding:10px 12px; border-bottom:1px solid #f1f5f9; vertical-align:top; color:#334155; line-height:1.5; white-space:pre-wrap; }
.pr-table tr:last-child td { border-bottom:none; }
.pr-sect-tag { display:inline-block; font-size:10px; padding:1px 8px; border-radius:999px; background:#f1f5f9; color:#475569; font-weight:600; margin-top:4px; }
.pr-reparto { display:inline-block; font-size:10.5px; padding:1px 8px; border-radius:999px; font-weight:600; white-space:nowrap; }
.pr-btn { padding:6px 12px; border-radius:6px; background:#0f766e; color:#fff; border:none; font-family:inherit; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
.pr-btn:hover { background:#115e59; }
.pr-btn:disabled { opacity:.5; cursor:default; }
.pr-btn.ghost { background:#fff; color:#334155; border:1px solid #cbd5e1; }
.pr-btn.ghost:hover { background:#f1f5f9; }
.pr-btn.danger { background:#fff; color:#b91c1c; border:1px solid #fca5a5; }
.pr-btn.danger:hover { background:#fef2f2; }
.pr-actions { display:flex; gap:6px; flex-wrap:wrap; }
.pr-empty { padding:28px; text-align:center; color:#64748b; font-size:13px; border:1px dashed #cbd5e1; border-radius:8px; }
.pr-form { border:1px solid #99f6e4; background:#f0fdfa; border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:10px; }
.pr-form label { font-size:11.5px; font-weight:600; color:#475569; display:flex; flex-direction:column; gap:4px; }
.pr-form input, .pr-form select, .pr-form textarea { padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit; font-size:12.5px; background:#fff; }
.pr-form textarea { resize:vertical; min-height:70px; line-height:1.5; }
.pr-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.pr-err { color:#b91c1c; font-size:12px; font-weight:600; }
.pr-note { font-size:11px; color:#64748b; }
.pr-body { font-size:12px; color:#475569; margin-top:4px; }
@media (max-width:760px) { .pr-wrap { flex-direction:column; } .pr-side { width:100%; flex-direction:row; flex-wrap:wrap; } .pr-row { grid-template-columns:1fr; } }
`;

function fmtDate(d) {
  if (!d) return "";
  const [y, m, g] = String(d).split("-");
  return g && m && y ? `${g}/${m}/${y}` : d;
}

export default function Prontuario({ isMaster, currentUser, reparti }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [section, setSection] = useState("sop");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // null = chiuso; oggetto = apri
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [rowError, setRowError] = useState(null);

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

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items.filter((i) => i.section === section);
    return items.filter((i) =>
      [i.title, i.body, i.aumento, i.diminuzione, i.reparto, i.revision]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(term))
    );
  }, [items, section, q]);

  const currentSec = SECTIONS.find((s) => s.id === section);

  const openNew = () => {
    setFormError(null);
    setForm({
      id: null, section, title: "", reparto: "", body: "", aumento: "", diminuzione: "",
      revision: "", revision_date: "", file_path: null, newFile: null, removeFile: false,
    });
  };

  const openEdit = (it) => {
    setFormError(null);
    setForm({
      ...it,
      reparto: it.reparto || "", body: it.body || "", aumento: it.aumento || "",
      diminuzione: it.diminuzione || "", revision: it.revision || "",
      revision_date: it.revision_date || "", newFile: null, removeFile: false,
    });
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setFormError("Il titolo è obbligatorio."); return; }
    const sec = SECTIONS.find((s) => s.id === form.section);
    if (form.newFile && form.newFile.size > MAX_MB * 1024 * 1024) {
      setFormError(`Il file supera ${MAX_MB} MB.`); return;
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

  const secLabel = (id) => SECTIONS.find((s) => s.id === id);

  const adminCell = (it) =>
    isMaster ? (
      <div className="pr-actions">
        <button className="pr-btn ghost" onClick={() => openEdit(it)}>Modifica</button>
        <button className="pr-btn danger" onClick={() => remove(it)}>Elimina</button>
      </div>
    ) : null;

  const renderDocRows = (list) =>
    list.map((it) => (
      <tr key={it.id}>
        <td>
          <b>{it.title}</b>
          {searching && <div><span className="pr-sect-tag">{secLabel(it.section)?.icon} {secLabel(it.section)?.label}</span></div>}
          {it.body && <div className="pr-body">{it.body}</div>}
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

  const renderCauseRows = (list) =>
    list.map((it) => (
      <tr key={it.id}>
        <td>
          <b>{it.title}</b>
          {searching && <div><span className="pr-sect-tag">{secLabel(it.section)?.icon} {secLabel(it.section)?.label}</span></div>}
        </td>
        <td>{repTag(it.reparto)}</td>
        <td>{it.aumento || it.body || "—"}</td>
        <td>{it.diminuzione || "—"}</td>
        {isMaster && <td>{adminCell(it)}</td>}
      </tr>
    ));

  // in ricerca: separa i risultati per tipo di tabella
  const docList = visible.filter((i) => secLabel(i.section)?.kind === "doc");
  const causeList = visible.filter((i) => secLabel(i.section)?.kind === "cause");

  const formSec = form ? SECTIONS.find((s) => s.id === form.section) : null;

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
              onClick={() => { setSection(s.id); setQ(""); setForm(null); }}
            >
              <span>{s.icon} {s.label}</span>
              <span className="pr-count">{counts[s.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="pr-main">
          <div className="pr-head">
            <div className="pr-title">
              {searching ? `Risultati della ricerca (${visible.length})` : `${currentSec.icon} ${currentSec.label}`}
            </div>
            {isMaster && !searching && !form && (
              <button className="pr-btn" onClick={openNew}>+ Aggiungi</button>
            )}
          </div>

          <input
            className="pr-search"
            type="search"
            aria-label="Cerca nel Prontuario"
            placeholder="Cerca un parametro, un reagente, una SOP..."
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
                    Cause di aumento
                    <textarea value={form.aumento} onChange={(e) => setF("aumento", e.target.value)} />
                  </label>
                  <label>
                    Cause di diminuzione
                    <textarea value={form.diminuzione} onChange={(e) => setF("diminuzione", e.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Note / testo (facoltativo, ricercabile)
                    <textarea value={form.body} onChange={(e) => setF("body", e.target.value)} />
                  </label>
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
          ) : visible.length === 0 ? (
            <div className="pr-empty">
              {searching
                ? "Nessun risultato."
                : "Nessuna voce in questa sezione. I contenuti verranno aggiunti a breve."}
            </div>
          ) : (
            <>
              {docList.length > 0 && (
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
                    <tbody>{renderDocRows(docList)}</tbody>
                  </table>
                </div>
              )}
              {causeList.length > 0 && (
                <div className="pr-tablebox">
                  <table className="pr-table">
                    <thead>
                      <tr>
                        <th style={{ width: "18%" }}>Parametro</th>
                        <th style={{ width: "14%" }}>Settore</th>
                        <th>Cause di aumento</th>
                        <th>Cause di diminuzione</th>
                        {isMaster && <th style={{ width: "16%" }}></th>}
                      </tr>
                    </thead>
                    <tbody>{renderCauseRows(causeList)}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
