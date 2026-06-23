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

/* ===================== STORE CONFIG ===================== */
let STORE = {};
function loadCachedConfig() {
  try {
    const cached = localStorage.getItem("nova_store_cache");
    if (cached) {
      STORE = JSON.parse(cached);
      applyStoreConfig();
    }
  } catch (e) { /* ignore */ }
}
async function loadStoreConfig() {
  // First, apply cached config instantly (biar gak flash)
  loadCachedConfig();
  // Then fetch fresh config from API
  try {
    const r = await fetch(`/api/store-config?t=${Date.now()}`);
    const d = await r.json();
    if (r.ok) {
      STORE = d;
      localStorage.setItem("nova_store_cache", JSON.stringify(d));
    }
  } catch (e) { /* use cached or defaults */ }
  applyStoreConfig();
}
function applyStoreConfig() {
  if (!STORE.name) return;
  document.title = STORE.name + " — " + (STORE.tagline || "Produk Digital Premium");
  const heroTitle = $("#heroTitle");
  if (heroTitle && STORE.hero_title) {
    let t = STORE.hero_title.replace(/<br\s*\/?>/gi, " ");
    // auto-wrap agar kata setelah koma dapat style italic hijau
    if (!t.includes("<em")) {
      const parts = t.split(/,\s*/);
      if (parts.length > 1) {
        const last = parts.pop();
        t = parts.join(", ") + ', <em class="italic text-jadebright">' + last + "</em>";
      }
    }
    heroTitle.innerHTML = t;
    heroTitle.style.fontFamily = "'BrightRustic','Weghorst',sans-serif";
  }
  const heroSub = $("#heroSub");
  if (heroSub) heroSub.innerHTML = STORE.hero_subtitle || heroSub.innerHTML;
  const footerEl = document.querySelector("footer p, footer");
  if (footerEl) footerEl.innerHTML = STORE.footer_text || footerEl.innerHTML;
  const brandEl = document.querySelector(".font-serif a, .font-serif.text-2xl, #sidebar .font-serif");
  if (brandEl && STORE.name) {
    // keep italic + superscript formatting for brand names like "nova<em>ciy</em><sup>°</sup>"
    const base = STORE.name.replace(/[°^]/g, '').trim();
    const dot = STORE.name.includes('°') ? '°' : STORE.name.includes('^') ? '^' : '';
    // split name into prefix (first 4 letters) and suffix (rest)
    const prefix = base.slice(0, 4);
    const suffix = base.slice(4);
    if (suffix && dot) {
      brandEl.innerHTML = prefix + '<em class="italic">' + suffix + '</em><sup>' + dot + '</sup>';
    } else {
      brandEl.textContent = STORE.name;
    }
  }
  const heroSection = document.querySelector("section.mb-8 span.text-xs");
  if (heroSection && STORE.tagline) heroSection.textContent = "© " + STORE.name + " — " + STORE.tagline;
  // announcement bar
  renderAnnouncement();
  // floating social media
  renderSocFloat();
  startSocAutoLoop();
}

