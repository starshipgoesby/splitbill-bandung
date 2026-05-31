import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Trash2, Receipt, Scale, X, ArrowRight, Check, Camera,
  Sparkles, Loader2, CreditCard, ChevronRight, Share2, Pencil, Moon, Sun,
  UtensilsCrossed, Car, BedDouble, ShoppingBag, Music, MoreHorizontal, ChevronDown,
  Download, Link2,
} from "lucide-react";

// ── Supabase ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://fragtbguzxzjyzdtemna.supabase.co";
const SUPABASE_KEY = "sb_publishable_oMwpDwsEcqM5B8qjSVUvfA_yg973sSC";
const POLL_MS = 30000;
const MAX_RETRIES = 3;

async function sbFetch(path, opts = {}, retries = 0) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...opts.headers },
    });
    if (!r.ok && retries < MAX_RETRIES) {
      await new Promise(res => setTimeout(res, 800 * (retries + 1)));
      return sbFetch(path, opts, retries + 1);
    }
    return r;
  } catch (e) {
    if (retries < MAX_RETRIES) {
      await new Promise(res => setTimeout(res, 800 * (retries + 1)));
      return sbFetch(path, opts, retries + 1);
    }
    throw e;
  }
}

const sb = {
  async getTrips() { const r = await sbFetch("trip_data?select=id,data,updated_at&order=updated_at.desc"); return await r.json(); },
  async getTrip(id) { const r = await sbFetch(`trip_data?id=eq.${id}&select=data,updated_at`); const rows = await r.json(); return rows?.[0] ?? null; },
  async saveTrip(id, data) { await sbFetch("trip_data", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }) }); },
  async getPhoto(id) { const r = await sbFetch(`receipt_photos?id=eq.${id}&select=photo`); const rows = await r.json(); return rows?.[0]?.photo ?? null; },
  async savePhoto(id, photo) { await sbFetch("receipt_photos", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id, photo }) }); },
  async deletePhoto(id) { await sbFetch(`receipt_photos?id=eq.${id}`, { method: "DELETE" }); },
  async deleteTrip(id) { await sbFetch(`trip_data?id=eq.${id}`, { method: "DELETE" }); },
  async getTripsByIds(ids) {
    if (!ids?.length) return [];
    const inList = ids.map((x) => encodeURIComponent(x)).join(",");
    const r = await sbFetch(`trip_data?id=in.(${inList})&select=id,data,updated_at&order=updated_at.desc`);
    return await r.json();
  },
};

// Per-device list of trip IDs that this user has visited / created
const myTripIdsKey = "sb-my-trips";
const getMyTripIds = () => {
  try { return JSON.parse(localStorage.getItem(myTripIdsKey) || "[]"); } catch { return []; }
};
const addMyTripId = (id) => {
  if (!id) return;
  try {
    const cur = getMyTripIds();
    if (!cur.includes(id)) {
      cur.unshift(id);
      localStorage.setItem(myTripIdsKey, JSON.stringify(cur.slice(0, 50)));
    }
  } catch {}
};
const removeMyTripId = (id) => {
  try {
    const cur = getMyTripIds().filter((x) => x !== id);
    localStorage.setItem(myTripIdsKey, JSON.stringify(cur));
  } catch {}
};

