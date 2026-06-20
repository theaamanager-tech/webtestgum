/* =====================================================================
 *  NOVACIY° — Admin logic (serverless, key-gated)
 *  All operations go through POST /api/admin with header x-admin-key.
 *  Products • variant stock (bulk) • per-variant SNK • coupons • Pakasir cfg • insights
 * ===================================================================== */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const CAT_LABEL = { ai: "AI Tools", editing: "Editing", account: "Akun" };
const rupiah = (n) => (n == null ? "—" : "Rp " + Number(n).toLocaleString("id-ID"));
function priceRange(vs){const p=vs.map(v=>v.price).filter(v=>v!=null);if(!p.length)return"Chat Admin";const lo=Math.min(...p),hi=Math.max(...p);return lo===hi?rupiah(lo):rupiah(lo)+" – "+rupiah(hi);}

let ADMIN_KEY = sessionStorage.getItem("nova_admin_key") || "";
let CATALOG = [], editingId = null, selectedVariant = null;

/* ===================== API ===================== */
async function api(action, payload = {}) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Gagal");
  return data;
}

/* ===================== TOAST ===================== */
let toastT;
function toast(msg, ok = true) {
  const el = $("#toast");
  el.innerHTML = `<i data-lucide="${ok ? "check-circle-2" : "alert-triangle"}" class="w-[18px] ${ok ? "text-jadebright" : "text-amber-400"}"></i> ${msg}`;
  lucide.createIcons();
  el.classList.add("opacity-100", "translate-y-0"); el.classList.remove("opacity-0", "translate-y-3");
  clearTimeout(toastT); toastT = setTimeout(() => { el.classList.add("opacity-0", "translate-y-3"); el.classList.remove("opacity-100", "translate-y-0"); }, 2800);
}

