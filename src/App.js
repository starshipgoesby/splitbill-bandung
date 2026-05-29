import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Trash2, Users, Receipt, Scale, X, ArrowRight, Wallet, Check, Camera,
  Sparkles, Loader2, CreditCard, ChevronRight, WifiOff, Share2, Pencil,
  UtensilsCrossed, Car, BedDouble, ShoppingBag, Music, MoreHorizontal,
} from "lucide-react";

// ── Supabase config ───────────────────────────────────────────────────
const SUPABASE_URL = "https://fragtbguzxzjyzdtemna.supabase.co";
const SUPABASE_KEY = "sb_publishable_oMwpDwsEcqM5B8qjSVUvfA_yg973sSC";
const TRIP_ID      = "bandung-trip-2026";
const POLL_MS      = 30000;

const sb = {
  async getTrip() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/trip_data?id=eq.${TRIP_ID}&select=data,updated_at`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await r.json();
    return rows?.[0] ?? null;
  },
  async saveTrip(data) {
    await fetch(`${SUPABASE_URL}/rest/v1/trip_data`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: TRIP_ID, data, updated_at: new Date().toISOString() }),
    });
  },
  async getPhoto(id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/receipt_photos?id=eq.${id}&select=photo`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await r.json();
    return rows?.[0]?.photo ?? null;
  },
  async savePhoto(id, photo) {
    await fetch(`${SUPABASE_URL}/rest/v1/receipt_photos`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id, photo }),
    });
  },
  async deletePhoto(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/receipt_photos?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
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
  { id: "lainnya",    label: "Lainnya",    icon: MoreHorizontal,  color: "#888" },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[5];

function compressImage(file, maxDim = 1200, quality = 0.78) {
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
        resolve(canvas.toDataURL("image/jpeg", quality));
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

function buildWAText(members, expenses, tx) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "?";
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const lines = ["🏔️ *Trip Bandung — Ringkasan Patungan*", ""];
  lines.push(`💰 Total pengeluaran: *${rp(total)}*`, "");
  lines.push("📋 *Daftar pengeluaran:*");
  expenses.forEach((e) => {
    const cat = catOf(e.category);
    lines.push(`• ${e.desc} — ${rp(e.amount)} _(dibayar ${nameOf(e.paidBy)})_`);
  });
  lines.push("");
  if (tx.length === 0) {
    lines.push("✅ Semua sudah lunas!");
  } else {
    lines.push("💸 *Yang perlu transfer:*");
    tx.forEach((t) => {
      const acct = t.to.account ? ` ke ${t.to.account}` : "";
      lines.push(`• ${t.from.name} → ${t.to.name}: *${rp(t.amount)}*${acct}`);
    });
  }
  lines.push("", `_Dibuat otomatis oleh Split Bill Trip Bandung_`);
  return lines.join("\n");
}

// ── Export Modal ──────────────────────────────────────────────────────
function ExportModal({ members, expenses, tx, onClose }) {
  const text = useMemo(() => buildWAText(members, expenses, tx), [members, expenses, tx]);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const share = () => {
    if (navigator.share) navigator.share({ text });
    else copy();
  };
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={styles.modalTitle}>Export ke WA</h3>
          <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", background: "#fff", borderRadius: 12, padding: 14, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "monospace", color: "#2a1f1a", marginBottom: 14 }}>
          {text}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={copy} style={styles.cancelBtn}>{copied ? "✓ Disalin!" : "Copy teks"}</button>
          <button onClick={share} style={styles.saveBtn}><Share2 size={16} /> Bagikan</button>
        </div>
      </div>
    </div>
  );
}

