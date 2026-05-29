import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  Users,
  Receipt,
  Scale,
  X,
  ArrowRight,
  Wallet,
  Check,
  Camera,
  Sparkles,
  Loader2,
  CreditCard,
  ChevronRight,
  Share2,
  Pencil,
  Moon,
  Sun,
  UtensilsCrossed,
  Car,
  BedDouble,
  ShoppingBag,
  Music,
  MoreHorizontal,
  ChevronDown,
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
  async getTrips() {
    const r = await sbFetch("trip_data?select=id,data,updated_at&order=updated_at.desc");
    return await r.json();
  },
  async getTrip(id) {
    const r = await sbFetch(`trip_data?id=eq.${id}&select=data,updated_at`);
    const rows = await r.json();
    return rows?.[0] ?? null;
  },
  async saveTrip(id, data) {
    await sbFetch("trip_data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
    });
  },
  async getPhoto(id) {
    const r = await sbFetch(`receipt_photos?id=eq.${id}&select=photo`);
    const rows = await r.json();
    return rows?.[0]?.photo ?? null;
  },
  async savePhoto(id, photo) {
    await sbFetch("receipt_photos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id, photo }),
    });
  },
  async deletePhoto(id) {
    await sbFetch(`receipt_photos?id=eq.${id}`, { method: "DELETE" });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const palette = ["#c75b39","#2d6a4f","#bc6c25","#3a6ea5","#9d4edd","#d62828","#0a9396","#7f5539"];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const CATEGORIES = [
  { id: "makan",      label: "Makan",      icon: UtensilsCrossed, color: "#c75b39" },
  { id: "transport",  label: "Transport",  icon: Car,             color: "#3a6ea5" },
  { id: "penginapan", label: "Penginapan", icon: BedDouble,       color: "#2d6a4f" },
  { id: "belanja",    label: "Belanja",    icon: ShoppingBag,     color: "#bc6c25" },
  { id: "hiburan",    label: "Hiburan",    icon: Music,           color: "#9d4edd" },
  { id: "lainnya",    label: "Lainnya",    icon: MoreHorizontal,  color: "#888"    },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[5];

// Compress to ~400KB max
function compressImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // Try to get under ~400KB
        let q = quality;
        let dataUrl = canvas.toDataURL("image/jpeg", q);
        while (dataUrl.length > 550000 && q > 0.4) {
          q -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", q);
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

function buildWAText(tripName, members, expenses, tx) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "?";
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const lines = [`🏔️ *${tripName} — Ringkasan Patungan*`, ""];
  lines.push(`💰 Total: *${rp(total)}*`, "");
  const byCat = {};
  expenses.forEach((e) => {
    const c = catOf(e.category);
    if (!byCat[c.id]) byCat[c.id] = { label: c.label, items: [], total: 0 };
    byCat[c.id].items.push(e);
    byCat[c.id].total += e.amount;
  });
  Object.values(byCat).forEach((cat) => {
    lines.push(`*${cat.label}* (${rp(cat.total)})`);
    cat.items.forEach((e) => lines.push(`  • ${e.desc} — ${rp(e.amount)} _(${nameOf(e.paidBy)})_`));
    lines.push("");
  });
  if (tx.length === 0) {
    lines.push("✅ Semua sudah lunas!");
  } else {
    lines.push("💸 *Yang perlu transfer:*");
    tx.forEach((t) => {
      const acct = t.to.account ? ` → ${t.to.account}` : "";
      lines.push(`• ${t.from.name} bayar *${rp(t.amount)}* ke ${t.to.name}${acct}`);
    });
  }
  return lines.join("\n");
}

// ── Dark mode hook ────────────────────────────────────────────────────
function useDark() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("splitbill-dark") === "1"; } catch { return false; }
  });
  const toggle = () => setDark((d) => {
    try { localStorage.setItem("splitbill-dark", d ? "0" : "1"); } catch {}
    return !d;
  });
  return [dark, toggle];
}

// ── Theme ─────────────────────────────────────────────────────────────
const T = {
  light: {
    bg: "#faf4ea", card: "#fff", header: "linear-gradient(150deg,#c75b39,#a8432a)",
    text: "#2a1f1a", muted: "#8a7d6e", border: "#e6d9c6", input: "#fff",
    pill: "#f5ede0", accent: "#c75b39", accentText: "#fff",
    shadow: "0 2px 8px #00000010", settingBg: "#f5ede0",
  },
  dark: {
    bg: "#1a1410", card: "#251e18", header: "linear-gradient(150deg,#8a3520,#6b2918)",
    text: "#f0e8dc", muted: "#a89880", border: "#3a2e24", input: "#2e2318",
    pill: "#2e2318", accent: "#c75b39", accentText: "#fff",
    shadow: "0 2px 8px #00000040", settingBg: "#2e2318",
  },
};

