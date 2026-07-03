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
  const [replyDrafts, setReplyDrafts] = useState({});

  const fetchEntries = useCallback(async () => {
    const { data, error } = await supabase.from("entries").select("*").order("created_at", { ascending: false });
    if (!error) setEntries(data || []);
  }, []);

  const fetchBriefings = useCallback(async () => {
    const { data, error } = await supabase.from("briefings").select("*").order("created_at", { ascending: false });
    if (!error) setBriefings(data || []);
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
    await supabase.from("entries").insert({
      reparto: selectedReparto,
      category: activeCategory,
      text,
      open_by: currentUser,
      cc: newEntryCC,
    });
  };

  const toggleDone = async (item) => {
    if (!item.done) {
      await supabase.from("entries").update({ done: true, resolved_by: currentUser, resolved_at: new Date().toISOString() }).eq("id", item.id);
    } else {
      await supabase.from("entries").update({ done: false, resolved_by: null, resolved_at: null }).eq("id", item.id);
    }
  };

  const toggleTag = async (item) => {
    await supabase.from("entries").update({ cc: !item.cc }).eq("id", item.id);
  };

  const sendReply = async (item) => {
    const text = (replyDrafts[item.id] || "").trim();
    if (!text) return;
    setReplyDrafts((p) => ({ ...p, [item.id]: "" }));
    const nextReplies = [...(item.replies || []), { author: currentUser, text, time: new Date().toISOString() }];
    await supabase.from("entries").update({ replies: nextReplies }).eq("id", item.id);
  };

  const addBriefing = async () => {
    const text = briefInput.trim();
    if (!text) return;
    setBriefInput("");
    await supabase.from("briefings").insert({ operator: currentUser, text });
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

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? entries.filter((e) => [e.text, e.open_by, e.resolved_by || "", reparto(e.reparto).label, catInfo(e.category).label].join(" ").toLowerCase().includes(q))
    : [];

  const scoped = selectedReparto ? entries.filter((e) => e.reparto === selectedReparto) : [];

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
          </div>
        </div>
      </div>

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
                      <ItemRow key={item.id} item={item} showTags onToggle={toggleDone} onTag={toggleTag} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} onReply={sendReply} />
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
                                <ItemRow key={item.id} item={item} onToggle={toggleDone} onTag={toggleTag} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} onReply={sendReply} />
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
                <textarea className="brief-input" value={briefInput} onChange={(e) => setBriefInput(e.target.value)} placeholder="Riepilogo del briefing: situazione, criticità, priorità..." />
                <button className="brief-btn" onClick={addBriefing}>Salva</button>
              </div>
              {briefings.map((b) => (
                <div className="brief-item" key={b.id}>
                  <div className="brief-meta">{b.operator} · {fmtTime(b.created_at)}</div>
                  <div className="brief-text">{b.text}</div>
                </div>
              ))}
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

function ItemRow({ item, onToggle, onTag, replyDrafts, setReplyDrafts, onReply, showTags }) {
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
        {item.cc && <Thread item={item} draft={replyDrafts[item.id] || ""} setDraft={(v) => setReplyDrafts((p) => ({ ...p, [item.id]: v }))} onSend={() => onReply(item)} />}
      </div>
    </div>
  );
}