/* ===================== LOGIN GATE ===================== */
async function tryLogin() {
  const key = $("#keyInput").value.trim();
  if (!key) return;
  ADMIN_KEY = key;
  try {
    await api("login");
    sessionStorage.setItem("nova_admin_key", key);
    $("#loginGate").style.display = "none";
    $("#appRoot").classList.remove("hidden");
    boot();
  } catch (e) {
    ADMIN_KEY = "";
    $("#loginErr").textContent = "Key salah atau server belum set ADMIN_KEY.";
  }
}
$("#loginBtn").addEventListener("click", tryLogin);
$("#keyInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
$("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem("nova_admin_key"); location.reload(); });

// auto-unlock if key already stored & valid
(async () => {
  if (ADMIN_KEY) {
    try { await api("login"); $("#loginGate").style.display = "none"; $("#appRoot").classList.remove("hidden"); boot(); }
    catch { sessionStorage.removeItem("nova_admin_key"); ADMIN_KEY = ""; }
  }
})();

/* ===================== PANEL SWITCH ===================== */
const TITLES = { insights: "Insights & Finansial", products: "Produk", stock: "Stok & SNK", coupons: "Kupon", settings: "Pakasir API" };
$$(".nav-item").forEach((btn) => btn.addEventListener("click", () => {
  $$(".nav-item").forEach((b) => b.classList.remove("bg-jadebright/10", "text-white"));
  btn.classList.add("bg-jadebright/10", "text-white");
  const panel = btn.dataset.panel;
  $$(".panel").forEach((p) => p.classList.remove("active"));
  $("#panel-" + panel).classList.add("active");
  $("#panelTitle").textContent = TITLES[panel];
  closeSidebar();
  if (panel === "insights") loadInsights();
  if (panel === "coupons") loadCoupons();
  if (panel === "settings") loadConfig();
}));

/* ===================== INSIGHTS ===================== */
async function loadInsights() {
  try {
    const { insights: i } = await api("insights");
    $("#ovRevenue").textContent = rupiah(i.revenue);
    $("#ovOrders").textContent = i.orders;
    $("#ovProducts").textContent = i.prodCount;
    $("#ovStock").textContent = i.available;
    const max = Math.max(1, ...i.top.map((t) => t.qty));
    $("#topSellers").innerHTML = i.top.length ? i.top.map((t, idx) => `
      <div>
        <div class="flex items-center justify-between text-sm mb-1">
          <span class="text-white">${idx + 1}. ${t.label}</span>
          <span class="text-mint/50">${t.qty}x · ${rupiah(t.revenue)}</span>
        </div>
        <div class="h-2 rounded-full bg-mint/10 overflow-hidden"><div class="h-full bg-jadebright" style="width:${(t.qty / max) * 100}%"></div></div>
      </div>`).join("") : `<p class="text-mint/40 text-sm">Belum ada penjualan.</p>`;
  } catch (e) { toast(e.message, false); }
}

/* ===================== CATALOG / PRODUCTS ===================== */
async function loadCatalog() {
  try { const { products } = await api("catalog"); CATALOG = products; renderTable(); renderVariantPicker(); }
  catch (e) { toast(e.message, false); }
}
function renderTable(filter = "") {
  filter = filter.trim().toLowerCase();
  $("#productTable").innerHTML = CATALOG.filter((p) => p.name.toLowerCase().includes(filter)).map((p) => `
    <tr class="border-b border-mint/5 hover:bg-mint/[.03]">
      <td class="p-4"><div class="flex items-center gap-3"><div class="w-9 h-9 rounded-lg bg-jadebright/15 grid place-items-center text-xs font-bold text-jadebright">${p.initials}</div><span class="text-white">${p.name}</span></div></td>
      <td class="p-4 text-mint/60">${CAT_LABEL[p.cat] || p.cat}</td>
      <td class="p-4 text-mint/60">${p.variants.length} variasi</td>
      <td class="p-4 text-jadebright">${priceRange(p.variants)}</td>
      <td class="p-4"><div class="flex items-center justify-end gap-1.5">
        <button class="w-8 h-8 rounded-lg glass border border-mint/10 grid place-items-center hover:border-jadebright/40" data-edit="${p.id}"><i data-lucide="pencil" class="w-3.5"></i></button>
        <button class="w-8 h-8 rounded-lg glass border border-mint/10 grid place-items-center hover:border-red-400/40 hover:text-red-400" data-del="${p.id}"><i data-lucide="trash-2" class="w-3.5"></i></button>
      </div></td>
    </tr>`).join("") || `<tr><td colspan="5" class="text-center text-mint/40 py-12">Tidak ada produk</td></tr>`;
  lucide.createIcons();
}
$("#prodSearch").addEventListener("input", (e) => renderTable(e.target.value));

/* ----- product modal ----- */
const openModal = () => { $("#productModal").classList.remove("translate-x-full"); $("#overlay").classList.remove("hidden"); };
const closeModal = () => { $("#productModal").classList.add("translate-x-full"); $("#overlay").classList.add("hidden"); };
function variantRow(v = {}) {
  return `<div class="variant-row glass border border-mint/10 rounded-xl p-3 flex flex-col gap-2" data-vid="${v.id || ""}">
    <div class="flex gap-2">
      <input class="vr-name flex-1 bg-ink/60 border border-mint/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-jadebright" placeholder="Nama variasi" value="${(v.name||'').replace(/"/g,'&quot;')}" />
      <input class="vr-price w-28 bg-ink/60 border border-mint/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-jadebright" type="number" placeholder="Harga" value="${v.price ?? ""}" />
      <button class="vr-remove w-9 rounded-lg glass border border-mint/10 grid place-items-center hover:text-red-400 hover:border-red-400/40"><i data-lucide="x" class="w-4"></i></button>
    </div>
    <textarea class="vr-snk bg-ink/60 border border-mint/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-jadebright resize-y" rows="2" placeholder="SNK untuk variasi ini">${v.snk || ""}</textarea>
  </div>`;
}
function addVariantRow(v) { $("#variantRows").insertAdjacentHTML("beforeend", variantRow(v)); lucide.createIcons(); }
$("#addVariantBtn").addEventListener("click", () => addVariantRow());
$("#variantRows").addEventListener("click", (e) => { const rm = e.target.closest(".vr-remove"); if (rm) rm.closest(".variant-row").remove(); });
function fillModal(p) {
  $("#fName").value = p ? p.name : ""; $("#fCat").value = p ? p.cat : "ai";
  $("#fInitials").value = p ? p.initials : ""; $("#fTag").value = p ? p.tag : "";
  $("#variantRows").innerHTML = ""; if (p) p.variants.forEach((v) => addVariantRow(v)); else addVariantRow();
}
$("#addProductBtn").addEventListener("click", () => { editingId = null; $("#modalTitle").textContent = "Tambah Produk"; fillModal(null); openModal(); });
$("#productTable").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]"), dl = e.target.closest("[data-del]");
  if (ed) { editingId = ed.dataset.edit; const p = CATALOG.find((x) => x.id === editingId); $("#modalTitle").textContent = "Edit Produk"; fillModal(p); openModal(); }
  if (dl) { const p = CATALOG.find((x) => x.id === dl.dataset.del);
    if (confirm(`Hapus "${p.name}" beserta variasi & stok?`)) { try { await api("delete_product", { id: p.id }); toast("Produk dihapus"); loadCatalog(); } catch (err) { toast(err.message, false); } } }
});
$("#modalClose").addEventListener("click", closeModal);
$("#modalCancel").addEventListener("click", closeModal);
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "p" + Date.now(); }
$("#modalSave").addEventListener("click", async () => {
  const name = $("#fName").value.trim(); if (!name) return toast("Nama wajib diisi", false);
  const rows = $$(".variant-row").map((r) => ({ id: r.dataset.vid || undefined, name: $(".vr-name", r).value.trim(),
    price: $(".vr-price", r).value === "" ? null : Number($(".vr-price", r).value), snk: $(".vr-snk", r).value.trim() })).filter((v) => v.name);
  if (!rows.length) return toast("Minimal 1 variasi", false);
  const id = editingId || slugify(name);
  const existing = CATALOG.find((x) => x.id === editingId);
  try {
    await api("save_product", { product: { id, name, cat: $("#fCat").value, initials: ($("#fInitials").value || name.slice(0, 2)).toUpperCase(), tag: $("#fTag").value.trim(), sort_order: existing?.sort_order ?? CATALOG.length + 1 } });
    const keep = [];
    for (let i = 0; i < rows.length; i++) { const { variant } = await api("save_variant", { variant: { id: rows[i].id, product_id: id, name: rows[i].name, price: rows[i].price, snk: rows[i].snk, sort_order: i + 1 } }); keep.push(variant.id); }
    if (existing) for (const v of existing.variants.filter((v) => !keep.includes(v.id))) await api("delete_variant", { id: v.id });
    toast(editingId ? "Produk diperbarui" : "Produk ditambahkan"); closeModal(); loadCatalog();
  } catch (err) { toast(err.message, false); }
});

