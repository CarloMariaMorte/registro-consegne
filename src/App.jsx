import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const REPARTI = [
  { id: "ematologia", label: "Ematologia", icon: "🩸" },
  { id: "urine", label: "Urine", icon: "💧" },
  { id: "foresi", label: "Elettroforesi", icon: "📈" },
  { id: "coag", label: "Coagulazione", icon: "⏱️" },
  { id: "chimica_ormo", label: "Chimica & Ormo", icon: "⚗️" },
];

const CATEGORIES = [
  { id: "sospesi", label: "Sospesi", icon: "🧪" },
  { id: "anomalie", label: "Anomalie strumentali", icon: "⚠️" },
  { id: "urgenze", label: "Urgenze", icon: "⚡" },
  { id: "note", label: "Note", icon: "📝" },
];

const reparto = (id) => REPARTI.find((r) => r.id === id) || { label: id, icon: "" };
const catInfo = (id) => CATEGORIES.find((c) => c.id === id) || { label: id, icon: "" };
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");

const isSameDay = (iso) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const isCurrentMonth = (iso) => {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};
const isArchived = (item) => item.done && item.resolved_at && !isSameDay(item.resolved_at);

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Oggi";
  if (sameDay(d, yesterday)) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [entries, setEntries] = useState([]);
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const [activePanel, setActivePanel] = useState("registro");
  const [selectedReparto, setSelectedReparto] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("sospesi");
  const [newEntryText, setNewEntryText] = useState("");
  const [newEntryCC, setNewEntryCC] = useState(false);
  const [briefInput, setBriefInput] = useState("");
  const [draftPoints, setDraftPoints] = useState([]);
  const [briefTagsInput, setBriefTagsInput] = useState("");
  const [briefTagFilter, setBriefTagFilter] = useState(null);
  const [expandedBriefId, setExpandedBriefId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);

  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editEntryText, setEditEntryText] = useState("");
  const [editingBriefId, setEditingBriefId] = useState(null);
  const [editBriefText, setEditBriefText] = useState("");

  const currentUser = profile?.display_name || profile?.email || null;
  const isMaster = !!profile?.is_master;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!session) { setProfile(null); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    setProfile(data || null);
  }, [session]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleLogin = async () => {
    setAuthBusy(true); setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    if (error) setAuthError(error.message);
    setAuthBusy(false);
  };

  const handleSignup = async () => {
    setAuthBusy(true); setAuthError(null);
    const email = authEmail.trim().toLowerCase();
    if (!email.endsWith("@mylav.net")) { setAuthError("Usa un indirizzo email @mylav.net"); setAuthBusy(false); return; }
    if (authPassword.length < 6) { setAuthError("La password deve avere almeno 6 caratteri"); setAuthBusy(false); return; }
    const { error } = await supabase.auth.signUp({ email, password: authPassword });
    if (error) { setAuthError(error.message); setAuthBusy(false); return; }
    setSignupDone(true);
    setAuthBusy(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const saveDisplayName = async () => {
    const v = nameInput.trim();
    if (!v) return;
    await supabase.from("profiles").update({ display_name: v }).eq("id", session.user.id);
    fetchProfile();
  };

  const fetchEntries = useCallback(async () => {
    const { data, error } = await supabase.from("entries").select("*").order("created_at", { ascending: false });
    if (error) { setErrorMsg("Errore nel caricare il registro: " + error.message); return; }
    setEntries(data || []);
  }, []);

  const fetchBriefings = useCallback(async () => {
    const { data, error } = await supabase.from("briefings").select("*").order("created_at", { ascending: false });
    if (error) { setErrorMsg("Errore nel caricare i briefing: " + error.message); return; }
    setBriefings(data || []);
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      await Promise.all([fetchEntries(), fetchBriefings()]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("registro-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, fetchEntries)
      .on("postgres_changes", { event: "*", schema: "public", table: "briefings" }, fetchBriefings)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => supabase.removeChannel(channel);
  }, [session, fetchEntries, fetchBriefings]);

  const addEntry = async () => {
    const text = newEntryText.trim();
    if (!text || !selectedReparto) return;
    setNewEntryText("");
    setNewEntryCC(false);
    const { error } = await supabase.from("entries").insert({
      reparto: selectedReparto,
      category: activeCategory,
      text,
      open_by: currentUser,
      cc: newEntryCC,
    });
    if (error) { setErrorMsg("Errore nel salvare la voce: " + error.message); return; }
    setErrorMsg(null);
    fetchEntries();
  };

  const toggleDone = async (item) => {
    const { error } = !item.done
      ? await supabase.from("entries").update({ done: true, resolved_by: currentUser, resolved_at: new Date().toISOString() }).eq("id", item.id)
      : await supabase.from("entries").update({ done: false, resolved_by: null, resolved_at: null }).eq("id", item.id);
    if (error) { setErrorMsg("Errore nell'aggiornare la voce: " + error.message); return; }
    setErrorMsg(null);
    fetchEntries();
  };

  const toggleTag = async (item) => {
    const { error } = await supabase.from("entries").update({ cc: !item.cc }).eq("id", item.id);
    if (error) { setErrorMsg("Errore nel taggare la voce: " + error.message); return; }
    setErrorMsg(null);
    fetchEntries();
  };

  const sendReply = async (item) => {
    const text = (replyDrafts[item.id] || "").trim();
    if (!text) return;
    setReplyDrafts((p) => ({ ...p, [item.id]: "" }));
    const nextReplies = [...(item.replies || []), { author: currentUser, text, time: new Date().toISOString() }];
    const { error } = await supabase.from("entries").update({ replies: nextReplies }).eq("id", item.id);
    if (error) { setErrorMsg("Errore nell'inviare la risposta: " + error.message); return; }
    setErrorMsg(null);
    fetchEntries();
  };

  const sendCommunication = async (item) => {
    setSendingEmailId(item.id);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: item.text,
          reparto: reparto(item.reparto).label,
          category: catInfo(item.category).label,
          operator: currentUser,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Invio fallito");
      const { error } = await supabase.from("entries").update({ email_sent: true, email_sent_by: currentUser, email_sent_at: new Date().toISOString() }).eq("id", item.id);
      if (error) throw error;
      setErrorMsg(null);
      fetchEntries();
    } catch (e) {
      setErrorMsg("Errore nell'invio della comunicazione: " + e.message);
    } finally {
      setSendingEmailId(null);
    }
  };

  const addPointToDraft = () => {
    const v = briefInput.trim();
    if (!v) return;
    setDraftPoints((p) => [...p, v]);
    setBriefInput("");
  };
  const removeDraftPoint = (idx) => setDraftPoints((p) => p.filter((_, i) => i !== idx));

  const addBriefing = async () => {
    const points = briefInput.trim() ? [...draftPoints, briefInput.trim()] : draftPoints;
    if (points.length === 0) return;
    const tags = briefTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    setDraftPoints([]);
    setBriefInput("");
    setBriefTagsInput("");
    const { error } = await supabase.from("briefings").insert({ operator: currentUser, points, tags, views: [] });
    if (error) { setErrorMsg("Errore nel salvare il riepilogo: " + error.message); return; }
    setErrorMsg(null);
    fetchBriefings();
  };

  const markBriefingViewed = async (b) => {
    const already = (b.views || []).some((v) => v.name === currentUser);
    if (already) return;
    const nextViews = [...(b.views || []), { name: currentUser, time: new Date().toISOString() }];
    const { error } = await supabase.from("briefings").update({ views: nextViews }).eq("id", b.id);
    if (!error) fetchBriefings();
  };

  const toggleExpandBrief = (b) => {
    if (expandedBriefId === b.id) { setExpandedBriefId(null); return; }
    setExpandedBriefId(b.id);
    markBriefingViewed(b);
  };

  const startEditEntry = (item) => { setEditingEntryId(item.id); setEditEntryText(item.text); };
  const cancelEditEntry = () => { setEditingEntryId(null); setEditEntryText(""); };
  const saveEditEntry = async (item) => {
    const text = editEntryText.trim();
    if (!text) return;
    const { error } = await supabase.from("entries").update({ text }).eq("id", item.id);
    if (error) { setErrorMsg("Errore nel modificare la voce: " + error.message); return; }
    setErrorMsg(null);
    setEditingEntryId(null);
    fetchEntries();
  };
  const toggleHideEntry = async (item) => {
    const { error } = await supabase.from("entries").update({ hidden: !item.hidden }).eq("id", item.id);
    if (error) { setErrorMsg("Errore nel nascondere la voce: " + error.message); return; }
    setErrorMsg(null);
    fetchEntries();
  };

  const startEditBrief = (b) => {
    setEditingBriefId(b.id);
    const pts = (b.points && b.points.length) ? b.points : (b.text ? [b.text] : []);
    setEditBriefText(pts.join("\n"));
  };
  const cancelEditBrief = () => { setEditingBriefId(null); setEditBriefText(""); };
  const saveEditBrief = async (b) => {
    const points = editBriefText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!points.length) return;
    const { error } = await supabase.from("briefings").update({ points, text: null }).eq("id", b.id);
    if (error) { setErrorMsg("Errore nel modificare il riepilogo: " + error.message); return; }
    setErrorMsg(null);
    setEditingBriefId(null);
    fetchBriefings();
  };
  const toggleHideBrief = async (b) => {
    const { error } = await supabase.from("briefings").update({ hidden: !b.hidden }).eq("id", b.id);
    if (error) { setErrorMsg("Errore nel nascondere il riepilogo: " + error.message); return; }
    setErrorMsg(null);
    fetchBriefings();
  };

  if (authLoading) {
    return <div className="gate"><div className="gate-sub" style={{ color: "#94a3b8" }}>Caricamento...</div></div>;
  }

  if (!session) {
    return (
      <div className="gate">
        <div className="gate-box">
          <div className="gate-title">{authMode === "login" ? "Accedi" : "Crea account"}</div>
          <div className="gate-sub">
            {authMode === "login" ? "Registro Consegne e Comunicazioni Interne." : "Solo indirizzi email @mylav.net possono registrarsi."}
          </div>

          {signupDone ? (
            <div className="auth-info">
              Account creato. Controlla la tua casella email per confermare, poi torna qui ad accedere.
              <button className="auth-toggle" onClick={() => { setSignupDone(false); setAuthMode("login"); }}>Torna al login</button>
            </div>
          ) : (
            <>
              <input className="gate-input" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
              <input className="gate-input" type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (authMode === "login" ? handleLogin() : handleSignup())} />
              {authError && <div className="auth-error">{authError}</div>}
              <button className="gate-btn" disabled={authBusy} onClick={authMode === "login" ? handleLogin : handleSignup}>
                {authBusy ? "..." : authMode === "login" ? "Entra →" : "Crea account →"}
              </button>
              <button className="auth-toggle" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(null); }}>
                {authMode === "login" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="gate"><div className="gate-sub" style={{ color: "#94a3b8" }}>Caricamento profilo...</div></div>;
  }

  if (!profile.display_name) {
    return (
      <div className="gate">
        <div className="gate-box">
          <div className="gate-title">Come ti chiami?</div>
          <div className="gate-sub">Il tuo nome sarà usato per firmare tutto quello che scrivi.</div>
          <input autoFocus className="gate-input" placeholder="Nome e cognome" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveDisplayName()} />
          <button className="gate-btn" onClick={saveDisplayName}>Continua →</button>
        </div>
      </div>
    );
  }

  const visibleEntries = entries.filter((e) => !e.hidden);
  const hiddenEntries = entries.filter((e) => e.hidden);
  const visibleBriefingsAll = briefings.filter((b) => !b.hidden);
  const hiddenBriefings = briefings.filter((b) => b.hidden);

  const openCount = visibleEntries.filter((e) => !e.done).length;
  const ccCount = visibleEntries.filter((e) => e.cc && !e.done).length;
  const ccEntries = visibleEntries.filter((e) => e.cc);
  const archivedEntries = visibleEntries.filter((e) => isArchived(e) && isCurrentMonth(e.resolved_at)).sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? visibleEntries.filter((e) => [e.text, e.open_by, e.resolved_by || "", reparto(e.reparto).label, catInfo(e.category).label].join(" ").toLowerCase().includes(q))
    : [];

  const scoped = selectedReparto ? visibleEntries.filter((e) => e.reparto === selectedReparto && !isArchived(e)) : [];

  const allBriefTags = [...new Set(visibleBriefingsAll.flatMap((b) => b.tags || []))];
  const visibleBriefings = briefTagFilter ? visibleBriefingsAll.filter((b) => (b.tags || []).includes(briefTagFilter)) : visibleBriefingsAll;

  const entryHandlers = {
    onToggle: toggleDone, onTag: toggleTag, replyDrafts, setReplyDrafts, onReply: sendReply,
    onSendEmail: sendCommunication, sendingEmailId, isMaster,
    editingId: editingEntryId, editText: editEntryText, setEditText: setEditEntryText,
    onStartEdit: startEditEntry, onSaveEdit: saveEditEntry, onCancelEdit: cancelEditEntry, onHide: toggleHideEntry,
  };

  return (
    <div className="wrap">
      <div className="bar">
        <div>
          <span className="brand">📋 Registro Consegne e Comunicazioni Interne</span>
          <span className="whoami">
            sei <b>{currentUser}</b>{isMaster && <span className="master-tag">master</span>}
            <a onClick={handleLogout}>esci</a>
          </span>
        </div>
        <div className="bar-right">
          <span className={"live-dot " + (connected ? "on" : "")} title={connected ? "connesso in tempo reale" : "connessione..."} />
          <div className="seg">
            <button className={"seg-btn " + (activePanel === "registro" ? "active" : "")} onClick={() => setActivePanel("registro")}>
              Registro <span className="badge">{openCount}</span>
            </button>
            <button className={"seg-btn " + (activePanel === "briefing" ? "active" : "")} onClick={() => setActivePanel("briefing")}>
              Briefing
            </button>
            <button className={"seg-btn " + (activePanel === "cc" ? "active" : "")} onClick={() => setActivePanel("cc")}>
              Customer Care <span className="badge pink">{ccCount}</span>
            </button>
            <button className={"seg-btn " + (activePanel === "archivio" ? "active" : "")} onClick={() => setActivePanel("archivio")}>
              Archivio <span className="badge">{archivedEntries.length}</span>
            </button>
            {isMaster && (
              <button className={"seg-btn " + (activePanel === "nascosti" ? "active" : "")} onClick={() => setActivePanel("nascosti")}>
                Nascosti <span className="badge">{hiddenEntries.length + hiddenBriefings.length}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: "8px 16px", fontSize: 12, borderBottom: "1px solid #fecaca" }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="hint" style={{ padding: 24, textAlign: "center" }}>Caricamento registro condiviso...</div>
      ) : (
        <>
          {activePanel === "registro" && (
            <div className="panel active">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input className="search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cerca nome, specie, problema, ID, settore..." />
              </div>

              {q ? (
                <>
                  <div className="hint" style={{ padding: "0 0 10px" }}>{searchResults.length} risultati in tutti i settori</div>
                  {searchResults.length === 0 ? (
                    <div className="empty">Nessun risultato.</div>
                  ) : (
                    searchResults.map((item) => <ItemRow key={item.id} item={item} showTags {...entryHandlers} />)
                  )}
                </>
              ) : (
                <>
                  <div className="pillrow">
                    {REPARTI.map((r) => {
                      const n = visibleEntries.filter((e) => e.reparto === r.id && !e.done).length;
                      const active = selectedReparto === r.id;
                      return (
                        <button key={r.id} className={"pill " + (active ? "active" : "")} onClick={() => setSelectedReparto(active ? null : r.id)}>
                          {r.icon} {r.label} <span className="cnt">{n}</span>
                        </button>
                      );
                    })}
                  </div>

                  {!selectedReparto ? (
                    <div className="hint">Seleziona un settore ↑ per vedere il registro.</div>
                  ) : (
                    <>
                      <div className="form">
                        <div className="chips">
                          {CATEGORIES.map((c) => (
                            <button key={c.id} className={"chip " + (activeCategory === c.id ? "on-" + c.id : "")} onClick={() => setActiveCategory(c.id)}>
                              {c.icon} {c.label}
                            </button>
                          ))}
                          <span className="chip-sep" />
                          <button className={"cc-chip " + (newEntryCC ? "on" : "")} onClick={() => setNewEntryCC(!newEntryCC)}>
                            🏷️ Notifica Customer Care
                          </button>
                        </div>
                        <div className="row">
                          <input className="txt-input" value={newEntryText} onChange={(e) => setNewEntryText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Es. Referto XY da completare, campione con specie da verificare..." />
                          <button className="btn" onClick={addEntry}>+ Aggiungi</button>
                        </div>
                      </div>

                      {scoped.length === 0 ? (
                        <div className="empty">Nessuna voce in questo settore.</div>
                      ) : (
                        CATEGORIES.map((cat) => {
                          const items = scoped.filter((e) => e.category === cat.id);
                          if (!items.length) return null;
                          const openN = items.filter((i) => !i.done).length;
                          return (
                            <div className="grp" key={cat.id}>
                              <div className="grp-h">{cat.icon} {cat.label} <span className="cnt">{openN} aperte</span></div>
                              {items.map((item) => <ItemRow key={item.id} item={item} {...entryHandlers} />)}
                            </div>
                          );
                        })
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activePanel === "briefing" && (
            <div className="panel active">
              <div className="brief-form">
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="row">
                    <input className="txt-input" value={briefInput} onChange={(e) => setBriefInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPointToDraft(); } }}
                      placeholder="Scrivi un punto e premi invio per aggiungerlo alla lista..." />
                    <button className="btn" onClick={addPointToDraft}>+ Punto</button>
                  </div>
                  {draftPoints.length > 0 && (
                    <ul className="draft-points">
                      {draftPoints.map((p, i) => (
                        <li key={i}>{p} <button className="remove-point" onClick={() => removeDraftPoint(i)}>×</button></li>
                      ))}
                    </ul>
                  )}
                  <input className="txt-input" value={briefTagsInput} onChange={(e) => setBriefTagsInput(e.target.value)} placeholder="Tag separati da virgola, es. straordinari, turni" />
                </div>
                <button className="brief-btn" onClick={addBriefing}>Salva riepilogo</button>
              </div>

              {allBriefTags.length > 0 && (
                <div className="pillrow">
                  <button className={"pill " + (!briefTagFilter ? "active" : "")} onClick={() => setBriefTagFilter(null)}>Tutti</button>
                  {allBriefTags.map((t) => (
                    <button key={t} className={"pill " + (briefTagFilter === t ? "active" : "")} onClick={() => setBriefTagFilter(briefTagFilter === t ? null : t)}>#{t}</button>
                  ))}
                </div>
              )}

              {visibleBriefings.length === 0 ? (
                <div className="empty">Nessun riepilogo {briefTagFilter ? "con questo tag" : "salvato"}.</div>
              ) : (
                (() => {
                  let lastLabel = null;
                  return visibleBriefings.map((b) => {
                    const label = dayLabel(b.created_at);
                    const showHeader = label !== lastLabel;
                    lastLabel = label;
                    const isEditing = editingBriefId === b.id;
                    const isExpanded = expandedBriefId === b.id;
                    const pts = (b.points && b.points.length) ? b.points : (b.text ? [b.text] : []);
                    const views = b.views || [];
                    return (
                      <React.Fragment key={b.id}>
                        {showHeader && <div className="day-header">{label}</div>}
                        <div className="brief-card" onClick={() => !isEditing && toggleExpandBrief(b)}>
                          <div className="brief-top">
                            <div className="brief-meta">
                              {b.operator} · {fmtTime(b.created_at)}
                              <span className="brief-count">{pts.length} punt{pts.length === 1 ? "o" : "i"}</span>
                              {views.length > 0 && <span className="brief-views">👁 {views.length}</span>}
                            </div>
                            {isMaster && !isEditing && (
                              <div className="master-actions" onClick={(e) => e.stopPropagation()}>
                                <button className="master-btn" onClick={() => startEditBrief(b)} title="Modifica">✏️</button>
                                <button className="master-btn" onClick={() => toggleHideBrief(b)} title="Nascondi">🙈</button>
                              </div>
                            )}
                          </div>

                          {isEditing ? (
                            <div onClick={(e) => e.stopPropagation()}>
                              <textarea className="edit-textarea" value={editBriefText} onChange={(e) => setEditBriefText(e.target.value)} placeholder="Un punto per riga" />
                              <div className="edit-actions">
                                <button className="btn" onClick={() => saveEditBrief(b)}>Salva</button>
                                <button className="cancel-btn" onClick={cancelEditBrief}>Annulla</button>
                              </div>
                            </div>
                          ) : isExpanded ? (
                            <>
                              <ul className="brief-points">
                                {pts.map((p, i) => <li key={i}>{p}</li>)}
                              </ul>
                              {views.length > 0 && (
                                <div className="brief-readby">Letto da: {views.map((v) => v.name).join(", ")}</div>
                              )}
                            </>
                          ) : (
                            <div className="brief-preview">{pts[0]}{pts.length > 1 ? "…" : ""}</div>
                          )}

                          {(b.tags || []).length > 0 && (
                            <div className="brief-tags" onClick={(e) => e.stopPropagation()}>
                              {b.tags.map((t) => <span key={t} className="brief-tag" onClick={() => setBriefTagFilter(t)}>#{t}</span>)}
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  });
                })()
              )}
            </div>
          )}

          {activePanel === "archivio" && (
            <div className="panel active">
              <div className="panel-intro">Voci risolte, archiviate automaticamente dal giorno dopo la chiusura. Visibili qui fino a fine mese in corso.</div>
              {archivedEntries.length === 0 ? (
                <div className="empty">Nessuna voce archiviata questo mese.</div>
              ) : (
                archivedEntries.map((item) => <ItemRow key={item.id} item={item} showTags {...entryHandlers} />)
              )}
            </div>
          )}

          {activePanel === "cc" && (
            <div className="panel active">
              <div className="panel-intro">Tutte le note taggate 🏷️ da qualsiasi settore. Rispondi qui per comunicare col laboratorio — la risposta appare anche nella nota originale.</div>
              {ccEntries.length === 0 ? (
                <div className="empty">Nessuna nota taggata al momento.</div>
              ) : (
                ccEntries.map((item) => (
                  <div className="cc-card" key={item.id}>
                    <div className="cc-tags">
                      <span className="cc-tag">{reparto(item.reparto).icon} {reparto(item.reparto).label}</span>
                      <span className="cc-tag">{catInfo(item.category).icon} {catInfo(item.category).label}</span>
                      {item.done && <span className="cc-tag">risolto</span>}
                    </div>
                    <div className="txt">{item.text}</div>
                    <Trace item={item} />
                    <EmailBox item={item} onSend={sendCommunication} sendingId={sendingEmailId} />
                    <Thread item={item} draft={replyDrafts[item.id] || ""} setDraft={(v) => setReplyDrafts((p) => ({ ...p, [item.id]: v }))} onSend={() => sendReply(item)} />
                  </div>
                ))
              )}
            </div>
          )}

          {activePanel === "nascosti" && isMaster && (
            <div className="panel active">
              <div className="panel-intro">Visibile solo a chi ha permessi da master. Le voci nascoste non sono cancellate: puoi sempre farle ricomparire.</div>
              <div className="grp-h" style={{ marginBottom: 8 }}>Voci nascoste</div>
              {hiddenEntries.length === 0 ? (
                <div className="empty">Nessuna voce nascosta.</div>
              ) : (
                hiddenEntries.map((item) => <ItemRow key={item.id} item={item} showTags {...entryHandlers} />)
              )}
              <div className="grp-h" style={{ margin: "18px 0 8px" }}>Riepiloghi briefing nascosti</div>
              {hiddenBriefings.length === 0 ? (
                <div className="empty">Nessun riepilogo nascosto.</div>
              ) : (
                hiddenBriefings.map((b) => {
                  const pts = (b.points && b.points.length) ? b.points : (b.text ? [b.text] : []);
                  return (
                    <div className="brief-card" key={b.id}>
                      <div className="brief-top">
                        <div className="brief-meta">{b.operator} · {fmtTime(b.created_at)}</div>
                        <div className="master-actions">
                          <button className="master-btn" onClick={() => toggleHideBrief(b)} title="Mostra">👁️</button>
                        </div>
                      </div>
                      <ul className="brief-points">
                        {pts.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Trace({ item }) {
  return (
    <div className="trace">
      <div className="trace-line">aperto da <b>{item.open_by}</b> · {fmtTime(item.open_at)}</div>
      {item.done && <div className="trace-line resolved">→ risolto da <b>{item.resolved_by}</b> · {fmtTime(item.resolved_at)}</div>}
    </div>
  );
}

function EmailBox({ item, onSend, sendingId }) {
  const isSending = sendingId === item.id;
  return (
    <div className="email-box">
      {item.email_sent && <div className="email-sent-note">📧 Comunicazione inviata da <b>{item.email_sent_by}</b> · {fmtTime(item.email_sent_at)}</div>}
      <button className="email-btn" onClick={() => onSend(item)} disabled={isSending}>
        {isSending ? "Invio in corso..." : item.email_sent ? "Invia di nuovo" : "📧 Invia comunicazione"}
      </button>
    </div>
  );
}

function Thread({ item, draft, setDraft, onSend }) {
  return (
    <div className="cc-thread">
      {(item.replies || []).map((r, i) => (
        <div className="cc-reply" key={i}>
          <div className="cc-reply-meta">{r.author} · {fmtTime(r.time)}</div>
          <div className="cc-reply-text">{r.text}</div>
        </div>
      ))}
      <div className="cc-reply-form">
        <input className="cc-reply-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder="Rispondi in questa nota..." />
        <button className="cc-reply-btn" onClick={onSend}>Invia</button>
      </div>
    </div>
  );
}

function ItemRow({ item, onToggle, onTag, replyDrafts, setReplyDrafts, onReply, showTags, onSendEmail, sendingEmailId, isMaster, editingId, editText, setEditText, onStartEdit, onSaveEdit, onCancelEdit, onHide }) {
  const isEditing = editingId === item.id;
  return (
    <div className={"item " + (item.done ? "done " : "") + (item.cc ? "tagged" : "") + (item.hidden ? " hidden-item" : "")}>
      <div className="chk" onClick={() => onToggle(item)} />
      <div className="item-b">
        <div className="item-top">
          {isEditing ? (
            <textarea className="edit-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} />
          ) : (
            <div className="txt">{item.text}</div>
          )}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button className={"tag-btn " + (item.cc ? "on" : "")} onClick={() => onTag(item)} title="Notifica Customer Care">🏷️</button>
            {isMaster && !isEditing && <button className="master-btn" onClick={() => onStartEdit(item)} title="Modifica">✏️</button>}
            {isMaster && <button className="master-btn" onClick={() => onHide(item)} title={item.hidden ? "Mostra" : "Nascondi"}>{item.hidden ? "👁️" : "🙈"}</button>}
          </div>
        </div>
        {isEditing && (
          <div className="edit-actions">
            <button className="btn" onClick={() => onSaveEdit(item)}>Salva</button>
            <button className="cancel-btn" onClick={onCancelEdit}>Annulla</button>
          </div>
        )}
        {showTags && <div className="grp-h" style={{ marginTop: 5 }}>{reparto(item.reparto).icon} {reparto(item.reparto).label} · {catInfo(item.category).icon} {catInfo(item.category).label}</div>}
        <Trace item={item} />
        {item.cc && (
          <>
            <EmailBox item={item} onSend={onSendEmail} sendingId={sendingEmailId} />
            <Thread item={item} draft={replyDrafts[item.id] || ""} setDraft={(v) => setReplyDrafts((p) => ({ ...p, [item.id]: v }))} onSend={() => onReply(item)} />
          </>
        )}
      </div>
    </div>
  );
}
