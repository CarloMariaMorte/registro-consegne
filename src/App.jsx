import React, { useState, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "./supabaseClient";

const REPARTI = [
  { id: "ematologia", label: "Ematologia", icon: "🩸", bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5", accent: "#ef4444" },
  { id: "urine", label: "Urine", icon: "💧", bg: "#fef9c3", text: "#a16207", border: "#fde047", accent: "#eab308" },
  { id: "foresi", label: "Elettroforesi", icon: "📈", bg: "#dcfce7", text: "#166534", border: "#86efac", accent: "#22c55e" },
  { id: "coag", label: "Coagulazione", icon: "⏱️", bg: "#fdf2f8", text: "#db2777", border: "#f9a8d4", accent: "#ec4899" },
  { id: "chimica_ormo", label: "Chimica & Ormo", icon: "⚗️", bg: "#ecfeff", text: "#0e7490", border: "#67e8f9", accent: "#06b6d4" },
];

const CATEGORIES = [
  { id: "sospesi", label: "Sospesi", icon: "🧪" },
  { id: "anomalie", label: "Anomalie strumentali", icon: "⚠️" },
  { id: "urgenze", label: "Urgenze", icon: "⚡" },
  { id: "note", label: "Note", icon: "📝" },
  { id: "programmati", label: "Programmati", icon: "📅" },
  { id: "contestazioni", label: "Contestazioni", icon: "⚖️" },
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
const todayStr = () => new Date().toISOString().slice(0, 10);
const isStale = (item) => {
  if (item.done) return false;
  if (item.category === "programmati") {
    return !!item.scheduled_date && item.scheduled_date < todayStr();
  }
  return !!item.open_at && !isSameDay(item.open_at);
};
const isDueToday = (item) => item.category === "programmati" && item.scheduled_date === todayStr() && !item.done;
const fmtDate = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
};
const fmtDateShort = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

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

const POINT_SEP = "\n\n---\n\n";

function formatPointHtml(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return html;
}

function formatEntryTextHtml(text, profiles) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const names = (profiles || []).map((p) => p.display_name).filter(Boolean).sort((a, b) => b.length - a.length);
  let html = esc;
  names.forEach((name) => {
    const escName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp("@" + escName, "g"), `<span class="mention">@${name}</span>`);
  });
  return html;
}

function extractMentions(text, profiles) {
  const names = (profiles || []).map((p) => p.display_name).filter(Boolean);
  return names.filter((name) => text.includes("@" + name));
}

