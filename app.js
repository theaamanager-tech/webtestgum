/* =====================================================================
 *  NOVACIY° — Storefront (direct purchase, QRIS via Pakasir)
 *  Buy → billing drawer → /api/create-payment → QRIS → poll → auto .txt
 * ===================================================================== */
const { sb, CAT_LABEL, rupiah, priceRange, loadPublicCatalog } = window.NOVA;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

let CATALOG = [];
let activeFilter = "all";
let searchTerm = "";
let pollTimer = null;
let currentSelection = null; // { product, variant }

/* ===================== TOAST ===================== */
let toastT;
function toast(msg, ok = true) {
  const el = $("#toast");
  el.innerHTML = `<i data-lucide="${ok ? "check-circle-2" : "alert-triangle"}" class="w-[18px] ${ok ? "text-jadebright" : "text-amber-400"}"></i> ${msg}`;
  lucide.createIcons();
  el.classList.add("opacity-100", "translate-y-0"); el.classList.remove("opacity-0", "translate-y-3");
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.classList.add("opacity-0", "translate-y-3"); el.classList.remove("opacity-100", "translate-y-0"); }, 3000);
}

/* ===================== LOAD CATALOG ===================== */
async function loadCatalog() {
  try {
    CATALOG = await loadPublicCatalog();
    renderProducts(); renderStats();
  } catch (e) {
    $("#productGrid").innerHTML =
      `<div class="col-span-full glass border border-amber-500/30 rounded-2xl p-6 text-center text-amber-300">Gagal memuat produk. Jalankan schema.sql di Supabase.<br><span class="text-xs text-mint/40">${e.message || e}</span></div>`;
  }
}
function renderStats() {
  $("#stProducts").textContent = String(CATALOG.length).padStart(2, "0");
  $("#stStock").textContent = CATALOG.reduce((a, p) => a + p.variants.reduce((s, v) => s + (v.available || 0), 0), 0);
}

