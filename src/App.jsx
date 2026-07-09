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
const isStale = (item) => !item.done && item.open_at && !isSameDay(item.open_at);

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

  const sendReply