function generateReportPdf(report) {
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("Report Giornaliero — Campioni Sospesi", 14, y);
  y += 7;
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Inviato da ${report.operator} · ${fmtDateShort(report.created_at)} ${fmtTime(report.created_at)}`, 14, y);
  y += 10;
  (report.sections || []).forEach((section) => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(section.reparto, 14, y);
    y += 6;
    doc.setFontSize(9.5);
    section.items.forEach((item) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(`• ${item.text}`, 178);
      doc.text(lines, 18, y);
      y += lines.length * 5;
      doc.setFontSize(8.5);
      doc.setTextColor(15, 118, 110);
      const byline = `Nota di ${item.author} · ore ${item.time}`;
      doc.text(byline, 18, y);
      if (item.emailSent) {
        const bylineWidth = doc.getTextWidth(byline);
        doc.setTextColor(185, 28, 28);
        doc.setFont(undefined, "bold");
        doc.text(`   ⚠ Comunicazione interna già inviata — ${item.emailSentBy}, ${item.emailSentAt}`, 18 + bylineWidth, y);
        doc.setFont(undefined, "normal");
      }
      doc.setFontSize(9.5);
      y += 8;
    });
    y += 4;
  });
  doc.output("dataurlnewwindow");
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
  const [dailyReports, setDailyReports] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const [activePanel, setActivePanel] = useState("registro");
  const [selectedReparto, setSelectedReparto] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [resolvedOpen, setResolvedOpen] = useState({});
  const [expandedThreads, setExpandedThreads] = useState({});
  const [sharePickerOpen, setSharePickerOpen] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("sospesi");
  const [newEntryText, setNewEntryText] = useState("");
  const [newEntryCC, setNewEntryCC] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState("");
  const [briefInput, setBriefInput] = useState("");
  const [draftPoints, setDraftPoints] = useState([]);
  const [briefTagsInput, setBriefTagsInput] = useState("");
  const [briefTagFilter, setBriefTagFilter] = useState(null);
  const [expandedBriefId, setExpandedBriefId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);
  const [reportMsg, setReportMsg] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState(null);
  const [sendingDailyReport, setSendingDailyReport] = useState(false);

  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editEntryText, setEditEntryText] = useState("");
  const [editingBriefId, setEditingBriefId] = useState(null);
  const [editBriefText, setEditBriefText] = useState("");
  const [editBriefTags, setEditBriefTags] = useState("");

  const [showPwPanel, setShowPwPanel] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwError, setPwError] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

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

  const changePassword = async () => {
    setPwError(null);
    if (pwNew.length < 6) { setPwError("La password deve avere almeno 6 caratteri"); return; }
    if (pwNew !== pwNew2) { setPwError("Le due password non coincidono"); return; }
    setPwBusy(true);
    const { error: rpcErr } = await supabase.rpc("check_and_record_password", { new_password: pwNew });
    if (rpcErr) { setPwError(rpcErr.message); setPwBusy(false); return; }
    const { error: updErr } = await supabase.auth.updateUser({ password: pwNew });
    if (updErr) { setPwError(updErr.message); setPwBusy(false); return; }
    setPwBusy(false);
    setPwNew(""); setPwNew2("");
    setShowPwPanel(false);
    fetchProfile();
  };

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

  const fetchDailyReports = useCallback(async () => {
    const { data, error } = await supabase.from("daily_reports").select("*").order("created_at", { ascending: false });
    if (error) { setErrorMsg("Errore nel caricare lo storico report: " + error.message); return; }
    setDailyReports(data || []);
  }, []);

  const fetchAllProfiles = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("id, display_name").not("display_name", "is", null);
    if (!error) setAllProfiles(data || []);
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      await Promise.all([fetchEntries(), fetchBriefings(), fetchDailyReports(), fetchAllProfiles()]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("registro-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, fetchEntries)
      .on("postgres_changes", { event: "*", schema: "public", table: "briefings" }, fetchBriefings)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_reports" }, fetchDailyReports)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => supabase.removeChannel(channel);
  }, [session, fetchEntries, fetchBriefings, fetchDailyReports, fetchAllProfiles]);

  const addEntry = async () => {
    const text = newEntryText.trim();
    if (!text || !selectedReparto) return;
    if (activeCategory === "programmati" && !newEntryDate) { setErrorMsg("Seleziona una data per la voce programmata"); return; }
    setNewEntryText("");
    setNewEntryCC(false);
    const mentions = extractMentions(text, allProfiles);
    const { error } = await supabase.from("entries").insert({
      reparto: selectedReparto,
      category: activeCategory,
      text,
      open_by: currentUser,
      cc: newEntryCC,
      scheduled_date: activeCategory === "programmati" ? newEntryDate : null,
      shared_with: [],
      mentions,
    });
    setNewEntryDate("");
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

  const toggleShareTarget = async (item, targetId) => {
    const has = (item.shared_with || []).includes(targetId);
    const nextShared = has ? item.shared_with.filter((x) => x !== targetId) : [...(item.shared_with || []), targetId];
    const { error } = await supabase.from("entries").update({ shared_with: nextShared }).eq("id", item.id);
    if (error) { setErrorMsg("Errore nel condividere la voce: " + error.message); return; }
    setErrorMsg(null);
    fetchEntries();
  };

  const toggleSharePicker = (id) => setSharePickerOpen((p) => ({ ...p, [id]: !p[id] }));
  const toggleThread = (id) => setExpandedThreads((p) => ({ ...p, [id]: !p[id] }));

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

  const sendDailyReport = async () => {
    const openSospesi = entries.filter((e) => !e.hidden && e.category === "sospesi" && !e.done);
    if (openSospesi.length === 0) { setErrorMsg("Nessun sospeso aperto da segnalare al momento."); return; }
    const sections = REPARTI.map((r) => ({
      reparto: r.label,
      items: openSospesi.filter((e) => e.reparto === r.id).map((e) => ({
        text: e.text,
        author: e.open_by,
        time: fmtTime(e.open_at),
        emailSent: !!e.email_sent,
        emailSentBy: e.email_sent_by || null,
        emailSentAt: e.email_sent_at ? fmtTime(e.email_sent_at) : null,
      })),
    })).filter((s) => s.items.length > 0);

    setSendingDailyReport(true);
    try {
      const res = await fetch("/api/send-daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: currentUser, sections }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Invio fallito");
      await supabase.from("daily_reports").insert({ operator: currentUser, sections });
      setErrorMsg(null);
      setReportMsg(`Report giornaliero inviato: ${openSospesi.length} sospesi in ${sections.length} settori.`);
      fetchDailyReports();
    } catch (e) {
      setErrorMsg("Errore nell'invio del report giornaliero: " + e.message);
    } finally {
      setSendingDailyReport(false);
    }
  };

  const addPointToDraft = () => {
    const v = briefInput.trim();
    if (!v) return;
    setDraftPoints((p) => [...p, v]);
    setBriefInput("");
  };
  const removeDraftPoint = (idx) => setDraftPoints((p) => p.filter((_, i) => i !== idx));

  const addBriefing = async (publish) => {
    const points = briefInput.trim() ? [...draftPoints, briefInput.trim()] : draftPoints;
    if (points.length === 0) return;
    const tags = briefTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    setDraftPoints([]);
    setBriefInput("");
    setBriefTagsInput("");
    const { error } = await supabase.from("briefings").insert({ operator: currentUser, points, tags, views: [], published: publish });
    if (error) { setErrorMsg("Errore nel salvare il riepilogo: " + error.message); return; }
    setErrorMsg(null);
    fetchBriefings();
  };

  const publishBriefing = async (b) => {
    const { error } = await supabase.from("briefings").update({ published: true }).eq("id", b.id);
    if (error) { setErrorMsg("Errore nel pubblicare il riepilogo: " + error.message); return; }
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
    setEditBriefText(pts.join(POINT_SEP));
    setEditBriefTags((b.tags || []).join(", "));
  };
  const cancelEditBrief = () => { setEditingBriefId(null); setEditBriefText(""); setEditBriefTags(""); };
  const saveEditBrief = async (b) => {
    const points = editBriefText.split(POINT_SEP).map((s) => s.trim()).filter(Boolean);
    if (!points.length) return;
    const tags = editBriefTags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("briefings").update({ points, text: null, tags }).eq("id", b.id);
    if (error) { setErrorMsg("Errore nel modificare il riepilogo: " + error.message); return; }
    setErrorMsg(null);
    setEditingBriefId(null);
    fetchBriefings();
  };
  const deleteBriefingDraft = async (b) => {
    if (!window.confirm("Eliminare completamente questa bozza? Non si può recuperare.")) return;
    const { error } = await supabase.from("briefings").delete().eq("id", b.id);
    if (error) { setErrorMsg("Errore nell'eliminare la bozza: " + error.message); return; }
    setErrorMsg(null);
    if (editingBriefId === b.id) cancelEditBrief();
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

  const passwordAgeDays = profile ? Math.floor((Date.now() - new Date(profile.password_changed_at).getTime()) / 86400000) : 0;
  const passwordExpired = profile && passwordAgeDays > 90;

  if (passwordExpired || showPwPanel) {
    return (
      <div className="gate">
        <div className="gate-box">
          <div className="gate-title">{passwordExpired ? "Password scaduta" : "Cambia password"}</div>
          <div className="gate-sub">
            {passwordExpired
              ? "Per sicurezza, la password va rinnovata ogni 3 mesi. Impostane una nuova per continuare."
              : "Scegli una nuova password. Non puoi riusare una delle ultime password usate."}
          </div>
          <input className="gate-input" type="password" placeholder="Nuova password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
          <input className="gate-input" type="password" placeholder="Ripeti nuova password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword()} />
          {pwError && <div className="auth-error">{pwError}</div>}
          <button className="gate-btn" disabled={pwBusy} onClick={changePassword}>{pwBusy ? "..." : "Aggiorna password →"}</button>
          {!passwordExpired && (
            <button className="auth-toggle" onClick={() => { setShowPwPanel(false); setPwError(null); setPwNew(""); setPwNew2(""); }}>Annulla</button>
          )}
        </div>
      </div>
    );
  }

  const visibleEntries = entries.filter((e) => !e.hidden);
  const hiddenEntries = entries.filter((e) => e.hidden);
  const visibleBriefingsAll = briefings.filter((b) => !b.hidden && b.published !== false);
  const myDrafts = isMaster ? briefings.filter((b) => !b.hidden && b.published === false) : [];
  const hiddenBriefings = briefings.filter((b) => b.hidden);

  const openCount = visibleEntries.filter((e) => !e.done).length;
  const ccCount = visibleEntries.filter((e) => e.cc && !e.done).length;
  const ccEntries = visibleEntries.filter((e) => e.cc);
  const isMentioned = (e) => (e.mentions || []).includes(currentUser) || (e.replies || []).some((r) => r.text && r.text.includes("@" + currentUser));
  const mentionsCount = visibleEntries.filter((e) => isMentioned(e) && !e.done).length;
  const myMentions = visibleEntries.filter((e) => isMentioned(e));
  const archivedEntries = visibleEntries.filter((e) => isArchived(e) && isCurrentMonth(e.resolved_at)).sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? visibleEntries.filter((e) => [e.text, e.open_by, e.resolved_by || "", reparto(e.reparto).label, catInfo(e.category).label].join(" ").toLowerCase().includes(q))
    : [];

  const scoped = selectedReparto ? visibleEntries.filter((e) => (e.reparto === selectedReparto || (e.shared_with || []).includes(selectedReparto)) && !isArchived(e)) : [];

  const allBriefTags = [...new Set(visibleBriefingsAll.flatMap((b) => b.tags || []))];
  const visibleBriefings = briefTagFilter ? visibleBriefingsAll.filter((b) => (b.tags || []).includes(briefTagFilter)) : visibleBriefingsAll;

  const allProgrammatiToday = visibleEntries.filter((e) => e.category === "programmati" && !e.done && e.scheduled_date === todayStr());
  const allProgrammatiUpcoming = visibleEntries
    .filter((e) => e.category === "programmati" && !e.done && e.scheduled_date && e.scheduled_date !== todayStr())
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  const entryHandlers = {
    onToggle: toggleDone, onTag: toggleTag, replyDrafts, setReplyDrafts, onReply: sendReply,
    onSendEmail: sendCommunication, sendingEmailId, isMaster,
    editingId: editingEntryId, editText: editEntryText, setEditText: setEditEntryText,
    onStartEdit: startEditEntry, onSaveEdit: saveEditEntry, onCancelEdit: cancelEditEntry, onHide: toggleHideEntry,
    expandedThreads, onToggleThread: toggleThread,
    sharePickerOpen, onToggleSharePicker: toggleSharePicker, onShareTarget: toggleShareTarget,
    allProfiles,
  };

  return (
    <div className="wrap">
      <div className="bar">
        <div>
          <span className="brand">📋 Registro Consegne e Comunicazioni Interne</span>
          <span className="whoami">
            sei <b>{currentUser}</b>{isMaster && <span className="master-tag">master</span>}
            <a onClick={() => setShowPwPanel(true)}>cambia password</a>
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
            <button className={"seg-btn " + (activePanel === "menzioni" ? "active" : "")} onClick={() => setActivePanel("menzioni")}>
              Menzioni <span className="badge">{mentionsCount}</span>
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
      {reportMsg && (
        <div style={{ background: "#f0fdf4", color: "#166534", padding: "8px 16px", fontSize: 12, borderBottom: "1px solid #bbf7d0" }}>
          ✅ {reportMsg}
        </div>
      )}

      {loading ? (
        <div className="hint" style={{ padding: 24, textAlign: "center" }}>Caricamento registro condiviso...</div>
      ) : (
        <>
          {activePanel === "registro" && (
            <div className="app-layout">
              <div className="sidebar">
                <div className="cal-title">📅 Programmati — tutti i settori</div>
                <div className="cal-section">Oggi</div>
                {allProgrammatiToday.length === 0 ? (
                  <div className="cal-empty">Nessun programmato per oggi.</div>
                ) : allProgrammatiToday.map((e) => {
                  const r = reparto(e.reparto);
                  return (
                    <div key={e.id} className="cal-item today" style={{ borderLeft: `4px solid ${r.accent}` }}>
                      {e.text}
                      <span className="cal-tag" style={{ background: "rgba(255,255,255,.25)", color: "#fff" }}>{r.icon} {r.label}</span>
                    </div>
                  );
                })}
                <div className="cal-section">Prossimi giorni</div>
                {allProgrammatiUpcoming.length === 0 ? (
                  <div className="cal-empty">Nulla nei prossimi giorni.</div>
                ) : allProgrammatiUpcoming.map((e) => {
                  const r = reparto(e.reparto);
                  return (
                    <div key={e.id} className="cal-item" style={{ borderLeft: `4px solid ${r.accent}` }}>
                      <span className="cal-date">{fmtDate(e.scheduled_date)}</span>
                      {e.text}
                      <span className="cal-tag" style={{ background: r.bg, color: r.text }}>{r.icon} {r.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="main-content">
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
                        const n = visibleEntries.filter((e) => (e.reparto === r.id || (e.shared_with || []).includes(r.id)) && !e.done).length;
                        const active = selectedReparto === r.id;
                        return (
                          <button key={r.id} className={"pill " + (active ? "active" : "")} style={{ borderBottom: `4px solid ${r.accent}` }} onClick={() => { setSelectedReparto(active ? null : r.id); setCategoryFilter("all"); }}>
                            {r.icon} {r.label} <span className="cnt">{n}</span>
                          </button>
                        );
                      })}
                    </div>

                    {!selectedReparto ? (
                      <div className="hint">Seleziona un settore ↑ per vedere il registro.</div>
                    ) : (
                      <>
                        <div className="reparto-heading" style={{ borderLeftColor: reparto(selectedReparto).accent }}>
                          {reparto(selectedReparto).icon} Sei nella bacheca {reparto(selectedReparto).label}
                        </div>

                        <div className="field-label">Filtra per categoria</div>
                        <div className="pillrow">
                          <button className={"pill " + (categoryFilter === "all" ? "active" : "")} onClick={() => setCategoryFilter("all")}>
                            Tutte <span className="cnt">{scoped.filter((e) => !e.done).length}</span>
                          </button>
                          {CATEGORIES.map((c) => {
                            const n = scoped.filter((e) => e.category === c.id && !e.done).length;
                            return (
                              <button key={c.id} className={"pill " + (categoryFilter === c.id ? "active" : "")} onClick={() => setCategoryFilter(c.id)}>
                                {c.icon} {c.label} <span className="cnt">{n}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="field-label">✍️ Scrivi qui la nota per questo settore</div>
                        {activeCategory === "sospesi" && (
                          <div className="sospesi-hint">💡 Ricorda: inizia la nota con il cognome del proprietario del campione (serve per l'oggetto delle comunicazioni automatiche al Customer Care)</div>
                        )}
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
                            <div className="mention-wrap" style={{ flex: 1 }}>
                              <input
                                className="txt-input"
                                style={{ width: "100%" }}
                                value={newEntryText}
                                onChange={(e) => setNewEntryText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addEntry()}
                                placeholder="Es. Referto XY da completare, oppure scrivi @ per citare qualcuno..."
                              />
                              {(() => {
                                const m = newEntryText.match(/@([A-Za-zÀ-ÿ' .]*)$/);
                                if (!m) return null;
                                const partial = m[1].toLowerCase();
                                const matches = allProfiles.filter((p) => p.display_name && p.display_name.toLowerCase().includes(partial)).slice(0, 6);
                                if (!matches.length) return null;
                                return (
                                  <div className="mention-dropdown">
                                    {matches.map((p) => (
                                      <div
                                        key={p.id}
                                        className="mention-item"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setNewEntryText(newEntryText.replace(/@([A-Za-zÀ-ÿ' .]*)$/, "@" + p.display_name + " "));
                                        }}
                                      >
                                        {p.display_name}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                            {activeCategory === "programmati" && (
                              <input type="date" className="date-input" value={newEntryDate} onChange={(e) => setNewEntryDate(e.target.value)} />
                            )}
                            <button className="btn" onClick={addEntry}>+ Aggiungi</button>
                          </div>
                        </div>

                        {(() => {
                          const cats = categoryFilter === "all" ? CATEGORIES : CATEGORIES.filter((c) => c.id === categoryFilter);
                          if (scoped.length === 0) return <div className="empty">Nessuna voce in questo settore.</div>;
                          return cats.map((cat) => {
                            const items = scoped.filter((e) => e.category === cat.id);
                            if (!items.length) {
                              if (categoryFilter === "all") return null;
                              return (
                                <div className="grp" key={cat.id}>
                                  <div className="grp-h">{cat.icon} {cat.label} <span className="cnt">0 aperte</span></div>
                                  <div className="empty">Nessuna voce in questa categoria.</div>
                                </div>
                              );
                            }
                            const open = items.filter((i) => !i.done);
                            const resolved = items.filter((i) => i.done);
                            const key = selectedReparto + ":" + cat.id;
                            return (
                              <div className="grp" key={cat.id}>
                                <div className="grp-h">{cat.icon} {cat.label} <span className="cnt">{open.length} aperte</span></div>
                                {open.length ? open.map((item) => <ItemRow key={item.id} item={item} viewingReparto={selectedReparto} {...entryHandlers} />) : (!resolved.length && <div className="empty">Nessuna voce.</div>)}
                                {resolved.length > 0 && (
                                  <>
                                    <div className="resolved-toggle" onClick={() => setResolvedOpen((p) => ({ ...p, [key]: !p[key] }))}>
                                      {resolvedOpen[key] ? "▾" : "▸"} ✓ {resolved.length} risolte oggi
                                    </div>
                                    {resolvedOpen[key] && (
                                      <div className="resolved-list">
                                        {resolved.map((item) => <ItemRow key={item.id} item={item} viewingReparto={selectedReparto} {...entryHandlers} />)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activePanel === "briefing" && (
            <div className="panel active">
              <div className="brief-form">
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea className="point-textarea" value={briefInput} onChange={(e) => setBriefInput(e.target.value)}
                    placeholder="Scrivi un punto: puoi andare a capo per fare paragrafi, usare **grassetto** e *corsivo*..." />
                  <div className="point-writer-actions">
                    <button className="btn" onClick={addPointToDraft}>+ Aggiungi punto alla lista</button>
                  </div>
                  {draftPoints.length > 0 && (
                    <ul className="draft-points">
                      {draftPoints.map((p, i) => (
                        <li key={i}><span style={{ whiteSpace: "pre-wrap" }}>{p}</span> <button className="remove-point" onClick={() => removeDraftPoint(i)}>×</button></li>
                      ))}
                    </ul>
                  )}
                  <input className="txt-input" value={briefTagsInput} onChange={(e) => setBriefTagsInput(e.target.value)} placeholder="Tag separati da virgola, es. straordinari, turni" />
                </div>
                <div className="brief-form-actions">
                  {isMaster && <button className="draft-btn" onClick={() => addBriefing(false)}>Salva come bozza</button>}
                  <button className="brief-btn" onClick={() => addBriefing(true)}>{isMaster ? "Pubblica" : "Salva riepilogo"}</button>
                </div>
              </div>

              {isMaster && myDrafts.length > 0 && (
                <div className="drafts-section">
                  <div className="drafts-title">📝 Le tue bozze (visibili solo a te)</div>
                  {myDrafts.map((b) => {
                    const isEditing = editingBriefId === b.id;
                    const pts = (b.points && b.points.length) ? b.points : (b.text ? [b.text] : []);
                    return (
                      <div className="brief-card draft-card" key={b.id}>
                        <div className="brief-top">
                          <div className="brief-meta">{b.operator} · {fmtTime(b.created_at)} <span className="draft-tag">BOZZA</span></div>
                          {!isEditing && (
                            <div className="master-actions">
                              <button className="master-btn" onClick={() => startEditBrief(b)} title="Modifica">✏️</button>
                              <button className="master-btn" onClick={() => deleteBriefingDraft(b)} title="Elimina completamente">🗑️</button>
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <>
                            <textarea className="edit-textarea-brief" value={editBriefText} onChange={(e) => setEditBriefText(e.target.value)} placeholder="Un punto per riga, separa i punti con una riga ---" />
                            <input className="txt-input" style={{ marginTop: 6 }} value={editBriefTags} onChange={(e) => setEditBriefTags(e.target.value)} placeholder="Tag separati da virgola" />
                            <div className="edit-actions">
                              <button className="btn" onClick={() => saveEditBrief(b)}>Salva bozza</button>
                              <button className="cancel-btn" onClick={cancelEditBrief}>Annulla</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <ul className="brief-points">
                              {pts.map((p, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatPointHtml(p) }} />)}
                            </ul>
                            {(b.tags || []).length > 0 && (
                              <div className="brief-tags">
                                {b.tags.map((t) => <span key={t} className="brief-tag">#{t}</span>)}
                              </div>
                            )}
                          </>
                        )}
                        {!isEditing && (
                          <div style={{ marginTop: 8 }}>
                            <button className="brief-btn" onClick={() => publishBriefing(b)}>Pubblica ora</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

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
                              <textarea className="edit-textarea-brief" value={editBriefText} onChange={(e) => setEditBriefText(e.target.value)} placeholder="Un punto per riga" />
                              <input className="txt-input" style={{ marginTop: 6 }} value={editBriefTags} onChange={(e) => setEditBriefTags(e.target.value)} placeholder="Tag separati da virgola" />
                              <div className="edit-actions">
                                <button className="btn" onClick={() => saveEditBrief(b)}>Salva</button>
                                <button className="cancel-btn" onClick={cancelEditBrief}>Annulla</button>
                              </div>
                            </div>
                          ) : isExpanded ? (
                            <>
                              <ul className="brief-points">
                                {pts.map((p, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatPointHtml(p) }} />)}
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

          {activePanel === "menzioni" && (
            <div className="panel active">
              <div className="panel-intro">Tutte le note in cui qualcuno ti ha citato con @, da qualsiasi settore. Rispondi direttamente da qui.</div>
              {myMentions.length === 0 ? (
                <div className="empty">Nessuna menzione per ora.</div>
              ) : (
                myMentions.map((item) => <ItemRow key={item.id} item={item} showTags {...entryHandlers} />)
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
            <div className="app-layout">
              <div className="sidebar">
                <div className="cal-title">📮 Report giornalieri inviati</div>
                {dailyReports.length === 0 ? (
                  <div className="cal-empty">Nessun report inviato ancora.</div>
                ) : dailyReports.map((r) => (
                  <div key={r.id} className="cal-item">
                    <span className="cal-date">{fmtDateShort(r.created_at)} · {fmtTime(r.created_at)}</span>
                    Inviato da <b>{r.operator}</b>
                    <div style={{ marginTop: 6 }}>
                      <a className="pdf-link" onClick={() => generateReportPdf(r)}>📄 Apri PDF</a>
                    </div>
                  </div>
                ))}
              </div>

              <div className="main-content">
                <div className="daily-report-box">
                  <div className="daily-report-info">A fine giornata, invia un riepilogo di tutti i sospesi ancora aperti, organizzato per settore.</div>
                  <button className="daily-report-btn" onClick={sendDailyReport} disabled={sendingDailyReport}>
                    {sendingDailyReport ? "Invio in corso..." : "📮 Invia report giornaliero"}
                  </button>
                </div>
                <div className="panel-intro">Tutte le note taggate 🏷️ da qualsiasi settore. Rispondi qui per comunicare col laboratorio — la risposta appare anche nella nota originale.</div>
                {ccEntries.length === 0 ? (
                  <div className="empty">Nessuna nota taggata al momento.</div>
                ) : (
                  ccEntries.map((item) => <ItemRow key={item.id} item={item} showTags {...entryHandlers} />)
                )}
              </div>
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
                        {pts.map((p, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatPointHtml(p) }} />)}
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

function Thread({ item, draft, setDraft, onSend, allProfiles }) {
  const m = draft.match(/@([A-Za-zÀ-ÿ' .]*)$/);
  const partial = m ? m[1].toLowerCase() : null;
  const matches = partial !== null ? (allProfiles || []).filter((p) => p.display_name && p.display_name.toLowerCase().includes(partial)).slice(0, 6) : [];

  return (
    <div className="cc-thread">
      {(item.replies || []).map((r, i) => (
        <div className="cc-reply" key={i}>
          <div className="cc-reply-meta">{r.author} · {fmtTime(r.time)}</div>
          <div className="cc-reply-text" dangerouslySetInnerHTML={{ __html: formatEntryTextHtml(r.text, allProfiles) }} />
        </div>
      ))}
      <div className="cc-reply-form">
        <div className="mention-wrap" style={{ flex: 1 }}>
          <input className="cc-reply-input" style={{ width: "100%" }} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder="Rispondi in questa nota, oppure scrivi @ per citare qualcuno..." />
          {matches.length > 0 && (
            <div className="mention-dropdown">
              {matches.map((p) => (
                <div
                  key={p.id}
                  className="mention-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraft(draft.replace(/@([A-Za-zÀ-ÿ' .]*)$/, "@" + p.display_name + " "));
                  }}
                >
                  {p.display_name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="cc-reply-btn" onClick={onSend}>Invia</button>
      </div>
    </div>
  );
}

function ItemRow({
  item, onToggle, onTag, replyDrafts, setReplyDrafts, onReply, showTags, onSendEmail, sendingEmailId, isMaster,
  editingId, editText, setEditText, onStartEdit, onSaveEdit, onCancelEdit, onHide,
  expandedThreads, onToggleThread, viewingReparto, sharePickerOpen, onToggleSharePicker, onShareTarget, allProfiles,
}) {
  const isEditing = editingId === item.id;
  const stale = isStale(item);
  const dueToday = isDueToday(item);
  const home = reparto(item.reparto);
  const isHomeView = viewingReparto && viewingReparto === item.reparto;
  const sharedHere = viewingReparto && viewingReparto !== item.reparto;
  const shareTargets = REPARTI.filter((r) => r.id !== item.reparto);
  const threadOpen = !!expandedThreads[item.id];
  const replyCount = (item.replies || []).length;

  return (
    <div className={"item " + (item.done ? "done " : "") + (item.cc ? "tagged" : "") + (item.hidden ? " hidden-item" : "") + (stale ? " stale" : "") + (dueToday ? " due-today" : "")}>
      <div className="chk" onClick={() => onToggle(item)} />
      <div className="item-b">
        <div className="item-top">
          {isEditing ? (
            <textarea className="edit-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} />
          ) : (
            <div className="txt" dangerouslySetInnerHTML={{ __html: formatEntryTextHtml(item.text, allProfiles) }} />
          )}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button className={"tag-btn " + (item.cc ? "on" : "")} onClick={() => onTag(item)} title="Notifica Customer Care">🏷️</button>
            {isMaster && !isEditing && <button className="master-btn" onClick={() => onStartEdit(item)} title="Modifica">✏️</button>}
            {isMaster && <button className="master-btn" onClick={() => onHide(item)} title={item.hidden ? "Mostra" : "Nascondi"}>{item.hidden ? "👁️" : "🙈"}</button>}
          </div>
        </div>

        {sharedHere && (
          <div className="share-badge" style={{ background: home.bg, color: home.text, border: `1px solid ${home.border}` }}>
            🔗 condivisa da {home.icon} {home.label}
          </div>
        )}
        {isHomeView && (item.shared_with || []).length > 0 && (
          <div className="share-badge">
            🔗 condivisa anche con: {item.shared_with.map((id) => {
              const r2 = reparto(id);
              return <span key={id} style={{ color: r2.text, fontWeight: 700 }}>{r2.icon} {r2.label} </span>;
            })}
          </div>
        )}

        {item.category === "programmati" && item.scheduled_date && !stale && (
          <div className={"sched-badge" + (dueToday ? " due-today" : "")}>
            📅 programmato per {fmtDate(item.scheduled_date)}{dueToday ? " — oggi!" : ""}
          </div>
        )}
        {stale && (
          <div className="stale-badge">
            {item.category === "programmati"
              ? `⚠️ scaduta — era programmata per ${fmtDate(item.scheduled_date)}`
              : `⚠️ ancora aperta, ${dayLabel(item.open_at) === "Ieri" ? "aperta ieri" : "aperta " + dayLabel(item.open_at)}`}
          </div>
        )}
        {isEditing && (
          <div className="edit-actions">
            <button className="btn" onClick={() => onSaveEdit(item)}>Salva</button>
            <button className="cancel-btn" onClick={onCancelEdit}>Annulla</button>
          </div>
        )}
        {showTags && <div className="grp-h" style={{ marginTop: 5 }}>{home.icon} {home.label} · {catInfo(item.category).icon} {catInfo(item.category).label}</div>}
        <Trace item={item} />

        {item.cc && <EmailBox item={item} onSend={onSendEmail} sendingId={sendingEmailId} />}

        <div className="item-actions">
          <span className="reply-toggle" onClick={() => onToggleThread(item.id)}>💬 {replyCount ? replyCount + " risposte" : "Rispondi"}</span>
          {isHomeView && <span className="share-toggle" onClick={() => onToggleSharePicker(item.id)}>🔗 Condividi</span>}
        </div>

        {isHomeView && sharePickerOpen[item.id] && (
          <div className="share-picker">
            {shareTargets.map((r) => {
              const on = (item.shared_with || []).includes(r.id);
              return (
                <button
                  key={r.id}
                  className="share-chip"
                  style={on ? { background: r.text, borderColor: r.text, color: "#fff" } : { borderColor: r.border, color: r.text }}
                  onClick={() => onShareTarget(item, r.id)}
                >
                  {r.icon} {r.label}{on ? " ×" : ""}
                </button>
              );
            })}
          </div>
        )}

        {threadOpen && (
          <Thread item={item} draft={replyDrafts[item.id] || ""} setDraft={(v) => setReplyDrafts((p) => ({ ...p, [item.id]: v }))} onSend={() => onReply(item)} allProfiles={allProfiles} />
        )}
      </div>
    </div>
  );
}