// ── Helpers ───────────────────────────────────────────────────────────
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const palette = ["#ea580c","#16a34a","#ca8a04","#2563eb","#9333ea","#db2777","#0d9488","#a16207"];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const CATEGORIES = [
  { id: "makan",      label: "Makan",      icon: UtensilsCrossed, color: "#ea580c" },
  { id: "transport",  label: "Transport",  icon: Car,             color: "#2563eb" },
  { id: "penginapan", label: "Penginapan", icon: BedDouble,       color: "#16a34a" },
  { id: "belanja",    label: "Belanja",    icon: ShoppingBag,     color: "#ca8a04" },
  { id: "hiburan",    label: "Hiburan",    icon: Music,           color: "#9333ea" },
  { id: "lainnya",    label: "Lainnya",    icon: MoreHorizontal,  color: "#71717a" },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[5];

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function prepareForAI(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_BYTES = 4_500_000;
        let maxDim = Math.max(img.width, img.height);
        let quality = 0.92;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const render = (dim, q) => {
          const scale = Math.min(1, dim / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", q);
        };
        let dataUrl = render(maxDim, quality);
        while (dataUrl.length > MAX_BYTES) {
          if (quality > 0.7) quality -= 0.05;
          else if (maxDim > 1400) maxDim -= 200;
          else if (quality > 0.5) quality -= 0.05;
          else break;
          dataUrl = render(maxDim, quality);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function equalSharesFrom(e) {
  const s = {}, list = e.splitAmong || [];
  if (!list.length) return s;
  const per = e.amount / list.length;
  list.forEach((id) => (s[id] = per));
  return s;
}

function computeReceiptShares(items, charges, members) {
  const base = {}; members.forEach((m) => (base[m.id] = 0));
  items.forEach((it) => {
    if (!it.who?.length) return;
    const per = (Number(it.price) || 0) / it.who.length;
    it.who.forEach((id) => { if (base[id] != null) base[id] += per; });
  });
  const subtotal = Object.values(base).reduce((a, b) => a + b, 0);
  const adj = (Number(charges.tax)||0) + (Number(charges.service)||0) - (Number(charges.discount)||0);
  const shares = {};
  members.forEach((m) => {
    if (base[m.id] > 0) shares[m.id] = Math.round(base[m.id] + (subtotal > 0 ? adj * (base[m.id] / subtotal) : 0));
  });
  let amount = Math.round(subtotal + adj);
  const ids = Object.keys(shares);
  const sum = ids.reduce((a, id) => a + shares[id], 0);
  if (ids.length && amount - sum !== 0) shares[ids[0]] += amount - sum;
  return { shares, amount };
}

function settle(members, expenses) {
  const net = {}; members.forEach((m) => (net[m.id] = 0));
  expenses.forEach((e) => {
    const shares = e.shares || equalSharesFrom(e);
    if (net[e.paidBy] != null) net[e.paidBy] += e.amount;
    Object.entries(shares).forEach(([id, v]) => { if (net[id] != null) net[id] -= v; });
  });
  const balances = members.map((m) => ({ ...m, amount: Math.round(net[m.id]) }));
  const debtors   = balances.filter((b) => b.amount < 0).map((b) => ({ ...b })).sort((a, b) => a.amount - b.amount);
  const creditors = balances.filter((b) => b.amount > 0).map((b) => ({ ...b })).sort((a, b) => b.amount - a.amount);
  const tx = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(-debtors[i].amount, creditors[j].amount);
    if (pay > 0) tx.push({ from: debtors[i], to: creditors[j], amount: pay });
    debtors[i].amount += pay; creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return { balances, tx };
}

function buildCSV(tripName, members, expenses, balances, tx) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "?";
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];

  // Header
  lines.push(`"${tripName} — Ringkasan"`);
  lines.push(`"Dibuat","${new Date().toLocaleString("id-ID")}"`);
  lines.push("");

  // Section 1: Expenses
  lines.push("PENGELUARAN");
  const memberHeaders = members.map((m) => esc(m.name)).join(",");
  lines.push(`"Tanggal","Deskripsi","Kategori","Dibayar oleh","Jumlah",${memberHeaders}`);
  expenses.forEach((e) => {
    const date = new Date(e.at || Date.now()).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const cat = (CATEGORIES.find((c) => c.id === (e.category || "lainnya")) || CATEGORIES[5]).label;
    const memberShares = members.map((m) => Math.round((e.shares || {})[m.id] || 0));
    lines.push([date, e.desc, cat, nameOf(e.paidBy), Math.round(e.amount), ...memberShares].map(esc).join(","));
  });
  // Totals row
  const memberTotals = members.map((m) => expenses.reduce((s, e) => s + Math.round((e.shares || {})[m.id] || 0), 0));
  const grandTotal = expenses.reduce((s, e) => s + Math.round(e.amount), 0);
  lines.push(["", "TOTAL", "", "", grandTotal, ...memberTotals].map(esc).join(","));
  lines.push("");

  // Section 2: Items per expense (only scanned ones)
  const withItems = expenses.filter((e) => e.items?.length);
  if (withItems.length) {
    lines.push("RINCIAN ITEM");
    lines.push(`"Pengeluaran","Item","Harga","Dibagi ke"`);
    withItems.forEach((e) => {
      e.items.forEach((it) => {
        const who = (it.who || []).map((id) => nameOf(id)).join(" + ");
        lines.push([e.desc, it.name, Math.round(it.price), who].map(esc).join(","));
      });
      if (e.charges?.tax)      lines.push([e.desc, "Pajak",   Math.round(e.charges.tax), ""].map(esc).join(","));
      if (e.charges?.service)  lines.push([e.desc, "Service", Math.round(e.charges.service), ""].map(esc).join(","));
      if (e.charges?.discount) lines.push([e.desc, "Diskon", -Math.round(e.charges.discount), ""].map(esc).join(","));
    });
    lines.push("");
  }

  // Section 3: Balances
  lines.push("POSISI SALDO");
  lines.push(`"Nama","Saldo","Status"`);
  balances.forEach((b) => {
    const status = b.amount > 0 ? "Piutang (terima)" : b.amount < 0 ? "Hutang (bayar)" : "Lunas";
    lines.push([b.name, b.amount, status].map(esc).join(","));
  });
  lines.push("");

  // Section 4: Transfers
  lines.push("INSTRUKSI TRANSFER");
  lines.push(`"Dari","Ke","Jumlah","Rekening"`);
  if (tx.length === 0) {
    lines.push(`"-","-",0,"Semua sudah lunas"`);
  } else {
    tx.forEach((t) => {
      lines.push([t.from.name, t.to.name, t.amount, t.to.account || ""].map(esc).join(","));
    });
  }

  return lines.join("\n");
}

function buildWAText(tripName, members, expenses, tx) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "?";
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const lines = [`*${tripName}*`, "", `Total: *${rp(total)}*`, ""];
  const byCat = {};
  expenses.forEach((e) => {
    const c = catOf(e.category);
    if (!byCat[c.id]) byCat[c.id] = { label: c.label, items: [], total: 0 };
    byCat[c.id].items.push(e);
    byCat[c.id].total += e.amount;
  });
  Object.values(byCat).forEach((cat) => {
    lines.push(`*${cat.label}* — ${rp(cat.total)}`);
    cat.items.forEach((e) => lines.push(`  • ${e.desc} · ${rp(e.amount)} (${nameOf(e.paidBy)})`));
    lines.push("");
  });
  if (tx.length === 0) {
    lines.push("✅ Semua lunas");
  } else {
    lines.push("*Transfer*");
    tx.forEach((t) => {
      const acct = t.to.account ? `\n     ${t.to.account}` : "";
      lines.push(`• ${t.from.name} → ${t.to.name}  *${rp(t.amount)}*${acct}`);
    });
  }
  return lines.join("\n");
}

// ── Dark mode ─────────────────────────────────────────────────────────
function useDark() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("sb-dark") === "1"; } catch { return false; } });
  const toggle = () => setDark((d) => { try { localStorage.setItem("sb-dark", d ? "0" : "1"); } catch {} return !d; });
  return [dark, toggle];
}

// ── Theme ─────────────────────────────────────────────────────────────
const T = {
  light: {
    bg: "#fafaf9", surface: "#ffffff", subtle: "#f5f5f4",
    text: "#1c1917", textSoft: "#44403c", muted: "#78716c",
    border: "#e7e5e4", divider: "#f5f5f4",
    accent: "#ea580c", accentSoft: "#fff7ed", accentText: "#ffffff",
    danger: "#dc2626", success: "#16a34a",
  },
  dark: {
    bg: "#0c0a09", surface: "#1c1917", subtle: "#1c1917",
    text: "#fafaf9", textSoft: "#d6d3d1", muted: "#a8a29e",
    border: "#292524", divider: "#1c1917",
    accent: "#fb923c", accentSoft: "#1c1310", accentText: "#0c0a09",
    danger: "#f87171", success: "#4ade80",
  },
};

// ── Avatar circle ─────────────────────────────────────────────────────
function Avatar({ name, color, size = 28 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: size,
      background: color, color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 700, flexShrink: 0,
      letterSpacing: 0,
    }}>{initial}</span>
  );
}