/* ===================== ANNOUNCEMENT BAR ===================== */
function renderAnnouncement() {
  const a = STORE.annon;
  const container = $("#annonBar");
  if (!container) return;
  if (!a || !a.active) { container.innerHTML = ""; container.classList.add("hidden"); return; }
  container.classList.remove("hidden");
  container.innerHTML = `
    <div class="flex items-center space-x-2.5 border rounded-full p-1 text-sm" style="border-color:${a.badge_bg}40;background:${a.bg};color:${a.text_color}">
      <div class="rounded-2xl px-3 py-1 font-semibold" style="background:${a.badge_bg};color:${a.badge_text_color}">${a.badge_text.replace(/</g,'&lt;')}</div>
      <span class="pr-3">${a.text.replace(/</g,'&lt;')}</span>
    </div>`;
  lucide.createIcons();
}

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
function showSkeleton() {
  $("#productGrid").innerHTML = Array.from({ length: 8 }).map(() => `
    <div class="glass border border-mint/10 rounded-2xl p-4 animate-pulse overflow-hidden">
      <div class="w-full h-32 bg-mint/10 -mx-4 -mt-4 mb-3"></div>
      <div class="flex items-center justify-between mb-4"><div class="w-12 h-12 rounded-xl bg-mint/10"></div><div class="w-16 h-5 rounded-full bg-mint/10"></div></div>
      <div class="h-5 w-2/3 bg-mint/10 rounded mb-2"></div>
      <div class="h-4 w-1/3 bg-mint/10 rounded mb-4"></div>
      <div class="h-10 w-full bg-mint/10 rounded-xl mb-3"></div>
      <div class="h-10 w-full bg-mint/10 rounded-xl"></div>
    </div>`).join("");
}

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
function getSelectedVariant(card) {
  const sel = card.querySelector(".variant-select");
  const pid = card.dataset.id;
  const product = CATALOG.find(x => x.id === pid);
  if (!product) return null;
  return product.variants.find(v => v.id === sel.value) || null;
}
function updateBuyButton(card) {
  const v = getSelectedVariant(card);
  const btn = card.querySelector(".buy-btn");
  if (!v || v.price == null) {
    btn.disabled = true; btn.innerHTML = `<i data-lucide="zap" class="w-[16px]"></i> Stok Habis`;
  } else if (v.available <= 0) {
    btn.disabled = true; btn.innerHTML = `<i data-lucide="zap" class="w-[16px]"></i> Stok Habis`;
  } else {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="zap" class="w-[16px]"></i> Beli`;
  }
  lucide.createIcons();
}
function productCard(p) {
  const sorted = [...p.variants].sort((a, b) => {
    if ((a.available || 0) > 0 && (b.available || 0) <= 0) return -1;
    if ((a.available || 0) <= 0 && (b.available || 0) > 0) return 1;
    return a.price != null && b.price != null ? a.price - b.price : 0;
  });
  const opts = sorted.map((v) => {
    const label = v.price == null ? `${v.name} — Chat Admin`
      : `${v.name} — ${rupiah(v.price)}${v.available > 0 ? "" : " ⛔ Stok Habis"}`;
    return `<option value="${v.id}">${label}</option>`;
  }).join("");

  const hasImg = !!p.image_url;
  const topSection = hasImg
    ? `<div class="w-full bg-ink/60"><img src="${p.image_url}" alt="${p.name}" class="w-full block" onerror="this.style.display='none'" /></div>`
    : `<div class="pt-4"></div>`;

  return `
  <article class="card-in glass border border-mint/10 rounded-2xl flex flex-col gap-3 hover:border-jadebright/30 transition overflow-hidden" data-cat="${p.cat}" data-name="${p.name.toLowerCase()}" data-id="${p.id}">
    ${topSection}
    <div class="px-4 ${hasImg ? '' : ''}"><h3 class="font-semibold text-lg text-white leading-tight">${p.name}</h3><span class="text-xs text-mint/40">${CAT_LABEL[p.cat] || p.cat}</span>${p.subtitle ? `<div class="mt-1.5 border border-mint/10 bg-jadebright/[0.04] rounded-lg px-2.5 py-1.5"><p class="text-[11.5px] text-mint/70 leading-relaxed line-clamp-2">${p.subtitle}</p></div>` : ""}</div>
    <div class="text-xl text-jadebright px-4 font-medium">${priceRange(p.variants)}</div>
    <div class="px-4 pb-4">
      <select class="variant-select bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright w-full mb-3">${opts}</select>
      <button class="buy-btn w-full bg-jadebright text-ink font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-40">
        <i data-lucide="zap" class="w-[16px]"></i> Stok Habis
      </button>
    </div>
  </article>`;
}
function renderProducts() {
  const grid = $("#productGrid");
  const list = CATALOG.filter((p) => (activeFilter === "all" || p.cat === activeFilter) && p.name.toLowerCase().includes(searchTerm));
  grid.innerHTML = list.length ? list.map(productCard).join("") : `<div class="col-span-full text-center text-mint/40 py-12">Tidak ada produk.</div>`;
  lucide.createIcons(); revealCards();
  // sync each card's buy button with current variant selection
  list.forEach(p => {
    const card = grid.querySelector(`article[data-id="${p.id}"]`);
    if (card) updateBuyButton(card);
  });
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
  currentSelection = { product: p, variant: v, qty: 1 };
  renderBillSummary();
  openBill();
}

function updateTotalPrice() {
  const { variant } = currentSelection;
  const qty = currentSelection.qty;
  const totalPrice = variant.price * qty;
  const el = $("#totalPriceDisplay");
  const qtyDisplay = $("#qtyDisplay");
  if (el) el.textContent = rupiah(totalPrice);
  if (qtyDisplay) qtyDisplay.value = String(qty);
  // Also update the price per unit line
  const priceLine = $("#pricePerUnit");
  if (priceLine) {
    priceLine.textContent = `${rupiah(variant.price)} × ${qty}`;
  }
}

function changeQty(delta) {
  const { variant } = currentSelection;
  let qty = currentSelection.qty;
  if (delta === 0) {
    // manual input
    const input = $("#qtyDisplay");
    qty = parseInt(input.value) || 1;
  } else {
    qty += delta;
  }
  qty = Math.max(1, Math.min(qty, variant.available));
  currentSelection.qty = qty;
  updateTotalPrice();
}

function renderBillSummary() {
  const { product, variant, qty } = currentSelection;
  const totalPrice = variant.price * qty;
  $("#billBody").innerHTML = `
    <div class="glass border border-mint/10 rounded-2xl p-4 mb-4">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-11 h-11 rounded-xl grid place-items-center font-bold text-white text-sm" style="background:${logoGradient(product.cat)}">${product.initials}</div>
        <div><strong class="block text-white">${product.name}</strong><span class="text-xs text-mint/50">${variant.name}</span></div>
        <span class="ml-auto font-serif text-lg text-jadebright">${rupiah(variant.price)}</span>
      </div>
      <div class="text-xs text-mint/50 border-t border-mint/10 pt-2">${variant.available} stok tersedia <span class="text-jadebright">· max ${variant.available}</span></div>
    </div>

    <!-- QUANTITY SELECTOR -->
    <div class="glass border border-mint/10 rounded-xl p-4 mb-4">
      <label class="block text-sm text-mint/60 mb-2">Jumlah</label>
      <div class="flex items-center gap-3">
        <button id="qtyMinus" class="w-10 h-10 rounded-xl glass border border-mint/10 grid place-items-center hover:bg-jadebright/10 hover:border-jadebright/40 transition text-white text-lg font-semibold">&minus;</button>
        <input id="qtyDisplay" type="number" min="1" max="${variant.available}" value="${qty}" class="flex-1 bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright text-center font-semibold text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
        <button id="qtyPlus" class="w-10 h-10 rounded-xl glass border border-mint/10 grid place-items-center hover:bg-jadebright/10 hover:border-jadebright/40 transition text-white text-lg font-semibold">+</button>
      </div>
      <p class="text-xs text-mint/40 mt-2">Maksimal ${variant.available} stok tersedia</p>
    </div>

    <div class="glass border border-mint/10 rounded-xl p-4 mb-4">
      <div class="flex items-center justify-between text-sm mb-2">
        <span class="text-mint/60" id="pricePerUnit">${rupiah(variant.price)} × ${qty}</span>
        <span class="text-white font-semibold" id="totalPriceDisplay">${rupiah(totalPrice)}</span>
      </div>
    </div>

    <label class="block text-sm mb-1">Kode Kupon (opsional)</label>
    <div class="flex gap-2 mb-4">
      <input id="couponInput" type="text" placeholder="cth: HEMAT10" class="flex-1 bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright uppercase" />
    </div>
    <label class="block text-sm mb-1">Email (wajib, untuk kirim akun)</label>
    <input id="contactInput" type="email" placeholder="email@contoh.com" required class="w-full bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright mb-3" />
    <label class="block text-sm mb-1">Pesan / Catatan (opsional)</label>
    <textarea id="noteInput" rows="2" placeholder="Pesan untuk admin (opsional)" class="w-full bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright mb-5"></textarea>

    <button id="payBtn" class="w-full bg-jadebright text-ink font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:brightness-110 transition">
      <i data-lucide="qr-code" class="w-[18px]"></i> Bayar dengan QRIS
    </button>
    <p class="text-[11px] text-mint/40 text-center mt-3">Kupon &amp; harga final dihitung aman di server.</p>`;
  lucide.createIcons();
  $("#payBtn").addEventListener("click", createPayment);
  // Quantity events
  $("#qtyMinus").addEventListener("click", () => changeQty(-1));
  $("#qtyPlus").addEventListener("click", () => changeQty(1));
  $("#qtyDisplay").addEventListener("change", () => changeQty(0));
  $("#qtyDisplay").addEventListener("input", () => changeQty(0));
}

/* ===================== CREATE PAYMENT ===================== */
async function createPayment() {
  const { variant, qty } = currentSelection;
  const coupon = $("#couponInput").value.trim();
  const contact = $("#contactInput").value.trim();
  const note = $("#noteInput").value.trim();
  if (!contact) { toast("Isi email kamu dulu", false); return; }
  const btn = $("#payBtn");
  btn.disabled = true; btn.innerHTML = `<i data-lucide="loader" class="w-[18px] animate-spin"></i> Membuat QRIS…`; lucide.createIcons();
  try {
    const r = await fetch("/api/create-payment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: variant.id, quantity: qty, coupon, contact, note }),
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
      <div class="bg-white rounded-2xl p-4 inline-block mb-4"><div id="qrCanvas"></div></div>
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
    const box = $("#qrCanvas");
    box.innerHTML = "";
    try {
      new QRCode(box, { text: data.qr_string, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    } catch (err) { console.error("QR render failed:", err); }
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

/* ===================== TUTORIAL DRAWER ===================== */
const openTutorial = () => { $("#tutorialDrawer").classList.remove("translate-x-full"); $("#tutorialOverlay").classList.remove("hidden"); };
const closeTutorial = () => { $("#tutorialDrawer").classList.add("translate-x-full"); $("#tutorialOverlay").classList.add("hidden"); };

/* ===================== BANTUAN DRAWER ===================== */
function renderBantuan() {
  const contact = STORE.bantuan_contact || "Belum ada kontak bantuan.";
  const faq = STORE.bantuan_faq ? STORE.bantuan_faq.split("\n").filter(Boolean) : [];
  const soc = STORE.soc || {};
  // Build social media buttons
  let socHTML = "";
  if (soc.wa_active && soc.wa_number) {
    socHTML += `<a href="https://wa.me/${soc.wa_number.replace(/[^0-9]/g, '')}" target="_blank" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-green-600/15 text-green-400 hover:bg-green-600/25 transition text-sm font-medium"><i data-lucide="message-circle" class="w-[18px]"></i> WhatsApp</a>`;
  }
  if (soc.tele_active) {
    if (soc.tele_channel_active && soc.tele_channel) {
      const chLink = soc.tele_channel.startsWith("http") ? soc.tele_channel : `https://t.me/${soc.tele_channel.replace(/^@/, '')}`;
      socHTML += `<a href="${chLink}" target="_blank" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sky-600/15 text-sky-400 hover:bg-sky-600/25 transition text-sm font-medium"><i data-lucide="send" class="w-[18px]"></i> Telegram Channel</a>`;
    }
    if (soc.tele_bot_active && soc.tele_bot) {
      const botLink = soc.tele_bot.startsWith("http") ? soc.tele_bot : `https://t.me/${soc.tele_bot.replace(/^@/, '')}`;
      socHTML += `<a href="${botLink}" target="_blank" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sky-600/15 text-sky-400 hover:bg-sky-600/25 transition text-sm font-medium"><i data-lucide="message-square" class="w-[18px]"></i> Telegram Bot / Auto Order</a>`;
    }
  }
  if (soc.x_active && soc.x_link) {
    socHTML += `<a href="${soc.x_link}" target="_blank" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-600/15 text-zinc-300 hover:bg-zinc-600/25 transition text-sm font-medium"><i data-lucide="twitter" class="w-[18px]"></i> X (Twitter)</a>`;
  }
  if (soc.ig_active && soc.ig_link) {
    socHTML += `<a href="${soc.ig_link}" target="_blank" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-pink-600/15 text-pink-400 hover:bg-pink-600/25 transition text-sm font-medium"><i data-lucide="camera" class="w-[18px]"></i> Instagram</a>`;
  }

  $("#bantuanBody").innerHTML = `
    ${socHTML ? `<div class="glass border border-mint/10 rounded-2xl p-5">
      <h4 class="text-white font-semibold flex items-center gap-2 mb-3"><i data-lucide="share-2" class="w-4 text-jadebright"></i> Hubungi Kami</h4>
      <div class="flex flex-col gap-2">${socHTML}</div>
    </div>` : `<div class="glass border border-mint/10 rounded-2xl p-5">
      <h4 class="text-white font-semibold flex items-center gap-2 mb-3"><i data-lucide="message-circle" class="w-4 text-jadebright"></i> Hubungi Kami</h4>
      <div class="text-sm text-mint/70 whitespace-pre-wrap">${contact.replace(/</g, "&lt;")}</div>
    </div>`}
    ${faq.length ? `
    <div class="glass border border-mint/10 rounded-2xl p-5">
      <h4 class="text-white font-semibold flex items-center gap-2 mb-3"><i data-lucide="help-circle" class="w-4 text-jadebright"></i> Pertanyaan Umum</h4>
      <div class="space-y-3">
        ${faq.map((q, i) => {
          const [judul, ...jawab] = q.split("|");
          return `<div class="glass border border-mint/10 rounded-xl p-3">
            <button class="faq-q w-full text-left text-sm text-white font-medium flex items-center justify-between" data-idx="${i}">
              ${(judul || q).trim()}<i data-lucide="chevron-down" class="w-4 text-mint/40 shrink-0"></i>
            </button>
            <div class="faq-a text-xs text-mint/60 mt-2 hidden">${(jawab.join("|") || "—").trim().replace(/</g, "&lt;")}</div>
          </div>`;
        }).join("")}
      </div>
    </div>` : ""}
    <div class="glass border border-amber-400/20 bg-amber-400/5 rounded-2xl p-4 text-sm text-mint/70">
      <span class="flex items-center gap-2 text-amber-300 font-medium mb-1"><i data-lucide="clock" class="w-4"></i> Jam Operasional</span>
      24 jam — pesanan diproses otomatis oleh sistem.
    </div>`;
  lucide.createIcons();
  $$(".faq-q").forEach(btn => btn.addEventListener("click", () => {
    const body = btn.nextElementSibling;
    const icon = btn.querySelector("[data-lucide]");
    body.classList.toggle("hidden");
    if (icon) icon.setAttribute("data-lucide", body.classList.contains("hidden") ? "chevron-down" : "chevron-up");
    lucide.createIcons();
  }));
}
const openBantuan = () => { renderBantuan(); $("#bantuanDrawer").classList.remove("translate-x-full"); $("#bantuanOverlay").classList.remove("hidden"); };
const closeBantuan = () => { $("#bantuanDrawer").classList.add("translate-x-full"); $("#bantuanOverlay").classList.add("hidden"); };