// ── Detail / Edit Modal ───────────────────────────────────────────────
function DetailModal({ expense, members, onClose, onUpdate, onDelete }) {
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ maxHeight: "84vh", overflowY: "auto", padding: "0 2px 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#a8432a" }}>
                {expense.scanned ? "DARI STRUK" : "MANUAL"} · {dateStr}
              </div>
              {editing ? (
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  style={{ ...styles.input, fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, marginTop: 4, padding: "6px 10px" }} />
              ) : (
                <h3 style={{ ...styles.modalTitle, marginTop: 4 }}>{expense.desc}</h3>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditing(!editing)} style={{ ...styles.closeBtn, color: editing ? "#c75b39" : "#5a4d3e" }}><Pencil size={16} /></button>
              <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
            </div>
          </div>

          {/* Category badge */}
          {!editing && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "4px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 12.5, fontWeight: 700 }}>
              <cat.icon size={13} />{cat.label}
            </div>
          )}

          {editing ? (
            <div style={{ marginTop: 12 }}>
              <div style={styles.formLabel}>Kategori</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => setEditCat(c.id)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${editCat === c.id ? c.color : "#e6d9c6"}`, background: editCat === c.id ? c.color + "18" : "#fff", color: editCat === c.id ? c.color : "#5a4d3e", fontSize: 13, fontWeight: 600 }}>
                    <c.icon size={13} />{c.label}
                  </button>
                ))}
              </div>
              <div style={styles.formLabel}>Jumlah</div>
              <input value={parseInt(String(editAmt).replace(/\D/g,"")|| "0",10).toLocaleString("id-ID")}
                onChange={(e) => setEditAmt(e.target.value.replace(/\D/g,""))} inputMode="numeric" style={styles.input} />
              <div style={styles.formLabel}>Dibayar oleh</div>
              <select value={editPaidBy} onChange={(e) => setEditPaidBy(e.target.value)} style={styles.input}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={() => { onDelete(expense.id); onClose(); }} style={{ ...styles.cancelBtn, color: "#c1121f", borderColor: "#c1121f33" }}>Hapus</button>
                <button onClick={saveEdit} style={styles.saveBtn}>Simpan</button>
              </div>
            </div>
          ) : (
            <>
              <div style={styles.detailTotal}>
                <span>Total</span>
                <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 26 }}>{rp(expense.amount)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: "#5a4d3e", marginTop: 8 }}>
                Dibayar <b style={{ color: colorOf(expense.paidBy) }}>{nameOf(expense.paidBy)}</b>
              </div>

              {expense.hasReceipt && (
                <div style={{ marginTop: 18 }}>
                  <div style={styles.sectionLabel}><Camera size={13} /> Foto struk</div>
                  <div style={{ marginTop: 8, background: "#fff", borderRadius: 14, padding: 8 }}>
                    {photoState === "loading" && <div style={{ padding: "30px 0", textAlign: "center", color: "#a8987f" }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /></div>}
                    {photoState === "ok" && photo && <img src={photo} alt="Struk" style={{ width: "100%", borderRadius: 10, display: "block", maxHeight: 420, objectFit: "contain", background: "#f5f0e8" }} />}
                    {photoState === "missing" && <div style={{ padding: "26px 0", textAlign: "center", color: "#a8987f", fontSize: 13 }}>Foto tidak tersedia.</div>}
                  </div>
                </div>
              )}

              {expense.items?.length > 0 && (
                <>
                  <div style={{ ...styles.sectionLabel, marginTop: 20 }}><Receipt size={13} /> Rincian item</div>
                  {expense.items.map((it, idx) => (
                    <div key={idx} style={styles.detailItem}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>{it.name}</span>
                        <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap" }}>{rp(it.price)}</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                        {(it.who || []).map((id) => (
                          <span key={id} style={{ padding: "3px 9px", borderRadius: 14, fontSize: 11.5, fontWeight: 700, background: colorOf(id) + "22", color: colorOf(id) }}>{nameOf(id)}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {expense.charges && (
                    <div style={{ marginTop: 8, padding: "10px 14px", background: "#fff", borderRadius: 12 }}>
                      {!!expense.charges.tax      && <div style={styles.chargeLine}><span>Pajak</span><span>{rp(expense.charges.tax)}</span></div>}
                      {!!expense.charges.service  && <div style={styles.chargeLine}><span>Service charge</span><span>{rp(expense.charges.service)}</span></div>}
                      {!!expense.charges.discount && <div style={styles.chargeLine}><span>Diskon</span><span style={{ color: "#2d6a4f" }}>−{rp(expense.charges.discount)}</span></div>}
                    </div>
                  )}
                </>
              )}

              <div style={{ ...styles.sectionLabel, marginTop: 20 }}><Users size={13} /> Pembagian per orang</div>
              <div style={{ background: "#fff", borderRadius: 14, padding: "10px 14px", marginTop: 8 }}>
                {Object.entries(expense.shares || {}).map(([id, amt]) => (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #faf4ea" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 9, background: colorOf(id) }} />
                      <span style={{ fontWeight: 600 }}>{nameOf(id)}</span>
                      {id === expense.paidBy && <span style={{ fontSize: 10.5, letterSpacing: 1, fontWeight: 700, color: "#a8432a", background: "#c75b3915", padding: "2px 7px", borderRadius: 10, textTransform: "uppercase" }}>nalangin</span>}
                    </span>
                    <span style={{ fontWeight: 700 }}>{rp(amt)}</span>
                  </div>
                ))}
              </div>
              <button onClick={onClose} style={{ ...styles.cancelBtn, width: "100%", marginTop: 18 }}>Tutup</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scan Modal ────────────────────────────────────────────────────────
function ScanModal({ members, onClose, onSave }) {
  const [step, setStep]          = useState("upload");
  const [errMsg, setErrMsg]      = useState("");
  const [merchant, setMerchant]  = useState("");
  const [items, setItems]        = useState([]);
  const [charges, setCharges]    = useState({ tax: 0, service: 0, discount: 0 });
  const [paidBy, setPaidBy]      = useState(members[0]?.id || "");
  const [category, setCategory]  = useState("makan");
  const [photoDataUrl, setPhoto] = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    try {
      setStep("loading");
      const dataUrl = await compressImage(file);
      setPhoto(dataUrl);
      const b64 = dataUrl.split(",")[1];
      const prompt = 'Kamu parser struk belanja. Balas HANYA JSON minified valid tanpa markdown. Skema: {"merchant":string,"items":[{"name":string,"price":number}],"tax":number,"service":number,"discount":number,"total":number}. price = total harga baris dalam rupiah, angka bulat. tax=pajak/PB1, service=service charge, discount=diskon positif. Jika tidak ada isi 0.';
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b64, prompt }),
      });
      const data = await res.json();
      const text = data.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setMerchant(parsed.merchant || "Struk");
      setItems((parsed.items || []).map((it) => ({ id: uid(), name: it.name || "Item", price: Math.round(Number(it.price) || 0), who: members.map((m) => m.id) })));
      setCharges({ tax: Math.round(Number(parsed.tax)||0), service: Math.round(Number(parsed.service)||0), discount: Math.round(Number(parsed.discount)||0) });
      setStep("review");
    } catch { setErrMsg("Gagal membaca struk. Coba foto yang lebih jelas."); setStep("error"); }
  };

  const toggleWho  = (iid, mid) => setItems((a) => a.map((it) => it.id !== iid ? it : { ...it, who: it.who.includes(mid) ? it.who.filter((x) => x !== mid) : [...it.who, mid] }));
  const setField   = (iid, f, v) => setItems((a) => a.map((it) => it.id !== iid ? it : { ...it, [f]: v }));
  const removeItem = (iid) => setItems((a) => a.filter((it) => it.id !== iid));
  const preview    = useMemo(() => computeReceiptShares(items, charges, members), [items, charges, members]);

  const save = () => {
    const { shares, amount } = preview;
    if (!paidBy || amount <= 0 || !Object.keys(shares).length) return;
    onSave({ id: uid(), desc: merchant || "Struk", amount, paidBy, shares, category, at: Date.now(), scanned: true, items: items.map(({ name, price, who }) => ({ name, price, who })), charges: { ...charges }, hasReceipt: !!photoDataUrl }, photoDataUrl);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {step === "upload" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={styles.scanIcon}><Camera size={30} /></div>
            <h3 style={styles.modalTitle}>Scan struk</h3>
            <p style={{ color: "#8a7d6e", fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>Foto atau pilih gambar struk. AI akan membaca daftar item-nya otomatis.</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <button onClick={() => fileRef.current.click()} style={styles.saveBtn}><Sparkles size={17} /> Pilih foto struk</button>
            <button onClick={onClose} style={{ ...styles.cancelBtn, width: "100%", marginTop: 10 }}>Batal</button>
          </div>
        )}
        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Loader2 size={34} style={{ color: "#c75b39", animation: "spin 1s linear infinite" }} />
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, marginTop: 14, color: "#a8432a" }}>Membaca struk…</p>
          </div>
        )}
        {step === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <h3 style={styles.modalTitle}>Hmm…</h3>
            <p style={{ color: "#8a7d6e", fontSize: 14, margin: "0 0 18px" }}>{errMsg}</p>
            <button onClick={() => setStep("upload")} style={styles.saveBtn}>Coba lagi</button>
            <button onClick={onClose} style={{ ...styles.cancelBtn, width: "100%", marginTop: 10 }}>Tutup</button>
          </div>
        )}
        {step === "review" && (
          <div style={{ maxHeight: "78vh", overflowY: "auto", margin: "-4px -4px 0", padding: 4 }}>
            {photoDataUrl && <div style={{ marginBottom: 14, borderRadius: 12, overflow: "hidden", maxHeight: 160, background: "#f5f0e8" }}><img src={photoDataUrl} alt="Struk" style={{ width: "100%", objectFit: "cover", display: "block", maxHeight: 160 }} /></div>}
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} style={{ ...styles.input, fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, padding: "8px 12px", border: "1.5px dashed #e6d9c6" }} />
            <div style={styles.formLabel}>Kategori</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${category === c.id ? c.color : "#e6d9c6"}`, background: category === c.id ? c.color + "18" : "#fff", color: category === c.id ? c.color : "#5a4d3e", fontSize: 13, fontWeight: 600 }}>
                  <c.icon size={13} />{c.label}
                </button>
              ))}
            </div>
            <p style={{ color: "#8a7d6e", fontSize: 12.5, margin: "8px 0 14px" }}>Pilih siapa yang ikut tiap item.</p>
            {items.map((it) => (
              <div key={it.id} style={styles.itemCard}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={it.name} onChange={(e) => setField(it.id, "name", e.target.value)} style={{ ...styles.input, flex: 1, padding: "8px 10px", fontSize: 14 }} />
                  <input value={(it.price || 0).toLocaleString("id-ID")} onChange={(e) => setField(it.id, "price", parseInt(e.target.value.replace(/\D/g, "") || "0", 10))} inputMode="numeric" style={{ ...styles.input, width: 92, padding: "8px 10px", fontSize: 14, textAlign: "right" }} />
                  <button onClick={() => removeItem(it.id)} style={styles.iconDel}><X size={15} /></button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {members.map((m) => { const on = it.who.includes(m.id); return (<button key={m.id} onClick={() => toggleWho(it.id, m.id)} style={{ ...styles.miniChip, ...(on ? { background: m.color, color: "#fff", borderColor: m.color } : {}) }}>{m.name}</button>); })}
                </div>
              </div>
            ))}
            {[["Pajak (PB1)","tax"],["Service charge","service"],["Diskon","discount"]].map(([label, key]) => (
              <div key={key} style={styles.chargeRow}><span>{label}</span><input value={(charges[key]||0).toLocaleString("id-ID")} inputMode="numeric" onChange={(e) => setCharges({ ...charges, [key]: parseInt(e.target.value.replace(/\D/g,"")||"0",10) })} style={styles.chargeInput} /></div>
            ))}
            <div style={styles.formLabel}>Yang nalangin / bayar</div>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={styles.input}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={styles.previewBox}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 6 }}><span>Total</span><span>{rp(preview.amount)}</span></div>
              {members.filter((m) => preview.shares[m.id]).map((m) => (<div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#5a4d3e", padding: "2px 0" }}><span>{m.name}</span><span>{rp(preview.shares[m.id])}</span></div>))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={styles.cancelBtn}>Batal</button>
              <button onClick={save} style={styles.saveBtn}>Simpan</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manual Modal ──────────────────────────────────────────────────────
function ManualModal({ members, onClose, onSave }) {
  const [desc, setDesc]         = useState("");
  const [amount, setAmount]     = useState("");
  const [paidBy, setPaidBy]     = useState(members[0]?.id || "");
  const [among, setAmong]       = useState(members.map((m) => m.id));
  const [category, setCategory] = useState("lainnya");
  const toggle = (id) => setAmong((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const save = () => {
    const amt = parseInt(String(amount).replace(/\D/g, ""), 10);
    if (!desc.trim() || !amt || !paidBy || !among.length) return;
    const per = amt / among.length;
    const shares = {}; among.forEach((id) => (shares[id] = per));
    onSave({ id: uid(), desc: desc.trim(), amount: amt, paidBy, shares, category, at: Date.now() }, null);
  };
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Catat manual</h3>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Untuk apa? (mis. Bensin / Penginapan)" style={styles.input} />
        <input value={amount ? parseInt(String(amount).replace(/\D/g,"")||"0",10).toLocaleString("id-ID") : ""} onChange={(e) => setAmount(e.target.value.replace(/\D/g,""))} placeholder="Jumlah (Rp)" inputMode="numeric" style={{ ...styles.input, marginTop: 10 }} />
        <div style={styles.formLabel}>Kategori</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 4 }}>
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${category === c.id ? c.color : "#e6d9c6"}`, background: category === c.id ? c.color + "18" : "#fff", color: category === c.id ? c.color : "#5a4d3e", fontSize: 13, fontWeight: 600 }}>
              <c.icon size={13} />{c.label}
            </button>
          ))}
        </div>
        <div style={styles.formLabel}>Dibayar oleh</div>
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={styles.input}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div style={styles.formLabel}>Dibagi rata ke</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {members.map((m) => { const on = among.includes(m.id); return (<button key={m.id} onClick={() => toggle(m.id)} style={{ ...styles.splitChip, ...(on ? { background: m.color, color: "#fff", borderColor: m.color } : {}) }}>{on && <Check size={13} />}{m.name}</button>); })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={styles.cancelBtn}>Batal</button>
          <button onClick={save} style={styles.saveBtn}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [members, setMembers]   = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab]           = useState("expenses");
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [offline, setOffline]   = useState(false);
  const [newName, setNewName]   = useState("");
  const [modal, setModal]       = useState(null);
  const [editAcct, setEditAcct] = useState(null);
  const [openExpense, setOpen]  = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const lastUpdatedRef = useRef(null);
  const membersRef = useRef(members);
  const expensesRef = useRef(expenses);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);

  const loadData = useCallback(async (isInit = false) => {
    try {
      const row = await sb.getTrip();
      if (!row) { if (isInit) setLoading(false); return; }
      if (!isInit && row.updated_at === lastUpdatedRef.current) return;
      lastUpdatedRef.current = row.updated_at;
      const data = row.data;
      setMembers(data.members || []);
      setExpenses(data.expenses || []);
      setOffline(false);
    } catch { setOffline(true); }
    finally { if (isInit) setLoading(false); }
  }, []);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => loadData(false), POLL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  const persist = async (m, e) => {
    setSaving(true);
    try { await sb.saveTrip({ members: m, expenses: e }); setOffline(false); lastUpdatedRef.current = new Date().toISOString(); }
    catch { setOffline(true); }
    finally { setSaving(false); }
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
    setExpenses(next); persist(members, next);
    setOpen(updated);
  };
  const removeExpense = async (id) => {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next); persist(members, next);
    try { await sb.deletePhoto(id); } catch {}
  };

  const nameOf  = (id) => members.find((m) => m.id === id)?.name  || "?";
  const colorOf = (id) => members.find((m) => m.id === id)?.color || "#999";
  const total   = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const { balances, tx } = useMemo(() => settle(members, expenses), [members, expenses]);

  const catTotals = useMemo(() => {
    const t = {}; expenses.forEach((e) => { t[e.category || "lainnya"] = (t[e.category || "lainnya"] || 0) + e.amount; });
    return t;
  }, [expenses]);

  const filteredExpenses = useMemo(() =>
    filterCat === "all" ? expenses : expenses.filter((e) => (e.category || "lainnya") === filterCat),
    [expenses, filterCat]
  );

  if (loading)
    return <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <Loader2 size={32} style={{ color: "#c75b39", animation: "spin 1s linear infinite" }} />
        <div style={{ fontFamily: "Fraunces, serif", color: "#c75b39", fontSize: 18, marginTop: 12 }}>Memuat data…</div>
      </div>
    </div>;

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        @keyframes pop  { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .row { animation: pop .25s ease both; }
        input:focus, select:focus { outline: 2px solid #c75b3955; }
        button { cursor: pointer; font-family: inherit; }
        ::placeholder { color: #b3a596; }
        .tap-card:active { transform: scale(0.985); }
      `}</style>

      {offline && (
        <div style={{ background: "#c1121f", color: "#fff", padding: "10px 18px", display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <WifiOff size={15} /> Tidak bisa terhubung. Perubahan mungkin belum tersimpan.
        </div>
      )}

      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={styles.kicker}>PATUNGAN · 4H3M</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saving && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#ffffff99" }}><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> menyimpan…</div>}
            <button onClick={() => setModal("export")} style={{ background: "#ffffff22", border: "none", color: "#fff", borderRadius: 10, padding: "6px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700 }}>
              <Share2 size={14} /> Export WA
            </button>
          </div>
        </div>
        <h1 style={styles.title}>Trip Bandung</h1>
        <div style={styles.totalBox}>
          <span style={{ opacity: 0.85 }}>Total pengeluaran</span>
          <span style={styles.totalNum}>{rp(total)}</span>
        </div>
      </div>

      {/* Category breakdown */}
      {expenses.length > 0 && (
        <div style={{ padding: "16px 18px 0", display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          <button onClick={() => setFilterCat("all")} style={{ ...styles.catPill, ...(filterCat === "all" ? { background: "#2a1f1a", color: "#fff", borderColor: "#2a1f1a" } : {}) }}>Semua</button>
          {CATEGORIES.filter((c) => catTotals[c.id]).map((c) => (
            <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? "all" : c.id)}
              style={{ ...styles.catPill, ...(filterCat === c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color, borderColor: c.color + "55" }) }}>
              <c.icon size={12} />{c.label} {rp(catTotals[c.id])}
            </button>
          ))}
        </div>
      )}

      {/* Members */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}><Users size={14} /> Anggota</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => (
            <div key={m.id} style={styles.memberCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 9, background: m.color }} />
                <span style={{ fontWeight: 700, flex: 1 }}>{m.name}</span>
                <button onClick={() => setEditAcct(editAcct === m.id ? null : m.id)} style={styles.acctBtn}><CreditCard size={13} /> {m.account ? "ubah" : "tujuan transfer"}</button>
                <button onClick={() => removeMember(m.id)} style={styles.iconDel}><Trash2 size={14} /></button>
              </div>
              {m.account && editAcct !== m.id && <div style={{ fontSize: 12.5, color: "#8a7d6e", marginTop: 5, paddingLeft: 20 }}>{m.account}</div>}
              {editAcct === m.id && (
                <input autoFocus defaultValue={m.account} placeholder="mis. BCA 1234567890 a.n. Budi / GoPay 0812…"
                  onBlur={(e) => { setAccount(m.id, e.target.value.trim()); setEditAcct(null); }}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  style={{ ...styles.input, marginTop: 8, fontSize: 13.5 }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} placeholder="Tambah nama teman…" style={styles.input} />
          <button onClick={addMember} style={styles.addBtn}><Plus size={18} /></button>
        </div>
      </div>

      <div style={styles.tabs}>
        <button onClick={() => setTab("expenses")} style={{ ...styles.tab, ...(tab === "expenses" ? styles.tabActive : {}) }}><Receipt size={15} /> Pengeluaran</button>
        <button onClick={() => setTab("balance")}  style={{ ...styles.tab, ...(tab === "balance"  ? styles.tabActive : {}) }}><Scale size={15} /> Saldo</button>
      </div>

      {tab === "expenses" && (
        <div style={styles.section}>
          {members.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
              <button onClick={() => setModal("scan")}   style={styles.scanCta}><Camera size={17} /> Scan struk</button>
              <button onClick={() => setModal("manual")} style={styles.manualCta}><Plus size={17} /> Manual</button>
            </div>
          )}
          {members.length === 0 && <div style={styles.empty}>Tambah anggota dulu di atas.</div>}
          {members.length > 0 && filteredExpenses.length === 0 && <div style={styles.empty}>{filterCat === "all" ? "Belum ada pengeluaran." : `Belum ada pengeluaran kategori ${catOf(filterCat).label}.`}</div>}
          {filteredExpenses.map((e) => {
            const cat = catOf(e.category);
            return (
              <div key={e.id} className="row tap-card" style={styles.expenseTap} onClick={() => setOpen(e)}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <cat.icon size={18} style={{ color: cat.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.expDesc}>
                    {e.scanned && <Sparkles size={13} style={{ color: "#bc6c25", verticalAlign: -1, marginRight: 3 }} />}
                    {e.desc}
                  </div>
                  <div style={styles.expMeta}>Dibayar <b style={{ color: colorOf(e.paidBy) }}>{nameOf(e.paidBy)}</b> · {Object.keys(e.shares || {}).length} orang</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={styles.expAmt}>{rp(e.amount)}</div>
                  {e.hasReceipt ? <Camera size={13} style={{ color: "#bc6c25" }} /> : <ChevronRight size={16} style={{ color: "#b3a596" }} />}
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); removeExpense(e.id); }} style={styles.rowDel}><Trash2 size={14} /></button>
              </div>
            );
          })}
          {expenses.length > 0 && <div style={{ fontSize: 11.5, color: "#b3a596", textAlign: "center", marginTop: 12 }}>Tap untuk detail & edit · sync tiap 30 detik</div>}
        </div>
      )}

      {tab === "balance" && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}><Wallet size={14} /> Posisi tiap orang</div>
          {balances.map((b) => (
            <div key={b.id} className="row" style={styles.balRow}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: b.color }} />{b.name}
              </span>
              <span style={{ fontWeight: 700, color: b.amount > 0 ? "#2d6a4f" : b.amount < 0 ? "#c1121f" : "#8a7d6e" }}>
                {b.amount > 0 ? "+" : ""}{rp(b.amount)}
              </span>
            </div>
          ))}
          <div style={{ ...styles.sectionLabel, marginTop: 22 }}><ArrowRight size={14} /> Cara melunasi</div>
          {tx.length === 0 ? <div style={styles.empty}>Belum ada yang perlu ditransfer.</div> : tx.map((t, i) => (
            <div key={i} className="row" style={styles.settle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: t.from.color, fontWeight: 700 }}>{t.from.name}</span>
                <ArrowRight size={15} style={{ color: "#b3a596" }} />
                <span style={{ color: t.to.color, fontWeight: 700 }}>{t.to.name}</span>
                <span style={{ fontWeight: 700, marginLeft: "auto" }}>{rp(t.amount)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#8a7d6e", marginTop: 6 }}>
                {t.to.account ? <>Transfer ke: <b style={{ color: "#5a4d3e" }}>{t.to.account}</b></> : <span style={{ fontStyle: "italic" }}>Tambah no. rekening {t.to.name} di bagian Anggota</span>}
              </div>
            </div>
          ))}
          {tx.length > 0 && (
            <button onClick={() => setModal("export")} style={{ ...styles.saveBtn, width: "100%", marginTop: 16 }}>
              <Share2 size={16} /> Export ringkasan ke WA
            </button>
          )}
        </div>
      )}

      {modal === "scan"   && <ScanModal   members={members} onClose={() => setModal(null)} onSave={addExpense} />}
      {modal === "manual" && <ManualModal members={members} onClose={() => setModal(null)} onSave={addExpense} />}
      {modal === "export" && <ExportModal members={members} expenses={expenses} tx={tx} onClose={() => setModal(null)} />}
      {openExpense && <DetailModal expense={openExpense} members={members} onClose={() => setOpen(null)} onUpdate={updateExpense} onDelete={(id) => { removeExpense(id); setOpen(null); }} />}

      <div style={styles.footer}>Data real-time via Supabase · sync tiap 30 detik · <span style={{ color: "#c75b39" }} onClick={() => loadData(false)}>refresh sekarang</span></div>
    </div>
  );
}