// ── Category chips ────────────────────────────────────────────────────
function CatChips({ value, onChange, t }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {CATEGORIES.map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "6px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600,
          border: `1.5px solid ${value === c.id ? c.color : t.border}`,
          background: value === c.id ? c.color + "22" : t.input,
          color: value === c.id ? c.color : t.muted,
        }}>
          <c.icon size={13} />{c.label}
        </button>
      ))}
    </div>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────
function ExportModal({ tripName, members, expenses, tx, onClose, t }) {
  const text = useMemo(() => buildWAText(tripName, members, expenses, tx), [tripName, members, expenses, tx]);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  const share = () => { if (navigator.share) navigator.share({ text }); else copy(); };
  return (
    <div style={ov} onClick={onClose}>
      <div style={modal(t)} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={mTitle(t)}>Export ke WhatsApp</h3>
          <button onClick={onClose} style={closeBtn(t)}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", background: t.input, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "monospace", color: t.text, marginBottom: 14, maxHeight: "52vh" }}>
          {text}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={copy} style={secBtn(t)}>{copied ? "✓ Disalin!" : "Copy teks"}</button>
          <button onClick={share} style={priBtn(t)}><Share2 size={16} /> Bagikan</button>
        </div>
      </div>
    </div>
  );
}

// ── Detail / Edit Modal ───────────────────────────────────────────────
function DetailModal({ expense, members, onClose, onUpdate, onDelete, t }) {
  const [photo, setPhoto]           = useState(null);
  const [photoState, setPhotoState] = useState(expense.hasReceipt ? "loading" : "none");
  const [editing, setEditing]       = useState(false);
  const [editDesc, setEditDesc]     = useState(expense.desc);
  const [editAmt, setEditAmt]       = useState(String(expense.amount));
  const [editPaidBy, setEditPaidBy] = useState(expense.paidBy);
  const [editCat, setEditCat]       = useState(expense.category || "lainnya");

  useEffect(() => {
    if (!expense.hasReceipt) return;
    sb.getPhoto(expense.id).then((p) => {
      if (p) { setPhoto(p); setPhotoState("ok"); } else setPhotoState("missing");
    }).catch(() => setPhotoState("missing"));
  }, [expense.id, expense.hasReceipt]);

  const nameOf  = (id) => members.find((m) => m.id === id)?.name  || "?";
  const colorOf = (id) => members.find((m) => m.id === id)?.color || "#999";
  const dateStr = new Date(expense.at || Date.now()).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const saveEdit = () => {
    const amt = parseInt(String(editAmt).replace(/\D/g, ""), 10);
    if (!editDesc.trim() || !amt) return;
    const among = Object.keys(expense.shares || {});
    const per = amt / (among.length || 1);
    const shares = {}; among.forEach((id) => (shares[id] = per));
    onUpdate({ ...expense, desc: editDesc.trim(), amount: amt, paidBy: editPaidBy, shares, category: editCat });
    setEditing(false);
  };

  const cat = catOf(expense.category);
  const inp = { ...inputStyle(t), marginTop: 0 };

  return (
    <div style={ov} onClick={onClose}>
      <div style={modal(t)} onClick={(e) => e.stopPropagation()}>
        <div style={{ maxHeight: "86vh", overflowY: "auto", padding: "0 2px 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: t.accent }}>
                {expense.scanned ? "DARI STRUK" : "MANUAL"} · {dateStr}
              </div>
              {editing
                ? <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ ...inp, fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, marginTop: 4 }} />
                : <h3 style={{ ...mTitle(t), marginTop: 4 }}>{expense.desc}</h3>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditing(!editing)} style={{ ...closeBtn(t), color: editing ? t.accent : t.muted }}><Pencil size={16} /></button>
              <button onClick={onClose} style={closeBtn(t)}><X size={18} /></button>
            </div>
          </div>

          {!editing && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "4px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 12.5, fontWeight: 700 }}>
              <cat.icon size={13} />{cat.label}
            </div>
          )}

          {editing ? (
            <div style={{ marginTop: 12 }}>
              <div style={fLabel(t)}>Kategori</div>
              <CatChips value={editCat} onChange={setEditCat} t={t} />
              <div style={fLabel(t)}>Jumlah</div>
              <input value={parseInt(String(editAmt).replace(/\D/g,"")||"0",10).toLocaleString("id-ID")} onChange={(e) => setEditAmt(e.target.value.replace(/\D/g,""))} inputMode="numeric" style={inp} />
              <div style={fLabel(t)}>Dibayar oleh</div>
              <select value={editPaidBy} onChange={(e) => setEditPaidBy(e.target.value)} style={inp}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={() => { onDelete(expense.id); onClose(); }} style={{ ...secBtn(t), color: "#c1121f", borderColor: "#c1121f44" }}>Hapus</button>
                <button onClick={saveEdit} style={priBtn(t)}>Simpan</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: t.accent, color: "#fff", padding: "14px 18px", borderRadius: 16, marginTop: 14, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 26 }}>{rp(expense.amount)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: t.muted, marginTop: 8 }}>
                Dibayar <b style={{ color: colorOf(expense.paidBy) }}>{nameOf(expense.paidBy)}</b>
              </div>

              {expense.hasReceipt && (
                <div style={{ marginTop: 18 }}>
                  <div style={secLabel(t)}><Camera size={13} /> Foto struk</div>
                  <div style={{ marginTop: 8, background: t.card, borderRadius: 14, padding: 8 }}>
                    {photoState === "loading" && <div style={{ padding: "30px 0", textAlign: "center", color: t.muted }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /></div>}
                    {photoState === "ok" && photo && <img src={photo} alt="Struk" style={{ width: "100%", borderRadius: 10, display: "block", maxHeight: 420, objectFit: "contain" }} />}
                    {photoState === "missing" && <div style={{ padding: "20px 0", textAlign: "center", color: t.muted, fontSize: 13 }}>Foto tidak tersedia.</div>}
                  </div>
                </div>
              )}

              {expense.items?.length > 0 && (
                <>
                  <div style={{ ...secLabel(t), marginTop: 20 }}><Receipt size={13} /> Rincian item</div>
                  {expense.items.map((it, idx) => (
                    <div key={idx} style={{ background: t.card, borderRadius: 12, padding: "11px 14px", marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, color: t.text }}>{it.name}</span>
                        <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", color: t.text }}>{rp(it.price)}</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                        {(it.who || []).map((id) => (<span key={id} style={{ padding: "3px 9px", borderRadius: 14, fontSize: 11.5, fontWeight: 700, background: colorOf(id) + "22", color: colorOf(id) }}>{nameOf(id)}</span>))}
                      </div>
                    </div>
                  ))}
                  {expense.charges && (
                    <div style={{ marginTop: 8, padding: "10px 14px", background: t.card, borderRadius: 12 }}>
                      {!!expense.charges.tax      && <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13.5, color: t.muted }}><span>Pajak</span><span>{rp(expense.charges.tax)}</span></div>}
                      {!!expense.charges.service  && <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13.5, color: t.muted }}><span>Service charge</span><span>{rp(expense.charges.service)}</span></div>}
                      {!!expense.charges.discount && <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13.5, color: t.muted }}><span>Diskon</span><span style={{ color: "#2d6a4f" }}>−{rp(expense.charges.discount)}</span></div>}
                    </div>
                  )}
                </>
              )}

              <div style={{ ...secLabel(t), marginTop: 20 }}><Users size={13} /> Pembagian</div>
              <div style={{ background: t.card, borderRadius: 14, padding: "10px 14px", marginTop: 8 }}>
                {Object.entries(expense.shares || {}).map(([id, amt]) => (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.bg}` }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 9, background: colorOf(id) }} />
                      <span style={{ fontWeight: 600, color: t.text }}>{nameOf(id)}</span>
                      {id === expense.paidBy && <span style={{ fontSize: 10.5, letterSpacing: 1, fontWeight: 700, color: t.accent, background: t.accent + "18", padding: "2px 7px", borderRadius: 10, textTransform: "uppercase" }}>nalangin</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: t.text }}>{rp(amt)}</span>
                  </div>
                ))}
              </div>
              <button onClick={onClose} style={{ ...secBtn(t), width: "100%", marginTop: 18 }}>Tutup</button>
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
      const dataUrl = await compressImage(file);
      setPhoto(dataUrl);
      const b64 = dataUrl.split(",")[1];
      const prompt = 'Kamu parser struk belanja. Balas HANYA JSON minified valid tanpa markdown. Skema: {"merchant":string,"items":[{"name":string,"price":number}],"tax":number,"service":number,"discount":number,"total":number}. price = total harga baris dalam rupiah, angka bulat. Jika tidak ada isi 0.';
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b64, prompt }) });
      const data = await res.json();
      const parsed = JSON.parse((data.text || "").replace(/```json|```/g, "").trim());
      setMerchant(parsed.merchant || "Struk");
      setItems((parsed.items || []).map((it) => ({ id: uid(), name: it.name || "Item", price: Math.round(Number(it.price)||0), who: members.map((m) => m.id) })));
      setCharges({ tax: Math.round(Number(parsed.tax)||0), service: Math.round(Number(parsed.service)||0), discount: Math.round(Number(parsed.discount)||0) });
      setStep("review");
    } catch { setErrMsg("Gagal membaca struk. Coba foto yang lebih jelas."); setStep("error"); }
  };

  const toggleWho  = (iid, mid) => setItems((a) => a.map((it) => it.id !== iid ? it : { ...it, who: it.who.includes(mid) ? it.who.filter((x) => x !== mid) : [...it.who, mid] }));
  const setField   = (iid, f, v) => setItems((a) => a.map((it) => it.id !== iid ? it : { ...it, [f]: v }));
  const removeItem = (iid) => setItems((a) => a.filter((it) => it.id !== iid));
  const preview    = useMemo(() => computeReceiptShares(items, charges, members), [items, charges, members]);
  const inp        = inputStyle(t);

  const save = () => {
    const { shares, amount } = preview;
    if (!paidBy || amount <= 0 || !Object.keys(shares).length) return;
    onSave({ id: uid(), desc: merchant || "Struk", amount, paidBy, shares, category, at: Date.now(), scanned: true, items: items.map(({ name, price, who }) => ({ name, price, who })), charges: { ...charges }, hasReceipt: !!photoUrl }, photoUrl);
  };

  return (
    <div style={ov} onClick={onClose}>
      <div style={modal(t)} onClick={(e) => e.stopPropagation()}>
        {step === "upload" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: t.accent + "18", color: t.accent, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Camera size={30} /></div>
            <h3 style={mTitle(t)}>Scan struk</h3>
            <p style={{ color: t.muted, fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>Foto atau pilih gambar struk — AI membaca item otomatis.</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <button onClick={() => fileRef.current.click()} style={priBtn(t)}><Sparkles size={17} /> Pilih foto struk</button>
            <button onClick={onClose} style={{ ...secBtn(t), width: "100%", marginTop: 10 }}>Batal</button>
          </div>
        )}
        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Loader2 size={34} style={{ color: t.accent, animation: "spin 1s linear infinite" }} />
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, marginTop: 14, color: t.accent }}>Membaca struk…</p>
            <p style={{ color: t.muted, fontSize: 13, marginTop: 6 }}>Biasanya 5–10 detik</p>
          </div>
        )}
        {step === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <h3 style={mTitle(t)}>Hmm…</h3>
            <p style={{ color: t.muted, fontSize: 14, margin: "0 0 18px" }}>{errMsg}</p>
            <button onClick={() => setStep("upload")} style={priBtn(t)}>Coba lagi</button>
            <button onClick={onClose} style={{ ...secBtn(t), width: "100%", marginTop: 10 }}>Batal</button>
          </div>
        )}
        {step === "review" && (
          <div style={{ maxHeight: "78vh", overflowY: "auto", margin: "-4px -4px 0", padding: 4 }}>
            {photoUrl && <div style={{ marginBottom: 14, borderRadius: 12, overflow: "hidden", maxHeight: 140 }}><img src={photoUrl} alt="Struk" style={{ width: "100%", objectFit: "cover", display: "block", maxHeight: 140 }} /></div>}
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} style={{ ...inp, fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, padding: "8px 12px", border: `1.5px dashed ${t.border}` }} />
            <div style={fLabel(t)}>Kategori</div>
            <CatChips value={category} onChange={setCat} t={t} />
            <div style={fLabel(t)}>Item — pilih siapa yang ikut</div>
            {items.map((it) => (
              <div key={it.id} style={{ background: t.card, borderRadius: 13, padding: "11px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={it.name} onChange={(e) => setField(it.id, "name", e.target.value)} style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: 14 }} />
                  <input value={(it.price||0).toLocaleString("id-ID")} onChange={(e) => setField(it.id, "price", parseInt(e.target.value.replace(/\D/g,"")||"0",10))} inputMode="numeric" style={{ ...inp, width: 88, padding: "7px 10px", fontSize: 14, textAlign: "right" }} />
                  <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#c1121f", padding: 4, display: "flex" }}><X size={15} /></button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {members.map((m) => { const on = it.who.includes(m.id); return (<button key={m.id} onClick={() => toggleWho(it.id, m.id)} style={{ padding: "5px 11px", border: `1.5px solid ${on ? m.color : t.border}`, borderRadius: 16, background: on ? m.color : t.input, fontSize: 12.5, fontWeight: 600, color: on ? "#fff" : t.muted }}>{m.name}</button>); })}
                </div>
              </div>
            ))}
            {[["Pajak (PB1)","tax"],["Service charge","service"],["Diskon","discount"]].map(([label, key]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 2px", fontSize: 14, fontWeight: 600, color: t.muted }}>
                <span>{label}</span>
                <input value={(charges[key]||0).toLocaleString("id-ID")} inputMode="numeric" onChange={(e) => setCharges({ ...charges, [key]: parseInt(e.target.value.replace(/\D/g,"")||"0",10) })} style={{ width: 110, padding: "7px 10px", border: `1.5px solid ${t.border}`, borderRadius: 10, fontSize: 14, textAlign: "right", background: t.input, color: t.text }} />
              </div>
            ))}
            <div style={fLabel(t)}>Dibayar oleh</div>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={inp}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ background: "#2d4a3e18", border: "1.5px solid #2d6a4f33", borderRadius: 14, padding: "14px 16px", marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 6, color: t.text }}><span>Total</span><span>{rp(preview.amount)}</span></div>
              {members.filter((m) => preview.shares[m.id]).map((m) => (<div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: t.muted, padding: "2px 0" }}><span>{m.name}</span><span>{rp(preview.shares[m.id])}</span></div>))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={secBtn(t)}>Batal</button>
              <button onClick={save} style={priBtn(t)}>Simpan</button>
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
  const inp = inputStyle(t);
  return (
    <div style={ov} onClick={onClose}>
      <div style={modal(t)} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={mTitle(t)}>Catat pengeluaran</h3>
          <button onClick={onClose} style={closeBtn(t)}><X size={18} /></button>
        </div>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Untuk apa? (mis. Bensin)" style={inp} />
        <input value={amount ? parseInt(String(amount).replace(/\D/g,"")||"0",10).toLocaleString("id-ID") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g,""))} placeholder="Jumlah (Rp)" inputMode="numeric" style={{ ...inp, marginTop: 10 }} />
        <div style={fLabel(t)}>Kategori</div>
        <CatChips value={cat} onChange={setCat} t={t} />
        <div style={fLabel(t)}>Dibayar oleh</div>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={inp}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div style={fLabel(t)}>Dibagi rata ke</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {members.map((m) => { const on = among.includes(m.id); return (<button key={m.id} onClick={() => toggle(m.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", border: `1.5px solid ${on ? m.color : t.border}`, borderRadius: 20, background: on ? m.color : t.input, fontSize: 14, fontWeight: 600, color: on ? "#fff" : t.muted }}>{on && <Check size={13} />}{m.name}</button>); })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={secBtn(t)}>Batal</button>
          <button onClick={save} style={priBtn(t)}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── Trip Selector ─────────────────────────────────────────────────────
function TripSelector({ currentId, trips, onSelect, onCreate, onRename, t }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const inp = inputStyle(t);
  const create = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName(""); setCreating(false);
  };
  return (
    <div style={ov} onClick={() => {}}>
      <div style={modal(t)} onClick={(e) => e.stopPropagation()}>
        <h3 style={mTitle(t)}>Pilih Trip</h3>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
          {trips.map((trip) => (
            <button key={trip.id} onClick={() => onSelect(trip.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: trip.id === currentId ? t.accent + "18" : t.card, border: `1.5px solid ${trip.id === currentId ? t.accent : t.border}`, borderRadius: 14, textAlign: "left", cursor: "pointer" }}>
              <span style={{ fontWeight: 700, flex: 1, color: trip.id === currentId ? t.accent : t.text }}>{trip.data?.name || trip.id}</span>
              {trip.id === currentId && <Check size={16} style={{ color: t.accent }} />}
            </button>
          ))}
        </div>
        {creating ? (
          <div style={{ marginTop: 14 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Nama trip baru…" style={{ ...inp, marginBottom: 10 }} autoFocus />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setCreating(false)} style={secBtn(t)}>Batal</button>
              <button onClick={create} style={priBtn(t)}>Buat trip</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ ...priBtn(t), width: "100%", marginTop: 14 }}><Plus size={16} /> Trip baru</button>
        )}
      </div>
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────
const ov = { position: "fixed", inset: 0, background: "#2a1f1a99", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, backdropFilter: "blur(3px)" };
const modal  = (t) => ({ background: t.bg, width: "100%", maxWidth: 520, borderRadius: "24px 24px 0 0", padding: "22px 18px 28px", animation: "pop .2s ease both" });
const mTitle = (t) => ({ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, margin: "0 0 4px", color: t.text });
const fLabel = (t) => ({ fontSize: 12.5, fontWeight: 700, color: t.accent, margin: "16px 0 8px", letterSpacing: 0.5 });
const secLabel=(t) => ({ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: t.accent });
const closeBtn=(t) => ({ border: "none", background: t.settingBg, color: t.muted, width: 34, height: 34, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" });
const priBtn = (t) => ({ flex: 2, padding: "13px", border: "none", background: t.accent, color: "#fff", borderRadius: 14, fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" });
const secBtn = (t) => ({ flex: 1, padding: "13px", border: `1.5px solid ${t.border}`, background: t.card, borderRadius: 14, fontWeight: 600, color: t.muted, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" });
const inputStyle = (t) => ({ width: "100%", padding: "12px 14px", border: `1.5px solid ${t.border}`, borderRadius: 12, fontSize: 15, background: t.input, color: t.text, display: "block" });

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [dark, toggleDark] = useDark();
  const t = dark ? T.dark : T.light;

  const [tripId, setTripId]     = useState(() => { try { return localStorage.getItem("splitbill-tripid") || "default-trip"; } catch { return "default-trip"; } });
  const [tripName, setTripName] = useState("Trip Saya");
  const [allTrips, setAllTrips] = useState([]);
  const [members, setMembers]   = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab]           = useState("expenses");
  const [loading, setLoading]   = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [newName, setNewName]   = useState("");
  const [modal, setModal]       = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [openExpense, setOpen]  = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const lastUpdatedRef = useRef(null);

  const loadTrip = useCallback(async (id, isInit = false) => {
    try {
      const row = await sb.getTrip(id);
      if (!row) {
        if (isInit) { setLoading(false); }
        return;
      }
      if (!isInit && row.updated_at === lastUpdatedRef.current) return;
      lastUpdatedRef.current = row.updated_at;
      const data = row.data;
      setTripName(data.name || "Trip Saya");
      setMembers(data.members || []);
      setExpenses(data.expenses || []);
    } catch { }
    finally { if (isInit) setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    setMembers([]); setExpenses([]);
    loadTrip(tripId, true);
    const interval = setInterval(() => loadTrip(tripId, false), POLL_MS);
    return () => clearInterval(interval);
  }, [tripId, loadTrip]);

  useEffect(() => {
    sb.getTrips().then((rows) => setAllTrips(rows || [])).catch(() => {});
  }, [tripId]);

  const persist = async (m, e, name = tripName) => {
    setSaveState("saving");
    try {
      await sb.saveTrip(tripId, { name, members: m, expenses: e });
      lastUpdatedRef.current = new Date().toISOString();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  const switchTrip = (id) => {
    try { localStorage.setItem("splitbill-tripid", id); } catch {}
    setTripId(id);
    setModal(null);
    setFilterCat("all");
  };

  const createTrip = async (name) => {
    const id = "trip-" + Date.now().toString(36);
    await sb.saveTrip(id, { name, members: [], expenses: [] });
    switchTrip(id);
  };

  const renameTripName = (name) => {
    setTripName(name);
    persist(members, expenses, name);
  };

  const addMember = () => {
    const name = newName.trim(); if (!name) return;
    const next = [...members, { id: uid(), name, color: palette[members.length % palette.length], account: "" }];
    setMembers(next); persist(next, expenses); setNewName("");
  };
  const removeMember = (id) => {
    const next = members.filter((m) => m.id !== id);
    const nextExp = expenses.map((e) => {
      if (e.paidBy === id) return null;
      const shares = { ...(e.shares || {}) }; delete shares[id];
      return Object.keys(shares).length ? { ...e, shares } : null;
    }).filter(Boolean);
    setMembers(next); setExpenses(nextExp); persist(next, nextExp);
  };
  const setAccount = (id, account) => {
    const next = members.map((m) => m.id === id ? { ...m, account } : m);
    setMembers(next); persist(next, expenses);
  };
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
  const catTotals = useMemo(() => {
    const t2 = {}; expenses.forEach((e) => { t2[e.category||"lainnya"] = (t2[e.category||"lainnya"]||0) + e.amount; });
    return t2;
  }, [expenses]);
  const filteredExpenses = useMemo(() =>
    filterCat === "all" ? expenses : expenses.filter((e) => (e.category||"lainnya") === filterCat),
    [expenses, filterCat]
  );

  const nameOf  = (id) => members.find((m) => m.id === id)?.name  || "?";
  const colorOf = (id) => members.find((m) => m.id === id)?.color || "#999";

  if (loading)
    return (
      <div style={{ background: t.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: t.accent, animation: "spin 1s linear infinite" }} />
          <div style={{ fontFamily: "Fraunces, serif", color: t.accent, fontSize: 18, marginTop: 12 }}>Memuat…</div>
        </div>
      </div>
    );

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: t.bg, minHeight: "100vh", color: t.text, paddingBottom: 40, maxWidth: 520, margin: "0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        @keyframes pop  { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .row { animation: pop .22s ease both; }
        input:focus, select:focus { outline: 2px solid #c75b3966; }
        button { cursor: pointer; font-family: inherit; }
        ::placeholder { color: ${t.muted}88; }
        .tap:active { transform: scale(0.984); }
        select option { background: ${t.input}; color: ${t.text}; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ background: t.header, color: "#fff", padding: "28px 20px 22px", borderRadius: "0 0 28px 28px", boxShadow: "0 8px 28px #00000022" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          {/* Trip name + switcher */}
          <button onClick={() => setModal("trips")} style={{ background: "none", border: "none", color: "#fff", display: "flex", alignItems: "center", gap: 6, padding: 0, opacity: 0.9 }}>
            <span style={{ fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>TRIP</span>
            <ChevronDown size={14} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saveState === "saving" && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#ffffff99" }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />menyimpan</div>}
            {saveState === "saved"  && <div style={{ fontSize: 11, color: "#ffffff88" }}>✓ tersimpan</div>}
            {saveState === "error"  && <div style={{ fontSize: 11, color: "#ffbbbb" }}>⚠ gagal simpan</div>}
            <button onClick={() => setModal("export")} style={{ background: "#ffffff18", border: "none", color: "#fff", borderRadius: 10, padding: "6px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700 }}>
              <Share2 size={13} /> WA
            </button>
            <button onClick={toggleDark} style={{ background: "#ffffff18", border: "none", color: "#fff", borderRadius: 10, padding: "7px", display: "flex" }}>
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
        {/* Editable trip name */}
        <input
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          onBlur={(e) => renameTripName(e.target.value.trim() || "Trip Saya")}
          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
          style={{ fontFamily: "Fraunces, serif", fontSize: 34, fontWeight: 600, lineHeight: 1.1, color: "#fff", background: "none", border: "none", outline: "none", width: "100%", padding: 0, marginBottom: 14 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "#ffffff1a", padding: "12px 16px", borderRadius: 14, fontSize: 14 }}>
          <span style={{ opacity: 0.85 }}>Total pengeluaran</span>
          <span style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600 }}>{rp(total)}</span>
        </div>
      </div>

      {/* Category filter strip */}
      {expenses.length > 0 && (
        <div style={{ padding: "14px 18px 0", display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          <button onClick={() => setFilterCat("all")} style={{ ...catPillStyle(t), ...(filterCat==="all" ? { background: t.text, color: t.bg, borderColor: t.text } : {}) }}>Semua</button>
          {CATEGORIES.filter((c) => catTotals[c.id]).map((c) => (
            <button key={c.id} onClick={() => setFilterCat(filterCat===c.id ? "all" : c.id)}
              style={{ ...catPillStyle(t), ...(filterCat===c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color, borderColor: c.color + "44" }) }}>
              <c.icon size={12} />{c.label} · {rp(catTotals[c.id])}
            </button>
          ))}
        </div>
      )}

      {/* Members */}
      <div style={{ padding: "18px 18px 0" }}>
        <div style={secLabel(t)}><Users size={13} /> Anggota</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => (
            <div key={m.id} style={{ background: t.card, borderRadius: 14, padding: "12px 14px", boxShadow: t.shadow }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 10, background: m.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, flex: 1, color: t.text }}>{m.name}</span>
                <button onClick={() => setEditAcct(editAcct===m.id ? null : m.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1.5px solid ${t.border}`, background: t.settingBg, borderRadius: 18, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: t.accent }}>
                  <CreditCard size={12} /> {m.account ? "ubah" : "rekening"}
                </button>
                <button onClick={() => removeMember(m.id)} style={{ border: "none", background: "none", color: "#c1121f", padding: 4, display: "flex" }}><Trash2 size={14} /></button>
              </div>
              {m.account && editAcct !== m.id && <div style={{ fontSize: 12.5, color: t.muted, marginTop: 5, paddingLeft: 20 }}>{m.account}</div>}
              {editAcct === m.id && (
                <input autoFocus defaultValue={m.account} placeholder="BCA 1234567890 a.n. Nama / GoPay 0812…"
                  onBlur={(e) => { setAccount(m.id, e.target.value.trim()); setEditAcct(null); }}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  style={{ ...inputStyle(t), marginTop: 8, fontSize: 13.5 }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} placeholder="Nama teman…" style={inputStyle(t)} />
          <button onClick={addMember} style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, width: 46, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Plus size={18} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "18px 18px 0" }}>
        <button onClick={() => setTab("expenses")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", border: `1.5px solid ${tab==="expenses" ? t.text : t.border}`, background: tab==="expenses" ? t.text : t.card, borderRadius: 14, fontWeight: 600, fontSize: 14, color: tab==="expenses" ? t.bg : t.muted }}><Receipt size={15} /> Pengeluaran</button>
        <button onClick={() => setTab("balance")}  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", border: `1.5px solid ${tab==="balance"  ? t.text : t.border}`, background: tab==="balance"  ? t.text : t.card, borderRadius: 14, fontWeight: 600, fontSize: 14, color: tab==="balance"  ? t.bg : t.muted }}><Scale size={15} /> Saldo</button>
      </div>

      {/* Expenses tab */}
      {tab === "expenses" && (
        <div style={{ padding: "14px 18px 0" }}>
          {members.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
              <button onClick={() => setModal("scan")}   style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", border: "none", background: t.accent, color: "#fff", borderRadius: 14, fontWeight: 700, fontSize: 14.5, boxShadow: `0 4px 14px ${t.accent}44` }}><Camera size={17} /> Scan struk</button>
              <button onClick={() => setModal("manual")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "13px 18px", border: `1.5px solid ${t.border}`, background: t.card, color: t.text, borderRadius: 14, fontWeight: 600, fontSize: 14.5 }}><Plus size={17} /> Manual</button>
            </div>
          )}
          {members.length === 0 && <div style={{ padding: "28px 16px", textAlign: "center", color: t.muted, fontSize: 14, background: t.card, borderRadius: 14, border: `1.5px dashed ${t.border}` }}>Tambah anggota dulu di atas.</div>}
          {members.length > 0 && filteredExpenses.length === 0 && <div style={{ padding: "28px 16px", textAlign: "center", color: t.muted, fontSize: 14, background: t.card, borderRadius: 14, border: `1.5px dashed ${t.border}` }}>{filterCat==="all" ? "Belum ada pengeluaran." : `Belum ada pengeluaran kategori ${catOf(filterCat).label}.`}</div>}
          {filteredExpenses.map((e) => {
            const cat = catOf(e.category);
            return (
              <div key={e.id} className="row tap" style={{ display: "flex", gap: 12, alignItems: "center", background: t.card, padding: "12px 12px 12px 12px", borderRadius: 16, marginTop: 10, boxShadow: t.shadow, cursor: "pointer", transition: "transform .1s", position: "relative" }} onClick={() => setOpen(e)}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: cat.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <cat.icon size={19} style={{ color: cat.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.scanned && <Sparkles size={12} style={{ color: "#bc6c25", verticalAlign: -1, marginRight: 3 }} />}{e.desc}
                  </div>
                  <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>
                    <b style={{ color: colorOf(e.paidBy) }}>{nameOf(e.paidBy)}</b> · {Object.keys(e.shares||{}).length} orang
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 16, color: t.text }}>{rp(e.amount)}</div>
                  {e.hasReceipt ? <Camera size={12} style={{ color: "#bc6c25" }} /> : <ChevronRight size={15} style={{ color: t.muted }} />}
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); removeExpense(e.id); }} style={{ position: "absolute", top: 6, right: 6, border: "none", background: "none", color: "#c1121f66", padding: 5, display: "flex", borderRadius: 8 }}><Trash2 size={13} /></button>
              </div>
            );
          })}
          {expenses.length > 0 && <div style={{ fontSize: 11.5, color: t.muted, textAlign: "center", marginTop: 14 }}>Tap untuk detail · sync tiap 30 detik · <span style={{ color: t.accent, cursor: "pointer" }} onClick={() => loadTrip(tripId, false)}>refresh</span></div>}
        </div>
      )}

      {/* Balance tab */}
      {tab === "balance" && (
        <div style={{ padding: "14px 18px 0" }}>
          <div style={secLabel(t)}><Wallet size={13} /> Posisi tiap orang</div>
          {balances.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", color: t.muted, fontSize: 14 }}>Belum ada data.</div>}
          {balances.map((b) => (
            <div key={b.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: t.card, padding: "13px 16px", borderRadius: 14, marginTop: 10, boxShadow: t.shadow }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: t.text }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: b.color }} />{b.name}
              </span>
              <span style={{ fontWeight: 700, color: b.amount > 0 ? "#2d6a4f" : b.amount < 0 ? "#c1121f" : t.muted }}>
                {b.amount > 0 ? "+" : ""}{rp(b.amount)}
              </span>
            </div>
          ))}
          <div style={{ ...secLabel(t), marginTop: 22 }}><ArrowRight size={13} /> Yang perlu transfer</div>
          {tx.length === 0
            ? <div style={{ padding: "20px 16px", textAlign: "center", color: t.muted, fontSize: 14, background: t.card, borderRadius: 14, marginTop: 10, border: `1.5px dashed ${t.border}` }}>Semua sudah lunas ✓</div>
            : tx.map((t2, i) => (
              <div key={i} className="row" style={{ background: t.card, padding: "13px 16px", borderRadius: 14, marginTop: 10, boxShadow: t.shadow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: t2.from.color, fontWeight: 700 }}>{t2.from.name}</span>
                  <ArrowRight size={14} style={{ color: t.muted }} />
                  <span style={{ color: t2.to.color, fontWeight: 700 }}>{t2.to.name}</span>
                  <span style={{ fontWeight: 700, marginLeft: "auto", color: t.text }}>{rp(t2.amount)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: t.muted, marginTop: 5 }}>
                  {t2.to.account ? <>Transfer ke: <b style={{ color: t.text }}>{t2.to.account}</b></> : <span style={{ fontStyle: "italic" }}>Tambah rekening {t2.to.name} di bagian Anggota</span>}
                </div>
              </div>
            ))
          }
          {tx.length > 0 && (
            <button onClick={() => setModal("export")} style={{ ...priBtn(t), width: "100%", marginTop: 16 }}>
              <Share2 size={15} /> Bagikan ke grup WA
            </button>
          )}
        </div>
      )}

      {modal === "scan"   && <ScanModal   members={members} onClose={() => setModal(null)} onSave={addExpense} t={t} />}
      {modal === "manual" && <ManualModal members={members} onClose={() => setModal(null)} onSave={addExpense} t={t} />}
      {modal === "export" && <ExportModal tripName={tripName} members={members} expenses={expenses} tx={tx} onClose={() => setModal(null)} t={t} />}
      {modal === "trips"  && <TripSelector currentId={tripId} trips={allTrips} onSelect={switchTrip} onCreate={createTrip} onRename={renameTripName} t={t} />}
      {openExpense && <DetailModal expense={openExpense} members={members} onClose={() => setOpen(null)} onUpdate={updateExpense} onDelete={(id) => { removeExpense(id); setOpen(null); }} t={t} />}
    </div>
  );
}

const catPillStyle = (t) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", border: `1.5px solid ${t.border}`, borderRadius: 20, background: t.card, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", color: t.muted, cursor: "pointer" });