/* ===================== EVENTS ===================== */
document.addEventListener("click", (e) => {
  const buy = e.target.closest(".buy-btn");
  if (buy) { if (buy.disabled) return; const card = buy.closest("article"); const sel = $(".variant-select", card); startBuy(card.dataset.id, sel.value); return; }
  const chip = e.target.closest(".chip");
  if (chip) { applyFilter(chip.dataset.filter); return; }
  const cat = e.target.closest(".nav-cat");
  if (cat) { applyFilter(cat.dataset.filter); closeSidebar(); $("#overlay").classList.add("hidden"); }
  // tutorial
  const tut = e.target.closest("a[href='#tutorial'], a[href='#']");
  if (tut && tut.textContent.trim().includes("Cara Order")) { e.preventDefault(); openTutorial(); closeSidebar(); return; }
  // bantuan
  const ban = e.target.closest("a[href='#bantuan'], a[href='#']");
  if (ban && ban.textContent.trim().includes("Bantuan")) { e.preventDefault(); openBantuan(); closeSidebar(); return; }
});
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("variant-select")) {
    const card = e.target.closest("article");
    if (card) updateBuyButton(card);
  }
});
$("#searchInput").addEventListener("input", (e) => { searchTerm = e.target.value.trim().toLowerCase(); renderProducts(); });
$("#menuToggle").addEventListener("click", openSidebar);
$("#billClose").addEventListener("click", closeOverlays);
$("#overlay").addEventListener("click", closeOverlays);
$("#tutorialClose").addEventListener("click", closeTutorial);
$("#tutorialOverlay").addEventListener("click", closeTutorial);
$("#tutorialDone").addEventListener("click", closeTutorial);
$("#bantuanClose").addEventListener("click", closeBantuan);
$("#bantuanOverlay").addEventListener("click", closeBantuan);