const styles = {
  page:       { fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#faf4ea", minHeight: "100vh", color: "#2a1f1a", paddingBottom: 30, maxWidth: 520, margin: "0 auto" },
  header:     { background: "linear-gradient(150deg,#c75b39,#a8432a)", color: "#fff", padding: "30px 22px 24px", borderRadius: "0 0 28px 28px", boxShadow: "0 8px 24px #c75b3933" },
  kicker:     { fontSize: 11, letterSpacing: 3, fontWeight: 700, opacity: 0.85 },
  title:      { fontFamily: "Fraunces, serif", fontSize: 38, fontWeight: 600, margin: "4px 0 16px", lineHeight: 1 },
  totalBox:   { display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "#ffffff22", padding: "12px 16px", borderRadius: 14, fontSize: 14 },
  totalNum:   { fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600 },
  section:    { padding: "18px 18px 0" },
  sectionLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#a8432a" },
  memberCard: { background: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 2px 8px #00000008" },
  acctBtn:    { display: "inline-flex", alignItems: "center", gap: 4, border: "1.5px solid #e6d9c6", background: "#faf4ea", borderRadius: 18, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#a8432a" },
  iconDel:    { border: "none", background: "none", color: "#c1121f", padding: 4, display: "flex" },
  input:      { flex: 1, width: "100%", padding: "12px 14px", border: "1.5px solid #e6d9c6", borderRadius: 12, fontSize: 15, background: "#fff", color: "#2a1f1a" },
  addBtn:     { background: "#c75b39", color: "#fff", border: "none", borderRadius: 12, width: 46, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tabs:       { display: "flex", gap: 8, padding: "20px 18px 0" },
  tab:        { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", border: "1.5px solid #e6d9c6", background: "#fff", borderRadius: 14, fontWeight: 600, fontSize: 14, color: "#8a7d6e" },
  tabActive:  { background: "#2a1f1a", color: "#fff", borderColor: "#2a1f1a" },
  scanCta:    { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", border: "none", background: "#c75b39", color: "#fff", borderRadius: 14, fontWeight: 700, fontSize: 14.5, boxShadow: "0 4px 12px #c75b3944" },
  manualCta:  { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "13px 16px", border: "1.5px solid #e6d9c6", background: "#fff", color: "#5a4d3e", borderRadius: 14, fontWeight: 600, fontSize: 14.5 },
  catPill:    { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1.5px solid #e6d9c6", borderRadius: 20, background: "#fff", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", color: "#5a4d3e" },
  empty:      { padding: "28px 16px", textAlign: "center", color: "#a8987f", fontSize: 14, background: "#fff", borderRadius: 14, marginTop: 12, border: "1.5px dashed #e6d9c6" },
  expenseTap: { display: "flex", gap: 12, alignItems: "center", background: "#fff", padding: "12px 14px 12px 12px", borderRadius: 16, marginTop: 10, boxShadow: "0 2px 8px #00000008", cursor: "pointer", transition: "transform .1s ease", position: "relative" },
  expDesc:    { fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  expMeta:    { fontSize: 12.5, color: "#8a7d6e", marginTop: 3 },
  expAmt:     { fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 17 },
  rowDel:     { position: "absolute", top: 6, right: 6, border: "none", background: "none", color: "#c1121f88", padding: 6, display: "flex", borderRadius: 8 },
  balRow:     { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "13px 16px", borderRadius: 14, marginTop: 10 },
  settle:     { background: "#fff", padding: "13px 16px", borderRadius: 14, marginTop: 10, fontSize: 15 },
  overlay:    { position: "fixed", inset: 0, background: "#2a1f1a99", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, backdropFilter: "blur(2px)" },
  modal:      { background: "#faf4ea", width: "100%", maxWidth: 520, borderRadius: "24px 24px 0 0", padding: "22px 18px 26px", animation: "pop .2s ease both" },
  modalTitle: { fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, margin: "0 0 4px" },
  closeBtn:   { border: "none", background: "#faf4ea", color: "#5a4d3e", width: 34, height: 34, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  detailTotal:{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "#c75b39", color: "#fff", padding: "14px 18px", borderRadius: 16, marginTop: 14, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 },
  detailItem: { background: "#fff", borderRadius: 12, padding: "11px 14px", marginTop: 8 },
  chargeLine: { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13.5, color: "#5a4d3e" },
  scanIcon:   { width: 64, height: 64, borderRadius: 20, background: "#c75b3915", color: "#c75b39", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" },
  formLabel:  { fontSize: 12.5, fontWeight: 700, color: "#a8432a", margin: "16px 0 8px", letterSpacing: 0.5 },
  splitChip:  { display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", border: "1.5px solid #e6d9c6", borderRadius: 20, background: "#fff", fontSize: 14, fontWeight: 600, color: "#2a1f1a" },
  miniChip:   { padding: "5px 11px", border: "1.5px solid #e6d9c6", borderRadius: 16, background: "#fff", fontSize: 12.5, fontWeight: 600, color: "#5a4d3e" },
  itemCard:   { background: "#fff", borderRadius: 13, padding: "11px 12px", marginBottom: 9 },
  chargeRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px", fontSize: 14, fontWeight: 600, color: "#5a4d3e" },
  chargeInput:{ width: 110, padding: "8px 10px", border: "1.5px solid #e6d9c6", borderRadius: 10, fontSize: 14, textAlign: "right", background: "#fff" },
  previewBox: { background: "#2d4a3e0d", border: "1.5px solid #2d6a4f33", borderRadius: 14, padding: "14px 16px", marginTop: 16 },
  cancelBtn:  { flex: 1, padding: "13px", border: "1.5px solid #e6d9c6", background: "#fff", borderRadius: 14, fontWeight: 600, color: "#8a7d6e" },
  saveBtn:    { flex: 2, padding: "13px", border: "none", background: "#c75b39", color: "#fff", borderRadius: 14, fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 },
  footer:     { padding: "24px 22px", textAlign: "center", fontSize: 11.5, color: "#b3a596", lineHeight: 1.5 },
};