/* ===================== RENDER ===================== */
function logoGradient(cat) {
  return { ai:"linear-gradient(135deg,#10a37f,#1a7f64)", editing:"linear-gradient(135deg,#7d2ae8,#00c4cc)", account:"linear-gradient(135deg,#0070ba,#1546a0)" }[cat] || "linear-gradient(135deg,#28C39D,#0F7A62)";
}
function productCard(p) {
  const buyable = p.variants.some((v) => v.price != null && (v.available || 0) > 0);
  const opts = p.variants.map((v) => {
    const label = v.price == null ? `${v.name} — Chat Admin`
      : `${v.name} — ${rupiah(v.price)}${v.available > 0 ? "" : " (habis)"}`;
    const dis = v.price != null && v.available <= 0 ? "disabled" : "";
    return `<option value="${v.id}" ${dis}>${label}</option>`;
  }).join("");
  return `
  <article class="card-in glass border border-mint/10 rounded-2xl p-4 flex flex-col gap-3 hover:border-jadebright/30 transition" data-cat="${p.cat}" data-name="${p.name.toLowerCase()}" data-id="${p.id}">
    <div class="flex items-center justify-between">
      <div class="w-12 h-12 rounded-xl grid place-items-center font-bold text-white text-sm" style="background:${logoGradient(p.cat)}">${p.initials}</div>
      ${p.tag ? `<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-jadebright/10 text-jadebright border border-jadebright/30">${p.tag}</span>` : ""}
    </div>
    <div><h3 class="font-serif text-lg text-white leading-tight">${p.name}</h3><span class="text-xs text-mint/40">${CAT_LABEL[p.cat] || p.cat}</span></div>
    <div class="font-serif text-xl text-jadebright">${priceRange(p.variants)}</div>
    <select class="variant-select bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright w-full">${opts}</select>
    <button class="buy-btn w-full bg-jadebright text-ink font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-40" ${buyable ? "" : "disabled"}>
      <i data-lucide="zap" class="w-[16px]"></i> ${buyable ? "Beli" : "Stok Habis"}
    </button>
  </article>`;
}
function renderProducts() {
  const grid = $("#productGrid");
  const list = CATALOG.filter((p) => (activeFilter === "all" || p.cat === activeFilter) && p.name.toLowerCase().includes(searchTerm));
  grid.innerHTML = list.length ? list.map(productCard).join("") : `<div class="col-span-full text-center text-mint/40 py-12">Tidak ada produk.</div>`;
  lucide.createIcons(); revealCards();
}
function revealCards() {
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.1 });
  $$(".card-in").forEach((c, i) => { c.style.transitionDelay = (i % 3) * 60 + "ms"; io.observe(c); });
}

/* ===================== SIDEBAR (mobile) ===================== */
const openSidebar = () => { $("#sidebar").classList.remove("-translate-x-full"); $("#overlay").classList.remove("hidden"); };
const closeSidebar = () => $("#sidebar").classList.add("-translate-x-full");

/* ===================== BILLING DRAWER ===================== */
const openBill = () => { $("#billDrawer").classList.remove("translate-x-full"); $("#overlay").classList.remove("hidden"); };
const closeBill = () => {
  $("#billDrawer").classList.add("translate-x-full");
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
};
const closeOverlays = () => { closeBill(); closeSidebar(); $("#overlay").classList.add("hidden"); };

function applyFilter(filter) {
  activeFilter = filter;
  $$(".chip").forEach((c) => {
    const on = c.dataset.filter === filter;
    c.classList.toggle("bg-jadebright", on); c.classList.toggle("text-ink", on); c.classList.toggle("font-semibold", on);
    c.classList.toggle("glass", !on); c.classList.toggle("border", !on); c.classList.toggle("border-mint/10", !on);
  });
  renderProducts();
}

function startBuy(productId, variantId) {
  const p = CATALOG.find((x) => x.id === productId);
  const v = p?.variants.find((x) => x.id === variantId);
  if (!p || !v) return;
  if (v.price == null) { toast("Variasi ini chat admin dulu", false); return; }
  if (v.available <= 0) { toast("Stok habis", false); return; }
  currentSelection = { product: p, variant: v };
  renderBillSummary();
  openBill();
}

function renderBillSummary() {
  const { product, variant } = currentSelection;
  $("#billBody").innerHTML = `
    <div class="glass border border-mint/10 rounded-2xl p-4 mb-4">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-11 h-11 rounded-xl grid place-items-center font-bold text-white text-sm" style="background:${logoGradient(product.cat)}">${product.initials}</div>
        <div><strong class="block text-white">${product.name}</strong><span class="text-xs text-mint/50">${variant.name}</span></div>
        <span class="ml-auto font-serif text-lg text-jadebright">${rupiah(variant.price)}</span>
      </div>
      <div class="text-xs text-mint/50 border-t border-mint/10 pt-2">${variant.available} stok tersedia</div>
    </div>

    <label class="block text-sm mb-1">Kode Kupon (opsional)</label>
    <div class="flex gap-2 mb-4">
      <input id="couponInput" type="text" placeholder="cth: HEMAT10" class="flex-1 bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright uppercase" />
    </div>
    <label class="block text-sm mb-1">Kontak (opsional, untuk bantuan)</label>
    <input id="contactInput" type="text" placeholder="WhatsApp / email" class="w-full bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright mb-5" />

    <div class="flex items-center justify-between mb-4">
      <span class="text-mint/60">Total</span>
      <strong class="font-serif text-2xl text-white">${rupiah(variant.price)}</strong>
    </div>
    <button id="payBtn" class="w-full bg-jadebright text-ink font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:brightness-110 transition">
      <i data-lucide="qr-code" class="w-[18px]"></i> Bayar dengan QRIS
    </button>
    <p class="text-[11px] text-mint/40 text-center mt-3">Kupon &amp; harga final dihitung aman di server.</p>`;
  lucide.createIcons();
  $("#payBtn").addEventListener("click", createPayment);
}

/* ===================== CREATE PAYMENT ===================== */
async function createPayment() {
  const { variant } = currentSelection;
  const coupon = $("#couponInput").value.trim();
  const contact = $("#contactInput").value.trim();
  const btn = $("#payBtn");
  btn.disabled = true; btn.innerHTML = `<i data-lucide="loader" class="w-[18px] animate-spin"></i> Membuat QRIS…`; lucide.createIcons();
  try {
    const r = await fetch("/api/create-payment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: variant.id, coupon, contact }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Gagal membuat pembayaran");
    renderQris(data);
    startPolling(data.order_id);
  } catch (e) {
    toast(e.message, false);
    btn.disabled = false; btn.innerHTML = `<i data-lucide="qr-code" class="w-[18px]"></i> Bayar dengan QRIS`; lucide.createIcons();
  }
}

function renderQris(data) {
  const discountLine = data.discount > 0 ? `<div class="flex justify-between text-sm"><span class="text-mint/50">Diskon</span><span class="text-jadebright">- ${rupiah(data.discount)}</span></div>` : "";
  $("#billBody").innerHTML = `
    <div class="text-center">
      <span class="inline-flex items-center gap-1.5 text-xs text-jadebright bg-jadebright/10 border border-jadebright/30 px-3 py-1 rounded-full mb-4"><i data-lucide="loader" class="w-3.5 animate-spin"></i> Menunggu pembayaran…</span>
      <div class="bg-white rounded-2xl p-4 inline-block mb-4"><canvas id="qrCanvas"></canvas></div>
      <div class="glass border border-mint/10 rounded-xl p-4 text-left mb-4">
        <div class="flex justify-between text-sm mb-1"><span class="text-mint/50">${data.product_name} · ${data.variant_name}</span></div>
        ${discountLine}
        <div class="flex justify-between items-center border-t border-mint/10 pt-2 mt-1">
          <span class="text-mint/60">Total bayar</span>
          <strong class="font-serif text-xl text-white">${rupiah(data.total_payment)}</strong>
        </div>
        <div class="text-[11px] text-mint/40 mt-1">Order: ${data.order_id}</div>
      </div>
      <a href="${data.pay_url}" target="_blank" class="inline-flex items-center gap-1.5 text-sm text-mint/60 hover:text-jadebright"><i data-lucide="external-link" class="w-4"></i> Buka halaman QRIS Pakasir</a>
      <p class="text-xs text-mint/40 mt-4">Scan dengan aplikasi e-wallet / m-banking. Akun otomatis terkirim setelah lunas.</p>
    </div>`;
  lucide.createIcons();
  if (window.QRCode && data.qr_string) {
    QRCode.toCanvas($("#qrCanvas"), data.qr_string, { width: 220, margin: 1 }, (err) => { if (err) console.error(err); });
  }
}

/* ===================== POLL STATUS + DELIVER ===================== */
function startPolling(orderId) {
  if (pollTimer) clearInterval(pollTimer);
  let tries = 0;
  pollTimer = setInterval(async () => {
    tries++;
    if (tries > 150) { clearInterval(pollTimer); pollTimer = null; return; } // ~7.5 min
    try {
      const r = await fetch(`/api/order-status?order_id=${encodeURIComponent(orderId)}`);
      const d = await r.json();
      if (d.status === "paid" && d.delivery_text) {
        clearInterval(pollTimer); pollTimer = null;
        deliver(d.delivery_text, orderId);
      } else if (d.status === "failed") {
        clearInterval(pollTimer); pollTimer = null;
        toast("Pembayaran gagal / stok habis", false);
      }
    } catch (e) { /* keep polling */ }
  }, 3000);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function deliver(text, orderId) {
  const fname = `novaciy-${orderId}.txt`;
  downloadText(text, fname);
  $("#billBody").innerHTML = `
    <div class="text-center">
      <div class="w-16 h-16 rounded-full bg-jadebright/15 grid place-items-center mx-auto mb-4"><i data-lucide="check-check" class="w-8 text-jadebright"></i></div>
      <h3 class="font-serif text-2xl text-white">Pembayaran Sukses!</h3>
      <p class="text-mint/60 text-sm mt-2 mb-5">Akun &amp; SNK sudah dikirim sebagai file <code class="text-jadebright">${fname}</code>. Jika unduhan tidak otomatis, klik tombol di bawah.</p>
      <div class="glass border border-mint/10 rounded-xl p-3 text-left text-xs font-mono text-mint/70 max-h-48 overflow-y-auto whitespace-pre-wrap mb-4">${text.replace(/</g, "&lt;")}</div>
      <button id="dlAgain" class="w-full bg-jadebright text-ink font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:brightness-110 transition mb-2"><i data-lucide="download" class="w-[18px]"></i> Unduh Lagi (.txt)</button>
      <button id="doneBtn" class="w-full glass border border-mint/10 rounded-xl py-2.5 text-sm hover:bg-mint/5">Selesai</button>
    </div>`;
  lucide.createIcons();
  $("#dlAgain").addEventListener("click", () => downloadText(text, fname));
  $("#doneBtn").addEventListener("click", () => { closeBill(); loadCatalog(); });
  toast("Pembayaran sukses — akun terkirim!");
}

/* ===================== EVENTS ===================== */
document.addEventListener("click", (e) => {
  const buy = e.target.closest(".buy-btn");
  if (buy) { const card = buy.closest("article"); const sel = $(".variant-select", card); startBuy(card.dataset.id, sel.value); return; }
  const chip = e.target.closest(".chip");
  if (chip) { applyFilter(chip.dataset.filter); return; }
  const cat = e.target.closest(".nav-cat");
  if (cat) { applyFilter(cat.dataset.filter); closeSidebar(); $("#overlay").classList.add("hidden"); }
});
$("#searchInput").addEventListener("input", (e) => { searchTerm = e.target.value.trim().toLowerCase(); renderProducts(); });
$("#menuToggle").addEventListener("click", openSidebar);
$("#billClose").addEventListener("click", closeOverlays);
$("#overlay").addEventListener("click", closeOverlays);

/* ===================== INIT ===================== */
loadCatalog();
lucide.createIcons();