/* ===================== FLOATING SOCIAL MEDIA ===================== */
function renderSocFloat() {
  const soc = STORE.soc || {};
  const container = $("#socFloat");
  if (!container) return;

  // Set links and show/hide each platform element
  const wa = $("#socWa");
  if (soc.wa_active && soc.wa_number) {
    wa.href = `https://wa.me/${soc.wa_number.replace(/[^0-9]/g, '')}`;
    wa.classList.remove("hidden");
  } else { wa.classList.add("hidden"); }

  const teleCh = $("#socTeleChannel");
  if (soc.tele_active && soc.tele_channel_active && soc.tele_channel) {
    teleCh.href = soc.tele_channel.startsWith("http") ? soc.tele_channel : `https://t.me/${soc.tele_channel.replace(/^@/, '')}`;
    teleCh.classList.remove("hidden");
  } else { teleCh.classList.add("hidden"); }

  const teleBot = $("#socTeleBot");
  if (soc.tele_active && soc.tele_bot_active && soc.tele_bot) {
    teleBot.href = soc.tele_bot.startsWith("http") ? soc.tele_bot : `https://t.me/${soc.tele_bot.replace(/^@/, '')}`;
    teleBot.classList.remove("hidden");
  } else { teleBot.classList.add("hidden"); }

  const x = $("#socX");
  if (soc.x_active && soc.x_link) {
    x.href = soc.x_link;
    x.classList.remove("hidden");
  } else { x.classList.add("hidden"); }

  const ig = $("#socIg");
  if (soc.ig_active && soc.ig_link) {
    ig.href = soc.ig_link;
    ig.classList.remove("hidden");
  } else { ig.classList.add("hidden"); }

  // Count visible items
  const count = $$(".soc-item:not(.hidden)").length;
  if (count === 0) { container.classList.add("hidden"); return; }
  container.classList.remove("hidden");
  lucide.createIcons();
}