// ── Reusable styles ───────────────────────────────────────────────────
const num = { fontVariantNumeric: "tabular-nums" };
const ov = { position: "fixed", inset: 0, background: "#0c0a0966", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, backdropFilter: "blur(4px)" };
const modalSt = (t) => ({ background: t.bg, width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "20px 18px 28px", animation: "slideUp .25s cubic-bezier(.2,.9,.3,1) both", border: `1px solid ${t.border}`, borderBottom: "none" });
const mTitle = (t) => ({ fontSize: 22, fontWeight: 700, margin: 0, color: t.text, letterSpacing: -0.4 });
const labelSt = (t) => ({ fontSize: 11, fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 18 });
const inputSt = (t) => ({ width: "100%", padding: "12px 14px", border: `1px solid ${t.border}`, borderRadius: 10, fontSize: 15, background: t.surface, color: t.text, display: "block", fontFamily: "inherit" });
const btnX = (t) => ({ border: "none", background: "transparent", color: t.muted, width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" });
const btnPrimary = (t) => ({ flex: 2, padding: "13px 18px", border: "none", background: t.accent, color: t.accentText, borderRadius: 12, fontWeight: 600, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", fontFamily: "inherit" });
const btnSecondary = (t) => ({ flex: 1, padding: "13px 18px", border: `1px solid ${t.border}`, background: t.surface, borderRadius: 12, fontWeight: 600, fontSize: 15, color: t.textSoft, cursor: "pointer", fontFamily: "inherit" });
const btnGhost = (t) => ({ padding: "8px 12px", border: `1px solid ${t.border}`, background: t.surface, borderRadius: 10, fontWeight: 500, fontSize: 13, color: t.textSoft, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" });

// ── Category chips ────────────────────────────────────────────────────
function CatChips({ value, onChange, t }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {CATEGORIES.map((c) => {
        const on = value === c.id;
        return (
          <button key={c.id} onClick={() => onChange(c.id)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: `1px solid ${on ? c.color : t.border}`,
            background: on ? c.color + "12" : t.surface,
            color: on ? c.color : t.textSoft,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <c.icon size={13} strokeWidth={2} />{c.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────
function ExportModal({ tripId, tripName, members, expenses, balances, tx, onClose, t }) {
  const [mode, setMode] = useState("wa"); // wa | csv | link
  const waText  = useMemo(() => buildWAText(tripName, members, expenses, tx), [tripName, members, expenses, tx]);
  const csvText = useMemo(() => buildCSV(tripName, members, expenses, balances, tx), [tripName, members, expenses, balances, tx]);
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = window.location.origin + window.location.pathname;
    return `${base}#${tripId}`;
  }, [tripId]);

  const [copied, setCopied] = useState(false);
  const text = mode === "csv" ? csvText : waText;

  const copy = () => {
    const payload = mode === "link" ? shareUrl : text;
    navigator.clipboard.writeText(payload).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const share = () => {
    if (mode === "link") {
      if (navigator.share) navigator.share({ title: tripName, url: shareUrl });
      else copy();
    } else {
      if (navigator.share) navigator.share({ text });
      else copy();
    }
  };
  const downloadCSV = () => {
    const blob = new Blob([`\uFEFF${csvText}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = tripName.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
    a.href = url; a.download = `${safeName}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabStyle = (active) => ({
    flex: 1, padding: "9px 8px", border: "none", background: active ? t.surface : "transparent",
    color: active ? t.text : t.muted, fontWeight: 600, fontSize: 13, borderRadius: 8, cursor: "pointer",
    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
  });

  return (
    <div style={ov} onClick={onClose}>
      <div style={{ ...modalSt(t), maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={mTitle(t)}>Bagikan</h3>
          <button onClick={onClose} style={btnX(t)}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: 3, background: t.subtle, border: `1px solid ${t.border}`, borderRadius: 10, marginBottom: 12 }}>
          <button onClick={() => { setMode("wa"); setCopied(false); }} style={tabStyle(mode==="wa")}><Share2 size={13} /> WA</button>
          <button onClick={() => { setMode("csv"); setCopied(false); }} style={tabStyle(mode==="csv")}><Download size={13} /> CSV</button>
          <button onClick={() => { setMode("link"); setCopied(false); }} style={tabStyle(mode==="link")}><Link2 size={13} /> Link</button>
        </div>

        {/* Content */}
        {mode === "link" ? (
          <div style={{ flex: 1, marginBottom: 14 }}>
            <p style={{ fontSize: 13.5, color: t.textSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
              Teman yang buka link ini akan masuk ke trip yang sama dan bisa input bareng-bareng.
            </p>
            <div style={{ padding: 14, background: t.subtle, border: `1px solid ${t.border}`, borderRadius: 10, fontFamily: "ui-monospace, monospace", fontSize: 13, wordBreak: "break-all", color: t.text, marginBottom: 10 }}>
              {shareUrl}
            </div>
            <div style={{ padding: "10px 12px", background: t.accentSoft, border: `1px solid ${t.accent}22`, borderRadius: 8, fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>
              Catatan: siapa pun yang punya link ini bisa lihat dan edit trip. Hanya share ke teman trip.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", background: t.subtle, border: `1px solid ${t.border}`, borderRadius: 10, padding: 14, fontSize: mode==="csv" ? 11.5 : 13, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: t.text, marginBottom: 14, maxHeight: "50vh", ...num }}>
            {text}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copy} style={btnSecondary(t)}>{copied ? "Tersalin ✓" : "Salin"}</button>
          {mode === "csv" && <button onClick={downloadCSV} style={btnPrimary(t)}><Download size={15} /> Download .csv</button>}
          {mode !== "csv" && <button onClick={share} style={btnPrimary(t)}><Share2 size={15} /> Bagikan</button>}
        </div>
      </div>
    </div>
  );
}

// ── Trip Selector ─────────────────────────────────────────────────────
function TripSelector({ currentId, trips, onSelect, onCreate, onDelete, onClose, t }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const create = () => { if (!newName.trim()) return; onCreate(newName.trim()); setNewName(""); setCreating(false); };

  return (
    <div style={ov} onClick={onClose}>
      <div style={modalSt(t)} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={mTitle(t)}>Trip</h3>
          <button onClick={onClose} style={btnX(t)}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: "50vh", overflowY: "auto", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
          {trips.map((trip, idx) => {
            const isCurrent = trip.id === currentId;
            const isDel = confirmDel === trip.id;
            return (
              <div key={trip.id} style={{ borderTop: idx > 0 ? `1px solid ${t.divider}` : "none", display: "flex", alignItems: "stretch" }}>
                <button onClick={() => onSelect(trip.id)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: isCurrent ? t.accentSoft : "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ fontWeight: 600, fontSize: 15, flex: 1, color: isCurrent ? t.accent : t.text }}>{trip.data?.name || trip.id}</span>
                  {isCurrent && <Check size={16} style={{ color: t.accent }} />}
                </button>
                {isDel ? (
                  <div style={{ display: "flex", padding: "8px" }}>
                    <button onClick={() => { onDelete(trip.id); setConfirmDel(null); }} style={{ padding: "0 14px", background: t.danger, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Hapus</button>
                    <button onClick={() => setConfirmDel(null)} style={{ padding: "0 12px", background: "transparent", color: t.muted, border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
                  </div>
                ) : (
                  trips.length > 1 && (
                    <button onClick={() => setConfirmDel(trip.id)} title="Hapus trip" style={{ padding: "0 14px", background: "transparent", color: t.muted, border: "none", display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <Trash2 size={14} />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
        {creating ? (
          <div style={{ marginTop: 12 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Nama trip" style={inputSt(t)} autoFocus />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => setCreating(false)} style={btnSecondary(t)}>Batal</button>
              <button onClick={create} style={btnPrimary(t)}>Buat</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ ...btnPrimary(t), width: "100%", marginTop: 12 }}><Plus size={15} /> Trip baru</button>
        )}
      </div>
    </div>
  );
}

// ── Detail / Edit Modal ───────────────────────────────────────────────
function DetailModal({ expense, members, onClose, onUpdate, onDelete, t }) {
  const [photo, setPhoto]       = useState(null);
  const [photoState, setPhotoState] = useState(expense.hasReceipt ? "loading" : "none");
  const [editing, setEditing]   = useState(false);
  const [editDesc, setEditDesc] = useState(expense.desc);
  const [editAmt, setEditAmt]   = useState(String(expense.amount));
  const [editPaid, setEditPaid] = useState(expense.paidBy);
  const [editCat, setEditCat]   = useState(expense.category || "lainnya");

  useEffect(() => {
    if (!expense.hasReceipt) return;
    sb.getPhoto(expense.id).then((p) => {
      if (p) { setPhoto(p); setPhotoState("ok"); } else setPhotoState("missing");
    }).catch(() => setPhotoState("missing"));
  }, [expense.id, expense.hasReceipt]);

  const nameOf  = (id) => members.find((m) => m.id === id)?.name  || "?";
  const colorOf = (id) => members.find((m) => m.id === id)?.color || "#999";

  const saveEdit = () => {
    let shares, amount;
    if (expense.items && expense.items.length > 0) {
      const charges = expense.charges || { tax: 0, service: 0, discount: 0 };
      const result = computeReceiptShares(expense.items, charges, members);
      shares = result.shares; amount = result.amount;
    } else {
      const amt = parseInt(String(editAmt).replace(/\D/g, ""), 10);
      if (!editDesc.trim() || !amt) return;
      const among = Object.keys(expense.shares || {});
      const per = amt / (among.length || 1);
      shares = {}; among.forEach((id) => (shares[id] = per));
      amount = amt;
    }
    if (!editDesc.trim() || amount <= 0) return;
    onUpdate({ ...expense, desc: editDesc.trim(), amount, paidBy: editPaid, shares, category: editCat });
    setEditing(false);
  };

  const cat = catOf(expense.category);

  return (
    <div style={ov} onClick={onClose}>
      <div style={modalSt(t)} onClick={(e) => e.stopPropagation()}>
        <div style={{ maxHeight: "85vh", overflowY: "auto", margin: "-4px -4px 0", padding: 4 }}>
          {/* header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 6, background: cat.color + "15", color: cat.color, fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>
                <cat.icon size={11} strokeWidth={2.2} />{cat.label}
                {expense.scanned && <span style={{ marginLeft: 4, opacity: 0.7 }}>· dari struk</span>}
              </div>
              {editing
                ? <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ ...inputSt(t), fontSize: 20, fontWeight: 600, padding: "8px 10px" }} />
                : <h3 style={{ ...mTitle(t), fontSize: 24 }}>{expense.desc}</h3>}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setEditing(!editing)} style={{ ...btnX(t), color: editing ? t.accent : t.muted }}><Pencil size={16} /></button>
              <button onClick={onClose} style={btnX(t)}><X size={18} /></button>
            </div>
          </div>

          {editing ? (
            <>
              <div style={labelSt(t)}>Kategori</div>
              <CatChips value={editCat} onChange={setEditCat} t={t} />
              {!expense.scanned && (
                <>
                  <div style={labelSt(t)}>Jumlah</div>
                  <input value={parseInt(String(editAmt).replace(/\D/g,"")||"0",10).toLocaleString("id-ID")} onChange={(e) => setEditAmt(e.target.value.replace(/\D/g,""))} inputMode="numeric" style={{ ...inputSt(t), ...num }} />
                </>
              )}
              {expense.scanned && (
                <div style={{ marginTop: 14, padding: "10px 12px", background: t.accentSoft, borderRadius: 8, fontSize: 12.5, color: t.textSoft, lineHeight: 1.5, border: `1px solid ${t.accent}22` }}>
                  Jumlah otomatis dari rincian item. Edit per-item di bawah untuk ubah pembagian.
                </div>
              )}
              <div style={labelSt(t)}>Dibayar oleh</div>
              <select value={editPaid} onChange={(e) => setEditPaid(e.target.value)} style={inputSt(t)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <button onClick={() => { onDelete(expense.id); onClose(); }} style={{ ...btnSecondary(t), color: t.danger, borderColor: t.danger + "44" }}><Trash2 size={14} /> Hapus</button>
                <button onClick={saveEdit} style={btnPrimary(t)}>Simpan perubahan</button>
              </div>
            </>
          ) : (
            <>
              {/* Total card */}
              <div style={{ padding: "18px 18px", borderRadius: 14, background: t.surface, border: `1px solid ${t.border}`, marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: t.muted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Total</div>
                <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, marginTop: 2, color: t.text, ...num }}>{rp(expense.amount)}</div>
                <div style={{ fontSize: 13, color: t.muted, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  Dibayar
                  <Avatar name={nameOf(expense.paidBy)} color={colorOf(expense.paidBy)} size={20} />
                  <span style={{ color: t.textSoft, fontWeight: 600 }}>{nameOf(expense.paidBy)}</span>
                </div>
              </div>

              {/* Photo */}
              {expense.hasReceipt && (
                <>
                  <div style={labelSt(t)}>Foto struk</div>
                  <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 6, overflow: "hidden" }}>
                    {photoState === "loading" && <div style={{ padding: "40px 0", textAlign: "center", color: t.muted }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></div>}
                    {photoState === "ok" && photo && <img src={photo} alt="Struk" style={{ width: "100%", borderRadius: 8, display: "block", maxHeight: 400, objectFit: "contain" }} />}
                    {photoState === "missing" && <div style={{ padding: "30px 0", textAlign: "center", color: t.muted, fontSize: 13 }}>Foto tidak tersedia</div>}
                  </div>
                </>
              )}

              {/* Items */}
              {expense.items?.length > 0 && (
                <>
                  <div style={{ ...labelSt(t), display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span>Rincian</span>
                    <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 11, fontWeight: 400 }}>tap nama untuk ubah</span>
                  </div>
                  <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
                    {expense.items.map((it, idx) => (
                      <div key={idx} style={{ padding: "12px 14px", borderTop: idx > 0 ? `1px solid ${t.divider}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                          <span style={{ fontWeight: 500, fontSize: 14.5, flex: 1, color: t.text }}>{it.name}</span>
                          <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", color: t.text, ...num }}>{rp(it.price)}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {members.map((m) => {
                            const on = (it.who || []).includes(m.id);
                            return (
                              <button key={m.id} onClick={() => {
                                const newItems = expense.items.map((x, i) => i !== idx ? x : { ...x, who: on ? (x.who || []).filter((y) => y !== m.id) : [...(x.who || []), m.id] });
                                const charges = expense.charges || { tax: 0, service: 0, discount: 0 };
                                const { shares, amount } = computeReceiptShares(newItems, charges, members);
                                if (Object.keys(shares).length === 0) return;
                                onUpdate({ ...expense, items: newItems, shares, amount });
                              }}
                              style={{ padding: "4px 9px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${on ? m.color : t.border}`, background: on ? m.color + "18" : "transparent", color: on ? m.color : t.muted, cursor: "pointer", fontFamily: "inherit" }}>
                                {m.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {expense.charges && (!!expense.charges.tax || !!expense.charges.service || !!expense.charges.discount) && (
                      <div style={{ padding: "10px 14px", borderTop: `1px solid ${t.divider}`, background: t.subtle }}>
                        {!!expense.charges.tax      && <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 13, color: t.muted, ...num }}><span>Pajak</span><span>{rp(expense.charges.tax)}</span></div>}
                        {!!expense.charges.service  && <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 13, color: t.muted, ...num }}><span>Service</span><span>{rp(expense.charges.service)}</span></div>}
                        {!!expense.charges.discount && <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 13, color: t.success, ...num }}><span>Diskon</span><span>−{rp(expense.charges.discount)}</span></div>}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Per-person */}
              <div style={labelSt(t)}>Pembagian</div>
              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
                {Object.entries(expense.shares || {}).map(([id, amt], idx) => (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderTop: idx > 0 ? `1px solid ${t.divider}` : "none" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={nameOf(id)} color={colorOf(id)} size={26} />
                      <span style={{ fontWeight: 500, color: t.text }}>{nameOf(id)}</span>
                      {id === expense.paidBy && <span style={{ fontSize: 10.5, letterSpacing: 0.5, fontWeight: 700, color: t.accent, background: t.accentSoft, padding: "2px 7px", borderRadius: 5, textTransform: "uppercase" }}>nalangin</span>}
                    </span>
                    <span style={{ fontWeight: 600, color: t.text, ...num }}>{rp(amt)}</span>
                  </div>
                ))}
              </div>

              <button onClick={onClose} style={{ ...btnSecondary(t), width: "100%", marginTop: 18 }}>Tutup</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scan Modal ────────────────────────────────────────────────────────
function ScanModal({ members, onClose, onSave, t }) {
  const [step, setStep]         = useState("upload");
  const [errMsg, setErrMsg]     = useState("");
  const [merchant, setMerchant] = useState("");
  const [items, setItems]       = useState([]);
  const [charges, setCharges]   = useState({ tax: 0, service: 0, discount: 0 });
  const [paidBy, setPaidBy]     = useState(members[0]?.id || "");
  const [category, setCat]      = useState("makan");
  const [photoUrl, setPhoto]    = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    try {
      setStep("loading");
      const originalUrl = await readAsDataURL(file);
      setPhoto(originalUrl);
      const aiUrl = await prepareForAI(file);
      const b64 = aiUrl.split(",")[1];
      const prompt = 'Kamu parser struk belanja. Balas HANYA JSON minified valid tanpa markdown. Skema: {"merchant":string,"items":[{"name":string,"price":number}],"tax":number,"service":number,"discount":number,"total":number}. price = total harga baris dalam rupiah, angka bulat. Jika tidak ada isi 0.';
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b64, prompt }) });
      const data = await res.json();
      const parsed = JSON.parse((data.text || "").replace(/```json|```/g, "").trim());
      setMerchant(parsed.merchant || "Struk");
      setItems((parsed.items || []).map((it) => ({ id: uid(), name: it.name || "Item", price: Math.round(Number(it.price)||0), who: members.map((m) => m.id) })));
      setCharges({ tax: Math.round(Number(parsed.tax)||0), service: Math.round(Number(parsed.service)||0), discount: Math.round(Number(parsed.discount)||0) });
      setStep("review");
    } catch { setErrMsg("Tidak bisa membaca struk. Coba foto yang lebih jelas."); setStep("error"); }
  };

  const toggleWho  = (iid, mid) => setItems((a) => a.map((it) => it.id !== iid ? it : { ...it, who: it.who.includes(mid) ? it.who.filter((x) => x !== mid) : [...it.who, mid] }));
  const setField   = (iid, f, v) => setItems((a) => a.map((it) => it.id !== iid ? it : { ...it, [f]: v }));
  const removeItem = (iid) => setItems((a) => a.filter((it) => it.id !== iid));
  const preview    = useMemo(() => computeReceiptShares(items, charges, members), [items, charges, members]);

  const save = () => {
    const { shares, amount } = preview;
    if (!paidBy || amount <= 0 || !Object.keys(shares).length) return;
    onSave({ id: uid(), desc: merchant || "Struk", amount, paidBy, shares, category, at: Date.now(), scanned: true, items: items.map(({ name, price, who }) => ({ name, price, who })), charges: { ...charges }, hasReceipt: !!photoUrl }, photoUrl);
  };

  return (
    <div style={ov} onClick={onClose}>
      <div style={modalSt(t)} onClick={(e) => e.stopPropagation()}>
        {step === "upload" && (
          <div style={{ padding: "8px 0 4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={mTitle(t)}>Scan struk</h3>
              <button onClick={onClose} style={btnX(t)}><X size={18} /></button>
            </div>
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: t.accentSoft, color: t.accent, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Camera size={26} /></div>
              <p style={{ color: t.muted, fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>Foto struk akan dibaca otomatis oleh AI</p>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
              <button onClick={() => fileRef.current.click()} style={{ ...btnPrimary(t), width: "100%" }}><Sparkles size={15} /> Pilih foto struk</button>
            </div>
          </div>
        )}
        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "50px 0" }}>
            <Loader2 size={28} style={{ color: t.accent, animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: 15, fontWeight: 600, marginTop: 14, color: t.text }}>Membaca struk</p>
            <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Biasanya 5–10 detik</p>
          </div>
        )}
        {step === "error" && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <h3 style={mTitle(t)}>Hmm…</h3>
            <p style={{ color: t.muted, fontSize: 14, margin: "8px 0 18px" }}>{errMsg}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={btnSecondary(t)}>Tutup</button>
              <button onClick={() => setStep("upload")} style={btnPrimary(t)}>Coba lagi</button>
            </div>
          </div>
        )}
        {step === "review" && (
          <div style={{ maxHeight: "82vh", overflowY: "auto", margin: "-4px -4px 0", padding: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={mTitle(t)}>Hasil scan</h3>
              <button onClick={onClose} style={btnX(t)}><X size={18} /></button>
            </div>
            {photoUrl && <div style={{ marginBottom: 14, borderRadius: 10, overflow: "hidden", maxHeight: 120, border: `1px solid ${t.border}` }}><img src={photoUrl} alt="Struk" style={{ width: "100%", objectFit: "cover", display: "block", maxHeight: 120 }} /></div>}
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} style={{ ...inputSt(t), fontSize: 18, fontWeight: 600 }} />
            <div style={labelSt(t)}>Kategori</div>
            <CatChips value={category} onChange={setCat} t={t} />
            <div style={{ ...labelSt(t), display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>Item</span>
              <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 11, fontWeight: 400 }}>tap nama untuk pilih</span>
            </div>
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
              {items.map((it, idx) => (
                <div key={it.id} style={{ padding: "10px 12px", borderTop: idx > 0 ? `1px solid ${t.divider}` : "none" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 7 }}>
                    <input value={it.name} onChange={(e) => setField(it.id, "name", e.target.value)} style={{ ...inputSt(t), flex: 1, padding: "6px 9px", fontSize: 13.5, border: `1px solid ${t.divider}` }} />
                    <input value={(it.price||0).toLocaleString("id-ID")} onChange={(e) => setField(it.id, "price", parseInt(e.target.value.replace(/\D/g,"")||"0",10))} inputMode="numeric" style={{ ...inputSt(t), width: 88, padding: "6px 9px", fontSize: 13.5, textAlign: "right", border: `1px solid ${t.divider}`, ...num }} />
                    <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "transparent", color: t.danger, padding: 5, display: "flex", cursor: "pointer", borderRadius: 6 }}><X size={14} /></button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {members.map((m) => { const on = it.who.includes(m.id); return (<button key={m.id} onClick={() => toggleWho(it.id, m.id)} style={{ padding: "4px 9px", border: `1px solid ${on ? m.color : t.border}`, borderRadius: 7, background: on ? m.color + "18" : "transparent", fontSize: 12, fontWeight: 600, color: on ? m.color : t.muted, cursor: "pointer", fontFamily: "inherit" }}>{m.name}</button>); })}
                  </div>
                </div>
              ))}
              <div style={{ padding: "10px 12px", borderTop: `1px solid ${t.divider}`, background: t.subtle }}>
                {[["Pajak","tax"],["Service","service"],["Diskon","discount"]].map(([label, key]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 13.5, color: t.muted }}>
                    <span>{label}</span>
                    <input value={(charges[key]||0).toLocaleString("id-ID")} inputMode="numeric" onChange={(e) => setCharges({ ...charges, [key]: parseInt(e.target.value.replace(/\D/g,"")||"0",10) })} style={{ width: 100, padding: "5px 8px", border: `1px solid ${t.border}`, borderRadius: 7, fontSize: 13, textAlign: "right", background: t.surface, color: t.text, fontFamily: "inherit", ...num }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={labelSt(t)}>Dibayar oleh</div>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={inputSt(t)}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <div style={{ marginTop: 16, padding: "14px 16px", background: t.subtle, border: `1px solid ${t.border}`, borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 8, color: t.text, fontSize: 15 }}><span>Total</span><span style={num}>{rp(preview.amount)}</span></div>
              {members.filter((m) => preview.shares[m.id]).map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: t.muted, padding: "2px 0", ...num }}>
                  <span>{m.name}</span><span>{rp(preview.shares[m.id])}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={btnSecondary(t)}>Batal</button>
              <button onClick={save} style={btnPrimary(t)}>Simpan</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manual Modal ──────────────────────────────────────────────────────
function ManualModal({ members, onClose, onSave, t }) {
  const [desc, setDesc]     = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(members[0]?.id || "");
  const [among, setAmong]   = useState(members.map((m) => m.id));
  const [cat, setCat]       = useState("lainnya");
  const toggle = (id) => setAmong((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const save = () => {
    const amt = parseInt(String(amount).replace(/\D/g,""),10);
    if (!desc.trim() || !amt || !paidBy || !among.length) return;
    const per = amt / among.length;
    const shares = {}; among.forEach((id) => (shares[id] = per));
    onSave({ id: uid(), desc: desc.trim(), amount: amt, paidBy, shares, category: cat, at: Date.now() }, null);
  };
  return (
    <div style={ov} onClick={onClose}>
      <div style={modalSt(t)} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={mTitle(t)}>Pengeluaran baru</h3>
          <button onClick={onClose} style={btnX(t)}><X size={18} /></button>
        </div>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Untuk apa? mis. Bensin" style={inputSt(t)} />
        <input value={amount ? parseInt(String(amount).replace(/\D/g,"")||"0",10).toLocaleString("id-ID") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g,""))} placeholder="Jumlah" inputMode="numeric" style={{ ...inputSt(t), marginTop: 8, ...num }} />
        <div style={labelSt(t)}>Kategori</div>
        <CatChips value={cat} onChange={setCat} t={t} />
        <div style={labelSt(t)}>Dibayar oleh</div>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={inputSt(t)}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div style={labelSt(t)}>Dibagi ke</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {members.map((m) => { const on = among.includes(m.id); return (<button key={m.id} onClick={() => toggle(m.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", border: `1px solid ${on ? m.color : t.border}`, borderRadius: 8, background: on ? m.color + "18" : t.surface, fontSize: 13, fontWeight: 600, color: on ? m.color : t.muted, cursor: "pointer", fontFamily: "inherit" }}>{on && <Check size={12} />}{m.name}</button>); })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnSecondary(t)}>Batal</button>
          <button onClick={save} style={btnPrimary(t)}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [dark, toggleDark] = useDark();
  const t = dark ? T.dark : T.light;

  const [tripId, setTripId]     = useState(() => {
    try {
      const hash = window.location.hash.replace(/^#\/?(trip\/)?/, "");
      if (hash) { addMyTripId(hash); return hash; }
      const stored = localStorage.getItem("sb-tripid");
      if (stored) { addMyTripId(stored); return stored; }
      const unique = "trip-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem("sb-tripid", unique);
      addMyTripId(unique);
      return unique;
    } catch { return "default-trip"; }
  });
  const [tripName, setTripName] = useState("Trip Saya");
  const [allTrips, setAllTrips] = useState([]);
  const [members, setMembers]   = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab]           = useState("expenses");
  const [loading, setLoading]   = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [newName, setNewName]   = useState("");
  const [modal, setModal]       = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [openExpense, setOpen]  = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const lastUpdatedRef = useRef(null);

  const loadTrip = useCallback(async (id, isInit = false) => {
    try {
      const row = await sb.getTrip(id);
      if (!row) { if (isInit) setLoading(false); return; }
      if (!isInit && row.updated_at === lastUpdatedRef.current) return;
      lastUpdatedRef.current = row.updated_at;
      const data = row.data;
      setTripName(data.name || "Trip Saya");
      setMembers(data.members || []);
      setExpenses(data.expenses || []);
    } catch { } finally { if (isInit) setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true); setMembers([]); setExpenses([]);
    loadTrip(tripId, true);
    const interval = setInterval(() => loadTrip(tripId, false), POLL_MS);
    return () => clearInterval(interval);
  }, [tripId, loadTrip]);

  useEffect(() => {
    const ids = getMyTripIds();
    sb.getTripsByIds(ids).then((rows) => {
      // Preserve local order (most recently added first)
      const map = new Map((rows || []).map((r) => [r.id, r]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean);
      // Also include any trips from DB that aren't yet in local but exist (defensive)
      setAllTrips(ordered);
    }).catch(() => {});
  }, [tripId]);

  // Listen for URL hash changes (e.g. someone opens a shared link in same tab)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?(trip\/)?/, "");
      if (hash && hash !== tripId) {
        try { localStorage.setItem("sb-tripid", hash); } catch {}
        addMyTripId(hash);
        setTripId(hash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [tripId]);

  // Set hash on initial load if not present
  useEffect(() => {
    if (!window.location.hash) {
      try { window.location.hash = tripId; } catch {}
    }
  }, [tripId]);

  const persist = async (m, e, name = tripName) => {
    setSaveState("saving");
    try {
      await sb.saveTrip(tripId, { name, members: m, expenses: e });
      lastUpdatedRef.current = new Date().toISOString();
      setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1800);
    } catch { setSaveState("error"); setTimeout(() => setSaveState("idle"), 3000); }
  };

  const switchTrip = (id) => {
    try {
      localStorage.setItem("sb-tripid", id);
      window.location.hash = id;
    } catch {}
    addMyTripId(id);
    setTripId(id); setModal(null); setFilterCat("all");
  };
  const createTrip = async (name) => {
    const id = "trip-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    await sb.saveTrip(id, { name, members: [], expenses: [] });
    addMyTripId(id);
    switchTrip(id);
  };
  const deleteTrip = async (id) => {
    // Always remove from local list first (this hides it from the dropdown even if server delete fails)
    removeMyTripId(id);
    // Try server delete (may fail silently if RLS prevents)
    try {
      const row = await sb.getTrip(id);
      const exps = row?.data?.expenses || [];
      await Promise.all(exps.filter((e) => e.hasReceipt).map((e) => sb.deletePhoto(e.id)));
    } catch {}
    try { await sb.deleteTrip(id); } catch {}
    // Refresh local list view
    const ids = getMyTripIds();
    const rows = await sb.getTripsByIds(ids);
    const map = new Map((rows || []).map((r) => [r.id, r]));
    const ordered = ids.map((x) => map.get(x)).filter(Boolean);
    setAllTrips(ordered);
    // If deleted current, switch to another or create new
    if (id === tripId) {
      const next = ordered[0];
      if (next) switchTrip(next.id);
      else await createTrip("Trip Saya");
    }
  };

  const renameTripName = (name) => { setTripName(name); persist(members, expenses, name); };

  const addMember = () => {
    const name = newName.trim(); if (!name) return;
    const next = [...members, { id: uid(), name, color: palette[members.length % palette.length], account: "" }];
    setMembers(next); persist(next, expenses); setNewName("");
  };
  const removeMember = (id) => {
    const next = members.filter((m) => m.id !== id);
    const nextExp = expenses.map((e) => {
      if (e.paidBy === id) return null;
      if (!e.shares || e.shares[id] == null) return e;
      if (e.items && e.items.length > 0) {
        const newItems = e.items.map((it) => ({ ...it, who: (it.who || []).filter((x) => x !== id) }));
        if (!newItems.some((it) => it.who.length > 0)) return null;
        const charges = e.charges || { tax: 0, service: 0, discount: 0 };
        const { shares, amount } = computeReceiptShares(newItems, charges, next);
        if (!Object.keys(shares).length) return null;
        return { ...e, items: newItems, shares, amount };
      }
      const remaining = Object.keys(e.shares).filter((x) => x !== id);
      if (!remaining.length) return null;
      const per = e.amount / remaining.length;
      const shares = {}; remaining.forEach((k) => (shares[k] = per));
      return { ...e, shares };
    }).filter(Boolean);
    setMembers(next); setExpenses(nextExp); persist(next, nextExp);
  };
  const setAccount = (id, account) => { const next = members.map((m) => m.id === id ? { ...m, account } : m); setMembers(next); persist(next, expenses); };
  const addExpense = async (exp, photoDataUrl) => {
    const next = [exp, ...expenses];
    setExpenses(next); persist(members, next); setModal(null);
    if (photoDataUrl) { try { await sb.savePhoto(exp.id, photoDataUrl); } catch {} }
  };
  const updateExpense = (updated) => {
    const next = expenses.map((e) => e.id === updated.id ? updated : e);
    setExpenses(next); persist(members, next); setOpen(updated);
  };
  const removeExpense = async (id) => {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next); persist(members, next);
    try { await sb.deletePhoto(id); } catch {}
  };

  const total   = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const { balances, tx } = useMemo(() => settle(members, expenses), [members, expenses]);
  const catTotals = useMemo(() => { const r = {}; expenses.forEach((e) => { r[e.category||"lainnya"] = (r[e.category||"lainnya"]||0) + e.amount; }); return r; }, [expenses]);
  const filteredExpenses = useMemo(() => filterCat === "all" ? expenses : expenses.filter((e) => (e.category||"lainnya") === filterCat), [expenses, filterCat]);

  const nameOf  = (id) => members.find((m) => m.id === id)?.name  || "?";

  if (loading)
    return (
      <div style={{ background: t.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={26} style={{ color: t.muted, animation: "spin 1s linear infinite" }} />
      </div>
    );

  return (
    <div style={{ fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif", background: t.bg, minHeight: "100vh", color: t.text, paddingBottom: 60, maxWidth: 560, margin: "0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        @keyframes slideUp { from { opacity:0; transform: translateY(20px) } to { opacity:1; transform:none } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .fadein { animation: fadeIn .2s ease both; }
        input:focus, select:focus, button:focus-visible { outline: 2px solid ${t.accent}66; outline-offset: 0; }
        button { cursor: pointer; font-family: inherit; }
        ::placeholder { color: ${t.muted}88; }
        .row:active { background: ${t.subtle} }
        select option { background: ${t.surface}; color: ${t.text}; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 3px; }
        body { background: ${t.bg}; }
      `}</style>

      {/* ─── HEADER ─── */}
      <header style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setModal("trips")} style={{ ...btnGhost(t), padding: "6px 10px" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{tripName.length > 22 ? tripName.slice(0,20)+"…" : tripName}</span>
          <ChevronDown size={13} style={{ color: t.muted }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {saveState === "saving" && <span style={{ fontSize: 11.5, color: t.muted, display: "flex", alignItems: "center", gap: 4 }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /></span>}
          {saveState === "saved"  && <span className="fadein" style={{ fontSize: 11.5, color: t.success, fontWeight: 500 }}>✓</span>}
          {saveState === "error"  && <span style={{ fontSize: 11.5, color: t.danger }}>⚠</span>}
          <button onClick={() => setModal("export")} style={btnX(t)} title="Bagikan ringkasan"><Share2 size={16} /></button>
          <button onClick={toggleDark} style={btnX(t)} title="Tema">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>

      {/* ─── HERO: Trip name + Total ─── */}
      <div style={{ padding: "16px 20px 22px" }}>
        <input
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          onBlur={(e) => renameTripName(e.target.value.trim() || "Trip Saya")}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
          style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, color: t.text, background: "none", border: "none", outline: "none", width: "100%", padding: 0, letterSpacing: -0.8, marginBottom: 4, fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 12, color: t.muted, fontWeight: 500 }}>Total</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: t.text, letterSpacing: -0.6, ...num }}>{rp(total)}</span>
        </div>
      </div>

      {/* ─── Category strip (filter) ─── */}
      {expenses.length > 0 && (
        <div style={{ padding: "0 20px 16px", display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          <button onClick={() => setFilterCat("all")} style={{ ...pillStyle(t), ...(filterCat==="all" ? { background: t.text, color: t.bg, borderColor: t.text } : {}) }}>Semua</button>
          {CATEGORIES.filter((c) => catTotals[c.id]).map((c) => (
            <button key={c.id} onClick={() => setFilterCat(filterCat===c.id ? "all" : c.id)}
              style={{ ...pillStyle(t), ...(filterCat===c.id ? { background: c.color + "18", color: c.color, borderColor: c.color + "55" } : {}) }}>
              <c.icon size={11} strokeWidth={2.2} />{c.label} <span style={{ opacity: 0.7, ...num }}>{rp(catTotals[c.id])}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: t.border, margin: "0 20px" }} />

      {/* ─── Anggota ─── */}
      <section style={{ padding: "20px 20px 0" }}>
        <div style={labelSt(t)}>Anggota</div>
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
          {members.length === 0 && (
            <div style={{ padding: "18px 14px", textAlign: "center", color: t.muted, fontSize: 13.5 }}>Belum ada anggota</div>
          )}
          {members.map((m, idx) => (
            <div key={m.id} style={{ borderTop: idx > 0 ? `1px solid ${t.divider}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                <Avatar name={m.name} color={m.color} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: t.text, fontSize: 14.5 }}>{m.name}</div>
                  {m.account && editAcct !== m.id && <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>{m.account}</div>}
                </div>
                <button onClick={() => setEditAcct(editAcct===m.id ? null : m.id)} style={{ ...btnGhost(t), padding: "5px 9px", fontSize: 12 }}>
                  <CreditCard size={11} />{m.account ? "ubah" : "rekening"}
                </button>
                <button onClick={() => removeMember(m.id)} style={{ ...btnX(t), width: 30, height: 30, color: t.muted }}><X size={14} /></button>
              </div>
              {editAcct === m.id && (
                <div style={{ padding: "0 12px 10px" }}>
                  <input autoFocus defaultValue={m.account} placeholder="BCA 1234567890 a.n. Nama / GoPay 0812…"
                    onBlur={(e) => { setAccount(m.id, e.target.value.trim()); setEditAcct(null); }}
                    onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                    style={{ ...inputSt(t), fontSize: 13, padding: "8px 10px" }} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} placeholder="Nama teman…" style={{ ...inputSt(t), padding: "10px 12px", fontSize: 14 }} />
          <button onClick={addMember} style={{ background: t.accent, color: t.accentText, border: "none", borderRadius: 10, width: 42, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Plus size={17} /></button>
        </div>
      </section>

      {/* ─── Tabs ─── */}
      <div style={{ padding: "24px 20px 0", display: "flex", gap: 24, borderBottom: `1px solid ${t.border}`, marginTop: 24 }}>
        {[["expenses","Pengeluaran",Receipt],["balance","Saldo",Scale]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: "none", border: "none", padding: "0 0 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 600, color: tab===key ? t.text : t.muted, borderBottom: tab===key ? `2px solid ${t.accent}` : "2px solid transparent", marginBottom: -1, fontFamily: "inherit" }}>
            <Icon size={14} strokeWidth={2.2} /> {label}
          </button>
        ))}
      </div>

      {/* ─── Expenses tab ─── */}
      {tab === "expenses" && (
        <section style={{ padding: "16px 20px 0" }}>
          {members.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setModal("scan")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", border: "none", background: t.accent, color: t.accentText, borderRadius: 11, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}><Camera size={15} /> Scan struk</button>
              <button onClick={() => setModal("manual")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "12px 16px", border: `1px solid ${t.border}`, background: t.surface, color: t.textSoft, borderRadius: 11, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}><Plus size={15} /> Manual</button>
            </div>
          )}

          {members.length === 0 && (
            <div style={emptyStyle(t)}>Tambah anggota dulu untuk mulai patungan</div>
          )}
          {members.length > 0 && filteredExpenses.length === 0 && (
            <div style={emptyStyle(t)}>{filterCat==="all" ? "Belum ada pengeluaran" : `Tidak ada pengeluaran kategori ${catOf(filterCat).label}`}</div>
          )}

          {filteredExpenses.length > 0 && (
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
              {filteredExpenses.map((e, idx) => {
                const cat = catOf(e.category);
                return (
                  <div key={e.id} className="row" style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 14px", borderTop: idx > 0 ? `1px solid ${t.divider}` : "none", cursor: "pointer" }} onClick={() => setOpen(e)}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: cat.color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <cat.icon size={15} strokeWidth={2.2} style={{ color: cat.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 5 }}>
                        {e.scanned && <Sparkles size={11} style={{ color: t.accent, flexShrink: 0 }} />}{e.desc}
                      </div>
                      <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
                        {nameOf(e.paidBy)} · {Object.keys(e.shares||{}).length} orang
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: t.text, ...num }}>{rp(e.amount)}</div>
                      {e.hasReceipt && <Camera size={11} style={{ color: t.muted }} />}
                    </div>
                    <ChevronRight size={15} style={{ color: t.muted, flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ─── Balance tab ─── */}
      {tab === "balance" && (
        <section style={{ padding: "16px 20px 0" }}>
          <div style={labelSt(t)}>Posisi tiap orang</div>
          {balances.length === 0
            ? <div style={emptyStyle(t)}>Belum ada data</div>
            : (
              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
                {balances.map((b, idx) => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", borderTop: idx > 0 ? `1px solid ${t.divider}` : "none" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={b.name} color={b.color} size={28} />
                      <span style={{ fontWeight: 600, color: t.text, fontSize: 14.5 }}>{b.name}</span>
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15, color: b.amount > 0 ? t.success : b.amount < 0 ? t.danger : t.muted, ...num }}>
                      {b.amount > 0 ? "+" : ""}{rp(b.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )
          }

          <div style={labelSt(t)}>Transfer</div>
          {tx.length === 0
            ? <div style={{ ...emptyStyle(t), color: t.success }}>Semua sudah lunas ✓</div>
            : (
              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
                {tx.map((tt, i) => (
                  <div key={i} style={{ padding: "13px 14px", borderTop: i > 0 ? `1px solid ${t.divider}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar name={tt.from.name} color={tt.from.color} size={22} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{tt.from.name}</span>
                      </span>
                      <ArrowRight size={13} style={{ color: t.muted }} />
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar name={tt.to.name} color={tt.to.color} size={22} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{tt.to.name}</span>
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 14.5, marginLeft: "auto", color: t.text, ...num }}>{rp(tt.amount)}</span>
                    </div>
                    {tt.to.account && <div style={{ fontSize: 12, color: t.muted, marginTop: 6, paddingLeft: 30 }}>{tt.to.account}</div>}
                    {!tt.to.account && <div style={{ fontSize: 12, color: t.muted, marginTop: 6, paddingLeft: 30, fontStyle: "italic" }}>tambah rekening {tt.to.name}</div>}
                  </div>
                ))}
              </div>
            )
          }
          {tx.length > 0 && (
            <button onClick={() => setModal("export")} style={{ ...btnPrimary(t), width: "100%", marginTop: 16 }}>
              <Share2 size={14} /> Bagikan ke grup
            </button>
          )}
        </section>
      )}

      {modal === "scan"   && <ScanModal   members={members} onClose={() => setModal(null)} onSave={addExpense} t={t} />}
      {modal === "manual" && <ManualModal members={members} onClose={() => setModal(null)} onSave={addExpense} t={t} />}
      {modal === "export" && <ExportModal tripId={tripId} tripName={tripName} members={members} expenses={expenses} balances={balances} tx={tx} onClose={() => setModal(null)} t={t} />}
      {modal === "trips"  && <TripSelector currentId={tripId} trips={allTrips} onSelect={switchTrip} onCreate={createTrip} onDelete={deleteTrip} onClose={() => setModal(null)} t={t} />}
      {openExpense && <DetailModal expense={openExpense} members={members} onClose={() => setOpen(null)} onUpdate={updateExpense} onDelete={(id) => { removeExpense(id); setOpen(null); }} t={t} />}
    </div>
  );
}

const pillStyle = (t) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", border: `1px solid ${t.border}`, borderRadius: 7, background: t.surface, fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", color: t.textSoft, cursor: "pointer", fontFamily: "inherit" });
const emptyStyle = (t) => ({ padding: "32px 18px", textAlign: "center", color: t.muted, fontSize: 13.5, background: t.surface, borderRadius: 12, border: `1px dashed ${t.border}` });