/* ===================== STOCK & SNK ===================== */
function renderVariantPicker() {
  $("#variantPicker").innerHTML = CATALOG.map((p) => `
    <div class="mb-2"><span class="text-[11px] uppercase tracking-wider text-mint/40 px-2">${p.name}</span>
      ${p.variants.map((v) => `<button class="vpick w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-mint/5 transition ${selectedVariant === v.id ? "bg-jadebright/10 text-white" : ""}" data-vid="${v.id}">
        <span class="text-sm">${v.name}</span><span class="text-xs ${v.available > 0 ? "text-jadebright" : "text-mint/30"}">${v.available} stok</span></button>`).join("")}
    </div>`).join("") || `<p class="text-mint/40 text-sm text-center py-6">Belum ada variasi</p>`;
}
$("#variantPicker").addEventListener("click", (e) => { const b = e.target.closest(".vpick"); if (b) { selectedVariant = b.dataset.vid; renderVariantPicker(); renderStockManager(); } });

async function renderStockManager() {
  let variant = null, product = null;
  CATALOG.forEach((p) => p.variants.forEach((v) => { if (v.id === selectedVariant) { variant = v; product = p; } }));
  if (!variant) return;
  const box = $("#stockManager");
  box.innerHTML = `<div class="text-center text-mint/40 py-16"><i data-lucide="loader" class="w-8 mx-auto animate-spin"></i></div>`; lucide.createIcons();
  let items = [];
  try { items = (await api("list_stock", { variant_id: selectedVariant })).stock; } catch (e) { box.innerHTML = `<p class="text-amber-300 text-sm">${e.message}</p>`; return; }
  const avail = items.filter((i) => i.status === "available").length, sold = items.filter((i) => i.status === "sold").length;
  box.innerHTML = `
    <div class="mb-4"><h3 class="font-serif text-xl text-white">${product.name} <span class="text-mint/40">·</span> ${variant.name}</h3>
      <p class="text-sm text-mint/50">${rupiah(variant.price)} · <span class="text-jadebright">${avail} tersedia</span> · ${sold} terjual</p></div>
    <div class="glass border border-mint/10 rounded-xl p-4 mb-4">
      <label class="text-sm font-semibold text-white flex items-center gap-2 mb-2"><i data-lucide="file-text" class="w-4 text-jadebright"></i> SNK Variasi</label>
      <textarea id="snkBox" rows="3" class="w-full bg-ink/60 border border-mint/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-jadebright resize-y">${variant.snk || ""}</textarea>
      <button id="saveSnk" class="mt-2 bg-jadebright text-ink font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-110 transition flex items-center gap-2"><i data-lucide="save" class="w-4"></i> Simpan SNK</button>
    </div>
    <div class="glass border border-mint/10 rounded-xl p-4 mb-4">
      <label class="text-sm font-semibold text-white flex items-center gap-2 mb-2"><i data-lucide="upload" class="w-4 text-jadebright"></i> Tambah Stok (1 baris = 1 unit)</label>
      <textarea id="bulkBox" rows="5" class="w-full bg-ink/60 border border-mint/10 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-jadebright resize-y" placeholder="email1@mail.com | pass1&#10;email2@mail.com | pass2&#10;https://link-3"></textarea>
      <div class="flex items-center gap-2 mt-2">
        <button id="addBulk" class="bg-jadebright text-ink font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-110 transition flex items-center gap-2"><i data-lucide="plus" class="w-4"></i> Tambah</button>
        <label class="glass border border-mint/10 rounded-lg px-4 py-2 text-sm cursor-pointer hover:border-jadebright/40 flex items-center gap-2"><i data-lucide="file-up" class="w-4"></i> Upload .txt<input id="fileUp" type="file" accept=".txt,.csv" class="hidden" /></label>
        <span class="text-xs text-mint/40 ml-auto" id="bulkCount">0 baris</span>
      </div>
    </div>
    <div><span class="text-sm font-semibold text-white">Daftar Stok (${items.length})</span>
      <div class="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto mt-2">
        ${items.length ? items.map((it) => `<div class="flex items-center gap-2 glass border border-mint/10 rounded-lg px-3 py-2 text-sm">
          <span class="w-2 h-2 rounded-full ${it.status === "available" ? "bg-jadebright" : "bg-mint/30"}"></span>
          <code class="flex-1 truncate ${it.status === "sold" ? "text-mint/30 line-through" : "text-mint/80"}">${(it.payload||'').replace(/</g,'&lt;')}</code>
          <span class="text-[11px] ${it.status === "available" ? "text-jadebright" : "text-mint/30"}">${it.status === "available" ? "tersedia" : "terjual"}</span>
          ${it.status === "available" ? `<button class="del-stock text-mint/30 hover:text-red-400" data-id="${it.id}"><i data-lucide="trash-2" class="w-3.5"></i></button>` : ""}
        </div>`).join("") : `<p class="text-mint/40 text-sm text-center py-6">Belum ada stok</p>`}
      </div></div>`;
  lucide.createIcons();

  $("#saveSnk").addEventListener("click", async () => {
    try { await api("save_variant", { variant: { id: variant.id, product_id: product.id, name: variant.name, price: variant.price, snk: $("#snkBox").value.trim(), sort_order: variant.sort_order } });
      variant.snk = $("#snkBox").value.trim(); toast("SNK disimpan"); } catch (e) { toast(e.message, false); }
  });
  const bulk = $("#bulkBox");
  const upd = () => $("#bulkCount").textContent = bulk.value.split("\n").filter((l) => l.trim()).length + " baris";
  bulk.addEventListener("input", upd);
  $("#fileUp").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { bulk.value = (bulk.value ? bulk.value + "\n" : "") + rd.result.trim(); upd(); toast("File dimuat"); }; rd.readAsText(f); });
  $("#addBulk").addEventListener("click", async () => {
    const lines = bulk.value.split("\n");
    try { const { added } = await api("add_stock", { variant_id: selectedVariant, lines }); if (!added) return toast("Tidak ada baris valid", false);
      toast(`${added} stok ditambahkan`); bulk.value = ""; await loadCatalog(); renderStockManager(); } catch (e) { toast(e.message, false); }
  });
  box.querySelectorAll(".del-stock").forEach((b) => b.addEventListener("click", async () => {
    try { await api("delete_stock", { id: b.dataset.id }); toast("Stok dihapus"); await loadCatalog(); renderStockManager(); } catch (e) { toast(e.message, false); }
  }));
}