// Smooth open/close with stagger
let socOpen = false;
function openSoc() {
  const popout = $("#socFloatPopout");
  const icon = $("#socFloatIcon");
  if (socOpen) return;
  socOpen = true;
  popout.style.pointerEvents = "auto";
  popout.style.opacity = "1";
  popout.style.transform = "translateY(0) scale(1)";
  // stagger items
  const items = $$(".soc-item:not(.hidden)");
  items.forEach((el, i) => {
    const delay = parseInt(el.style.transitionDelay) || (i * 60);
    setTimeout(() => {
      el.style.transform = "translateY(0)";
      el.style.opacity = "1";
    }, delay);
  });
  if (icon) { icon.setAttribute("data-lucide", "x"); lucide.createIcons(); }
}
function closeSoc() {
  const popout = $("#socFloatPopout");
  const icon = $("#socFloatIcon");
  if (!socOpen) return;
  const items = $$(".soc-item:not(.hidden)");
  items.forEach((el) => {
    el.style.transform = "";
    el.style.opacity = "";
  });
  popout.style.pointerEvents = "none";
  popout.style.opacity = "0";
  popout.style.transform = "translateY(8px) scale(0.95)";
  socOpen = false;
  if (icon) { icon.setAttribute("data-lucide", "message-circle"); lucide.createIcons(); }
}
function toggleSoc() {
  if (socOpen) closeSoc(); else openSoc();
}

