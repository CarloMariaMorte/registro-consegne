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
  const [currentUser, setCurrentUser] = useState(null);
  const [gateInput, setGateInput] = useState("");

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
  const [briefTagsInput, setBriefTagsInput] = useState("");
  const [briefTagFilter, setBriefTagFilter] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);

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
  }, [fetchEntries, fetchBriefings]);

  const enter = () => {
    const v = gateInput.trim();
    if (v) setCurrentUser(v);
  };

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

  const addBriefing = async () => {
    const text = briefInput.trim();
    if (!text) return;
    const tags = briefTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    setBriefInput("");
    setBriefTagsInput("");
    const { error } = await supabase.from("briefings").insert({ operator: currentUser, text, tags });
    if (error) { setErrorMsg("Errore nel salvare il riepilogo: " + error.message); return; }
    setErrorMsg(null);
    fetchBriefings();
  };

  // ---------- gate ----------
  if (!currentUser) {
    return (
      <div className="gate">
        <div className="gate-box">
          <div className="gate-title">Chi sei?</div>
          <div className="gate-sub">Il nome resta associato a tutto quello che scrivi o risolvi, come una firma.</div>
          <input
            autoFocus
            className="gate-input"
            value={gateInput}
            onChange={(e) => setGateInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="Nome e cognome"
          />
          <button className="gate-btn" onClick={enter}>Entra →</button>
        </div>
      </div>
    );
  }

  const openCount = entries.filter((e) => !e.done).length;
  const ccCount = entries.filter((e) => e.cc && !e.done).length;
  const ccEntries = entries.filter((e) => e.cc);
  const archivedEntries = entries.filter((e) => isArchived(e) && isCurrentMonth(e.resolved_at)).sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? entries.filter((e) => [e.text, e.open_by, e.resolved_by || "", reparto(e.reparto).label, catInfo(e.category).label].join(" ").toLowerCase().includes(q))
    : [];

  const scoped = selectedReparto ? entries.filter((e) => e.reparto === selectedReparto && !isArchived(e)) : [];

  const allBriefTags = [...new Set(briefings.flatMap((b) => b.tags || []))];
  const visibleBriefings = briefTagFilter ? briefings.filter((b) => (b.tags || []).includes(briefTagFilter)) : briefings;

  return (
    <div className="wrap">
      <div className="bar">
        <div>
          <span className="brand">📋 Registro Consegne e Comunicazioni Interne</span>
          <span className="whoami">
            sei <b>{currentUser}</b>
            <a onClick={() => { setCurrentUser(null); setGateInput(""); }}>cambia</a>
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
                    searchResults.map((item) => (
                      <ItemRow key={item.id} item={item} showTags onToggle={toggleDone} onTag={toggleTag} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} onReply={sendReply} onSendEmail={sendCommunication} sendingEmailId={sendingEmailId} />
                    ))
                  )}
                </>
              ) : (
                <>
                  <div className="pillrow">
                    {REPARTI.map((r) => {
                      const n = entries.filter((e) => e.reparto === r.id && !e.done).length;
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
                              {items.map((item) => (
                                <ItemRow key={item.id} item={item} onToggle={toggleDone} onTag={toggleTag} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} onReply={sendReply} onSendEmail={sendCommunication} sendingEmailId={sendingEmailId} />
                              ))}
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
                  <textarea className="brief-input" value={briefInput} onChange={(e) => setBriefInput(e.target.value)} placeholder="Riepilogo del briefing: situazione, criticità, priorità..." />
                  <input className="txt-input" value={briefTagsInput} onChange={(e) => setBriefTagsInput(e.target.value)} placeholder="Tag separati da virgola, es. straordinari, turni" />
                </div>
                <button className="brief-btn" onClick={addBriefing}>Salva</button>
              </div>

              {allBriefTags.length > 0 && (
                <div className="pillrow">
                  <button className={"pill " + (!briefTagFilter ? "active" : "")} onClick={() => setBriefTagFilter(null)}>Tutti</button>
                  {allBriefTags.map((t) => (
                    <button key={t} className={"pill " + (briefTagFilter === t ? "active" : "")} onClick={() => setBriefTagFilter(briefTagFilter === t ? null : t)}>
                      #{t}
                    </button>
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
                    return (
                      <React.Fragment key={b.id}>
                        {showHeader && <div className="day-header">{label}</div>}
                        <div className="brief-item">
                          <div className="brief-meta">{b.operator} · {fmtTime(b.created_at)}</div>
                          <div className="brief-text">{b.text}</div>
                          {(b.tags || []).length > 0 && (
                            <div className="brief-tags">
                              {b.tags.map((t) => (
                                <span key={t} className="brief-tag" onClick={() => setBriefTagFilter(t)}>#{t}</span>
                              ))}
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
                archivedEntries.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={toggleDone} onTag={toggleTag} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} onReply={sendReply} showTags onSendEmail={sendCommunication} sendingEmailId={sendingEmailId} />
                ))
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
      {item.email_sent && (
        <div className="email-sent-note">📧 Comunicazione inviata da <b>{item.email_sent_by}</b> · {fmtTime(item.email_sent_at)}</div>
      )}
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

function ItemRow({ item, onToggle, onTag, replyDrafts, setReplyDrafts, onReply, showTags, onSendEmail, sendingEmailId }) {
  return (
    <div className={"item " + (item.done ? "done " : "") + (item.cc ? "tagged" : "")}>
      <div className="chk" onClick={() => onToggle(item)} />
      <div className="item-b">
        <div className="item-top">
          <div className="txt">{item.text}</div>
          <button className={"tag-btn " + (item.cc ? "on" : "")} onClick={() => onTag(item)} title="Notifica Customer Care">🏷️</button>
        </div>
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