/* ===================== COUPONS ===================== */
async function loadCoupons() {
  try {
    const { coupons } = await api("list_coupons");
    $("#couponList").innerHTML = coupons.length ? coupons.map((c) => `
      <div class="flex items-center gap-3 glass border border-mint/10 rounded-xl px-4 py-3">
        <div class="font-mono font-semibold text-jadebright">${c.code}</div>
        <span class="text-xs text-mint/50">${c.type === "percent" ? c.value + "%" : rupiah(c.value)} · ${c.used_count}/${c.max_uses || "∞"} pakai</span>
        <span class="text-[11px] px-2 py-0.5 rounded-full ${c.active ? "bg-jadebright/10 text-jadebright" : "bg-mint/10 text-mint/40"}">${c.active ? "aktif" : "nonaktif"}</span>
        <button class="del-coupon ml-auto text-mint/30 hover:text-red-400" data-id="${c.id}"><i data-lucide="trash-2" class="w-4"></i></button>
      </div>`).join("") : `<p class="text-mint/40 text-sm">Belum ada kupon.</p>`;
    lucide.createIcons();
    $$(".del-coupon").forEach((b) => b.addEventListener("click", async () => { try { await api("delete_coupon", { id: b.dataset.id }); toast("Kupon dihapus"); loadCoupons(); } catch (e) { toast(e.message, false); } }));
  } catch (e) { toast(e.message, false); }
}
$("#addCouponBtn").addEventListener("click", async () => {
  const code = $("#cCode").value.trim().toUpperCase(); if (!code) return toast("Kode wajib", false);
  const value = Number($("#cValue").value); if (!value) return toast("Nilai wajib", false);
  try { await api("save_coupon", { coupon: { code, type: $("#cType").value, value, max_uses: Number($("#cMax").value) || 0, active: true } });
    toast("Kupon disimpan"); $("#cCode").value = ""; $("#cValue").value = ""; loadCoupons(); } catch (e) { toast(e.message, false); }
});