// Click trigger
$("#socFloatBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSoc();
});

// Click outside closes (use mousedown for speed)
document.addEventListener("mousedown", (e) => {
  const float = $("#socFloat");
  if (!float || !socOpen) return;
  if (!float.contains(e.target)) closeSoc();
});

// Auto open/close loop
let socAutoTimer = null;
function startSocAutoLoop() {
  stopSocAutoLoop();
  // First open after 3 minutes
  socAutoTimer = setTimeout(() => {
    if (!$("#socFloat") || $("#socFloat").classList.contains("hidden")) return;
    openSoc();
    // Close after 5 seconds
    setTimeout(() => {
      closeSoc();
      // Loop: wait 3 minutes again
      socAutoTimer = setTimeout(() => {
        if (!$("#socFloat") || $("#socFloat").classList.contains("hidden")) return;
        openSoc();
        setTimeout(() => { closeSoc(); }, 5000);
        // Keep going every 3 minutes
        socAutoTimer = setInterval(() => {
          if (!$("#socFloat") || $("#socFloat").classList.contains("hidden")) return;
          openSoc();
          setTimeout(() => { closeSoc(); }, 5000);
        }, 180000);
      }, 180000);
    }, 5000);
  }, 180000);
}
function stopSocAutoLoop() {
  if (socAutoTimer) { clearTimeout(socAutoTimer); clearInterval(socAutoTimer); socAutoTimer = null; }
}

/* ===================== INIT ===================== */
showSkeleton();
loadCatalog();
loadStoreConfig();
lucide.createIcons();