/* ===================== PAKASIR CONFIG ===================== */
async function loadConfig() {
  try {
    const { config } = await api("get_config");
    $("#pkProject").value = config.pakasir_project || "";
    $("#pkMode").value = config.pakasir_mode || "sandbox";
    $("#pkWebhook").value = config.webhook_url || "";
    $("#keyHint").textContent = config.api_key_set ? `(tersimpan: ${config.api_key_preview})` : "(belum diset)";
  } catch (e) { toast(e.message, false); }
}
$("#saveCfgBtn").addEventListener("click", async () => {
  try {
    await api("save_config", { pakasir_project: $("#pkProject").value.trim(), pakasir_mode: $("#pkMode").value,
      webhook_url: $("#pkWebhook").value.trim(), pakasir_api_key: $("#pkApiKey").value.trim() || undefined });
    $("#pkApiKey").value = ""; toast("Konfigurasi disimpan"); loadConfig();
  } catch (e) { toast(e.message, false); }
});

/* ===================== SIDEBAR / INIT ===================== */
const closeSidebar = () => $("#sidebar").classList.add("-translate-x-full");
$("#menuToggle").addEventListener("click", () => { $("#sidebar").classList.remove("-translate-x-full"); $("#overlay").classList.remove("hidden"); });
$("#overlay").addEventListener("click", () => { closeModal(); closeSidebar(); });
$("#refreshBtn").addEventListener("click", () => { loadCatalog(); loadInsights(); toast("Dimuat ulang"); });

function boot() { loadCatalog(); loadInsights(); }
lucide.createIcons();
