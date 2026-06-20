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

function toast(msg, ok = true) {
  const t = $("#toast");
  t.innerHTML = `<i data-lucide="${ok ? "check-circle" : "alert-circle"}" class="w-4 ${ok ? "text-jadebright" : "text-red-300"}"></i><span>${msg}</span>`;
  t.classList.remove("opacity-0","translate-y-3"); lucide.createIcons();
  clearTimeout(window.__toast); window.__toast = setTimeout(()=>t.classList.add("opacity-0","translate-y-3"), 2600);
}

async function tryLogin() {
  ADMIN_KEY = $("#adminKey").value.trim();
  if (!ADMIN_KEY) return toast("Masukkan admin key", false);
  try {
    await api("login");
    sessionStorage.setItem("nova_admin_key", ADMIN_KEY);
    $("#loginGate").classList.add("hidden");
    boot();
  } catch (e) { toast(e.message, false); }
}
$("#loginBtn").addEventListener("click", tryLogin);
$("#adminKey").addEventListener("keydown", (e)=>{ if(e.key==="Enter") tryLogin(); });
$("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem("nova_admin_key"); location.reload(); });
if (ADMIN_KEY) { $("#loginGate").classList.add("hidden"); boot(); }

/* ===================== NAV ===================== */
const TITLES = { insights: "Insights & Finansial", rekap: "Rekap Penjualan", products: "Produk", stock: "Stok & SNK", coupons: "Kupon", settings: "Pakasir API", store: "Pengaturan Toko", tampilan: "Tampilan" };
$$(".nav-item").forEach((b) => b.addEventListener("click", () => {
  $$(".nav-item").forEach(x => x.classList.remove("bg-jadebright/10","text-white"));
  b.classList.add("bg-jadebright/10","text-white");
  $$(".panel").forEach(p => p.classList.remove("active"));
  const panel = b.dataset.panel;
  $("#panel-" + panel).classList.add("active"); $("#panelTitle").textContent = TITLES[panel];
  if (panel === "insights") loadInsights();
  if (panel === "rekap") { setDefaultDates(); loadRekap($("#rekapStart").value, $("#rekapEnd").value); }
  if (panel === "coupons") loadCoupons();
  if (panel === "settings") loadConfig();
  if (panel === "store") { loadStoreConfig(); loadSocConfig(); }
  if (panel === "tampilan") loadTampilan();
  $("#sidebar").classList.add("-translate-x-full");
}));
$("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("-translate-x-full"));

/* ===================== ACCORDION ===================== */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".accord-btn");
  if (!btn) return;
  const targetId = btn.dataset.target;
  const body = document.getElementById(targetId);
  if (!body) return;
  const icon = btn.querySelector(".accord-icon");
  const isOpen = !body.classList.contains("hidden");
  body.classList.toggle("hidden");
  if (icon) {
    icon.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
  }
});

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

/* ===================== REKAP PENJUALAN ===================== */
async function loadRekap(startDate, endDate) {
  try {
    const { orders, summary } = await api("list_orders", { start_date: startDate, end_date: endDate });
    $("#rekapCount").textContent = `${(orders || []).length} pesanan`;
    $("#rkTotalOrders").textContent = summary.total_orders;
    $("#rkPaidOrders").textContent = summary.paid_orders;
    $("#rkRevenue").textContent = rupiah(summary.revenue);
    $("#rkAvg").textContent = rupiah(summary.avg_order);

    $("#rekapTable").innerHTML = (orders || []).length
      ? orders.map(o => `
        <tr class="border-b border-mint/5 hover:bg-mint/[.03]">
          <td class="p-3 text-xs font-mono text-mint/60">${o.order_id ? o.order_id.slice(0, 12) : '—'}</td>
          <td class="p-3 text-white">${o.product_name || '—'}</td>
          <td class="p-3 text-mint/60">${o.variant_name || '—'}</td>
          <td class="p-3">${statusBadge(o.status)}</td>
          <td class="p-3 text-right font-mono text-white">${rupiah(o.amount)}</td>
          <td class="p-3 text-right text-mint/40 text-xs">${o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : '—'}</td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="p-8 text-center text-mint/40">Belum ada pesanan.</td></tr>`;
    lucide.createIcons();
  } catch (e) { toast(e.message, false); }
}
function statusBadge(status) {
  const m = { paid: ['Lunas', 'bg-jadebright/10 text-jadebright border-jadebright/30'], pending: ['Pending', 'bg-amber-400/10 text-amber-300 border-amber-400/30'], failed: ['Gagal', 'bg-red-400/10 text-red-300 border-red-400/30'], expired: ['Kadaluarsa', 'bg-mint/5 text-mint/50 border-mint/10'] };
  const [label, cls] = m[status] || [status, 'bg-mint/5 text-mint/50 border-mint/10'];
  return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}">${label}</span>`;
}
function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  $("#rekapStart").value = today;
  $("#rekapEnd").value = today;
}
$("#rekapFilterBtn").addEventListener("click", () => loadRekap($("#rekapStart").value || undefined, $("#rekapEnd").value || undefined));
$("#rekapResetBtn").addEventListener("click", () => { setDefaultDates(); loadRekap($("#rekapStart").value, $("#rekapEnd").value); });

/* ===================== CATALOG / PRODUCTS ===================== */
async function loadCatalog({ refreshInsights = false } = {}) {
  try {
    const { products } = await api("catalog");
    CATALOG = Array.isArray(products) ? products : [];
    renderTable($("#prodSearch")?.value || "");
    renderVariantPicker();
    if (selectedVariant) renderStockManager();
    if (refreshInsights) await loadInsights();
  } catch (e) { toast(e.message, false); }
}
function renderTable(filter = "") {
  filter = filter.trim().toLowerCase();
  $("#productTable").innerHTML = CATALOG.filter((p) => p.name.toLowerCase().includes(filter)).map((p) => `
    <tr class="border-b border-mint/5 hover:bg-mint/[.03]">
      <td class="p-4"><div class="flex items-center gap-3"><div class="w-9 h-9 rounded-lg bg-jadebright/15 grid place-items-center text-xs font-bold text-jadebright">${p.initials}</div><span class="text-white">${p.name}</span></div></td>
      <td class="p-4 text-mint/60">${CAT_LABEL[p.cat] || p.cat}</td>
      <td class="p-4 text-mint/60">${p.variants.length} variasi</td>
      <td class="p-4 text-jadebright">${priceRange(p.variants)}</td>
      <td class="p-4"><div class="flex gap-2 justify-end"><button class="edit-prod p-2 rounded-lg hover:bg-mint/10" data-id="${p.id}"><i data-lucide="pencil" class="w-4"></i></button><button class="del-prod p-2 rounded-lg hover:bg-red-400/10 text-red-300" data-id="${p.id}"><i data-lucide="trash" class="w-4"></i></button></div></td>
    </tr>`).join("");
  lucide.createIcons();
  $$(".edit-prod").forEach((b) => b.addEventListener("click", () => openModal(CATALOG.find(p=>p.id===b.dataset.id))));
  $$(".del-prod").forEach((b) => b.addEventListener("click", async () => {
    const p = CATALOG.find(x=>x.id===b.dataset.id);
    if (confirm(`Hapus "${p.name}" beserta variasi & stok?`)) { try { await api("delete_product", { id: p.id }); toast("Produk dihapus"); loadCatalog({ refreshInsights: true }); } catch (err) { toast(err.message, false); } } }
  ));
}
$("#prodSearch").addEventListener("input", (e) => renderTable(e.target.value));

/* ===================== PRODUCT MODAL ===================== */
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "p" + Date.now(); }
function variantRow(v = {}) {
  return `<div class="grid grid-cols-12 gap-2 variant-row" data-id="${v.id || ""}">
    <input class="v-name col-span-4 bg-ink/60 border border-mint/10 rounded-xl px-3 py-2 text-sm" placeholder="Nama" value="${v.name || ""}" />
    <input class="v-price col-span-3 bg-ink/60 border border-mint/10 rounded-xl px-3 py-2 text-sm" type="number" placeholder="Harga" value="${v.price ?? ""}" />
    <input class="v-snk col-span-4 bg-ink/60 border border-mint/10 rounded-xl px-3 py-2 text-sm" placeholder="SNK" value="${v.snk || ""}" />
    <button class="v-del col-span-1 rounded-xl glass border border-mint/10 hover:bg-red-400/10 text-red-300"><i data-lucide="x" class="w-4 mx-auto"></i></button>
  </div>`;
}
function addVariantRow(v) { $("#variantRows").insertAdjacentHTML("beforeend", variantRow(v)); lucide.createIcons(); }
$("#addVariantBtn").addEventListener("click", () => addVariantRow());
$("#variantRows").addEventListener("click", async (e) => { if (e.target.closest(".v-del")) { e.preventDefault(); const row=e.target.closest(".variant-row"); const id=row.dataset.id; if(id && confirm("Hapus variasi ini?")) await api("delete_variant", { id }); row.remove(); } });

function openModal(p = null) {
  editingId = p?.id || null;
  $("#modalTitle").textContent = editingId ? "Edit Produk" : "Tambah Produk";
  $("#fName").value = p?.name || ""; $("#fCat").value = p?.cat || "ai";
  $("#fSubtitle").value = p?.subtitle || ""; $("#fInitials").value = p?.initials || "";
  $("#fActive").checked = p?.active ?? true; $("#variantRows").innerHTML = "";
  (p?.variants?.length ? p.variants : [{}]).forEach(addVariantRow);
  $("#modal").classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); editingId = null; }
$("#addProductBtn").addEventListener("click", () => openModal());
$("#modalCancel").addEventListener("click", closeModal);
$("#modalSave").addEventListener("click", async () => {
  const name = $("#fName").value.trim(); if (!name) return toast("Nama wajib", false);
  const product = { id: editingId || slugify(name), name, cat: $("#fCat").value, subtitle: $("#fSubtitle").value.trim(), initials: $("#fInitials").value.trim() || name.slice(0,2).toUpperCase(), active: $("#fActive").checked };
  try {
    await api("save_product", { product });
    for (const row of $$(".variant-row")) {
      const v = { id: row.dataset.id || `${product.id}-${slugify($(".v-name",row).value)}`, product_id: product.id, name: $(".v-name",row).value.trim(), price: Number($(".v-price",row).value || 0), snk: $(".v-snk",row).value.trim(), active: true };
      if (v.name) await api("save_variant", { variant: v });
    }
    toast(editingId ? "Produk diperbarui" : "Produk ditambahkan"); closeModal(); loadCatalog({ refreshInsights: true });
  } catch (e) { toast(e.message, false); }
});

/* ===================== STOCK / SNK ===================== */
function renderVariantPicker() {
  const groups = {};
  CATALOG.forEach(p => {
    p.variants.forEach(v => {
      if (!groups[p.id]) groups[p.id] = { product: p, variants: [] };
      groups[p.id].variants.push({...v, product_name: p.name});
    });
  });
  const ids = Object.keys(groups);
  if (!selectedVariant && ids.length) {
    const first = groups[ids[0]];
    selectedVariant = first.variants[0]?.id;
  }
  const isSelectedGroup = (pid) => groups[pid]?.variants.some(v => v.id === selectedVariant);

  $("#variantPicker").innerHTML = ids.length
    ? ids.map(pid => {
        const g = groups[pid];
        const open = isSelectedGroup(pid);
        return `<div class="variant-group glass border ${open ? 'border-jadebright/30' : 'border-mint/10'} rounded-xl overflow-hidden">
          <button class="vg-head w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-mint/5 transition" data-pid="${pid}">
            <span class="flex items-center gap-2"><span class="w-7 h-7 rounded-lg bg-jadebright/15 grid place-items-center text-xs font-bold text-jadebright">${g.product.initials}</span><b class="text-white">${g.product.name}</b></span>
            <i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" class="w-4 text-mint/40 transition"></i>
          </button>
          <div class="flex flex-col gap-1 px-2 pb-2 ${open ? '' : 'hidden'}">
            ${g.variants.map(v => `<button class="vpick text-left rounded-xl px-3 py-2 border ${selectedVariant===v.id?'border-jadebright bg-jadebright/10 text-white':'border-transparent text-mint/70 hover:bg-mint/5'}" data-vid="${v.id}"><span class="text-sm">${v.name}</span> <span class="text-xs opacity-70">· stok ${v.available}</span></button>`).join('')}
          </div>
        </div>`;
      }).join('')
    : `<p class="text-sm text-mint/40">Belum ada variasi.</p>`;
  lucide.createIcons();
}
$("#variantPicker").addEventListener("click", (e) => {
  const pick = e.target.closest(".vpick");
  if (pick) { selectedVariant = pick.dataset.vid; renderVariantPicker(); renderStockManager(); return; }
  const head = e.target.closest(".vg-head");
  if (head) {
    const group = head.closest(".variant-group");
    const body = group.querySelector("div:last-child");
    const icon = head.querySelector("[data-lucide]");
    const isOpen = !body.classList.contains("hidden");
    body.classList.toggle("hidden");
    if (icon) { icon.setAttribute("data-lucide", isOpen ? "chevron-right" : "chevron-down"); }
    lucide.createIcons();
  }
});

async function renderStockManager() {
  const box = $("#stockManager");
  const variant = CATALOG.flatMap(p => p.variants.map(v => ({...v, product_name:p.name}))).find(v=>v.id===selectedVariant);
  if (!variant) { box.innerHTML = `<p class="text-mint/40 text-sm">Pilih variasi.</p>`; return; }
  box.innerHTML = `<div class="text-center text-mint/40 py-16"><i data-lucide="loader" class="w-8 mx-auto animate-spin"></i></div>`; lucide.createIcons();
  try {
    const { stock } = await api("list_stock", { variant_id: selectedVariant });
    box.innerHTML = `
      <div class="glass border border-mint/10 rounded-2xl p-5 mb-4">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div><h3 class="text-white font-semibold">${variant.product_name} — ${variant.name}</h3></div>
          <span class="text-xs bg-jadebright/10 text-jadebright border border-jadebright/30 rounded-full px-3 py-1">${variant.available} tersedia</span>
        </div>
        <label class="text-sm font-semibold text-white flex items-center gap-2 mb-2"><i data-lucide="upload" class="w-4 text-jadebright"></i> Tambah Stok (1 baris = 1 unit)</label>
        <textarea id="bulkPayload" rows="5" placeholder="email|password|catatan\natau serial key..." class="w-full bg-ink/60 border border-mint/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-jadebright"></textarea>
        <div class="flex flex-wrap gap-2 mt-3 items-center">
          <button id="addStockBtn" disabled class="bg-jadebright disabled:opacity-40 text-ink font-semibold rounded-xl px-4 py-2 text-sm"><i data-lucide="plus" class="w-4 inline"></i> Tambah 0</button>
          <label class="glass border border-mint/10 rounded-lg px-4 py-2 text-sm cursor-pointer hover:border-jadebright/40 flex items-center gap-2"><i data-lucide="file-up" class="w-4"></i> Upload .txt<input id="fileUp" type="file" accept=".txt,.csv" class="hidden" /></label>
          <button id="snkEditBtn" class="glass border border-jadebright/30 text-jadebright rounded-lg px-4 py-2 text-sm hover:bg-jadebright/10 flex items-center gap-2"><i data-lucide="file-text" class="w-4"></i> SNK</button>
        </div>
        <div id="snkEditor" class="hidden mt-3 p-3 glass border border-jadebright/20 rounded-xl">
          <label class="text-sm font-semibold text-white flex items-center gap-2 mb-2"><i data-lucide="file-text" class="w-4 text-jadebright"></i> Edit SNK (Syarat & Ketentuan)</label>
          <textarea id="snkInput" rows="3" class="w-full bg-ink/60 border border-mint/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-jadebright">${(variant.snk || '').replace(/</g,'&lt;')}</textarea>
          <button id="snkSaveBtn" class="mt-2 bg-jadebright text-ink font-semibold rounded-xl px-4 py-2 text-sm hover:brightness-110 transition"><i data-lucide="check" class="w-4 inline"></i> Simpan SNK</button>
        </div>
      </div>
      <div class="glass border border-mint/10 rounded-2xl overflow-hidden">
        <div class="p-4 border-b border-mint/10 text-sm text-mint/50">Daftar stok (${stock.length})</div>
        <div class="max-h-[380px] overflow-auto divide-y divide-mint/5">
          ${stock.map(it => `<div class="p-3 flex items-center gap-3 text-xs">
          <span class="w-20 ${it.status==='sold'?'text-red-300':'text-jadebright'}">${it.status}</span>
          <code class="flex-1 truncate ${it.status === "sold" ? "text-mint/30 line-through" : "text-mint/80"}">${(it.payload||'').replace(/</g,'&lt;')}</code>
          ${it.status!=="sold"?`<button class="del-stock text-red-300 hover:bg-red-400/10 rounded-lg p-2" data-id="${it.id}"><i data-lucide="trash" class="w-4"></i></button>`:""}
          </div>`).join("") || `<div class="p-8 text-center text-mint/40 text-sm">Belum ada stok.</div>`}
        </div>
      </div>`;
    lucide.createIcons();
    const bulk = $("#bulkPayload"), btn = $("#addStockBtn");
    const upd = () => { const n=bulk.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).length; btn.disabled=!n; btn.innerHTML=`<i data-lucide="plus" class="w-4 inline"></i> Tambah ${n}`; lucide.createIcons(); };
    bulk.addEventListener("input", upd);
    $("#fileUp").addEventListener("change", (e) => { const f=e.target.files[0]; if(!f)return; const rd=new FileReader(); rd.onload = () => { bulk.value = (bulk.value ? bulk.value + "\n" : "") + rd.result.trim(); upd(); toast("File dimuat"); }; rd.readAsText(f); });
    btn.addEventListener("click", async () => {
      const payloads = bulk.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      try { const { added } = await api("add_stock", { variant_id: selectedVariant, payloads });
      toast(`${added} stok ditambahkan`); bulk.value = ""; await loadCatalog({ refreshInsights: true }); renderStockManager(); } catch (e) { toast(e.message, false); }
    });
    $("#snkEditBtn", box).addEventListener("click", () => {
      const editor = $("#snkEditor", box);
      editor.classList.toggle("hidden");
      lucide.createIcons();
    });
    $("#snkSaveBtn", box).addEventListener("click", async () => {
      const snk = $("#snkInput", box).value.trim();
      try { await api("save_snk", { variant_id: selectedVariant, snk });
        toast("SNK disimpan"); $("#snkEditor", box).classList.add("hidden"); await loadCatalog(); } catch (e) { toast(e.message, false); }
    });
    $$(".del-stock", box).forEach(b=>b.addEventListener("click", async()=>{
    try { await api("delete_stock", { id: b.dataset.id }); toast("Stok dihapus"); await loadCatalog({ refreshInsights: true }); renderStockManager(); } catch (e) { toast(e.message, false); }
    }));
  } catch (e) { box.innerHTML = `<p class="text-red-300 text-sm">${e.message}</p>`; }
}

/* ===================== COUPONS ===================== */
async function loadCoupons() {
  try {
    const { coupons } = await api("list_coupons");
    $("#couponList").innerHTML = coupons.map(c => `<div class="glass border border-mint/10 rounded-xl p-3 flex items-center gap-3">
      <div class="flex-1"><b class="text-white">${c.code}</b><p class="text-xs text-mint/45">${c.type} · ${c.value}${c.type==='percent'?'%':' rupiah'} · ${c.active?'aktif':'nonaktif'}</p></div>
      <button class="del-coupon text-red-300 p-2 hover:bg-red-400/10 rounded-lg" data-id="${c.id}"><i data-lucide="trash" class="w-4"></i></button>
    </div>`).join("") || `<p class="text-sm text-mint/40">Belum ada kupon.</p>`;
    lucide.createIcons();
    $$(".del-coupon").forEach((b) => b.addEventListener("click", async () => { try { await api("delete_coupon", { id: b.dataset.id }); toast("Kupon dihapus"); loadCoupons(); } catch (e) { toast(e.message, false); } }));
  } catch (e) { toast(e.message, false); }
}
$("#saveCouponBtn").addEventListener("click", async () => {
  const coupon = { code: $("#cCode").value.trim(), type: $("#cType").value, value: Number($("#cValue").value||0), active: $("#cActive").checked };
  if (!coupon.code || !coupon.value) return toast("Kode & nilai wajib", false);
  try { await api("save_coupon", { coupon });
    toast("Kupon disimpan"); $("#cCode").value = ""; $("#cValue").value = ""; loadCoupons(); } catch (e) { toast(e.message, false); }
});

/* ===================== CONFIG ===================== */
async function loadConfig() {
  try { const { config } = await api("get_config");
    $("#pkProject").value = config.pakasir_project || ""; $("#pkMode").value = config.pakasir_mode || "sandbox";
    $("#pkWebhook").value = config.webhook_url || (location.origin + "/api/pakasir-webhook");
    $("#keyStatus").textContent = config.api_key_set ? `API key tersimpan (${config.api_key_preview})` : "API key belum diset";
  } catch(e){ toast(e.message, false); }
}
$("#saveConfigBtn").addEventListener("click", async () => {
  try { await api("save_config", { pakasir_project: $("#pkProject").value.trim(), pakasir_mode: $("#pkMode").value, webhook_url: $("#pkWebhook").value.trim(), pakasir_api_key: $("#pkApiKey").value.trim() });
    $("#pkApiKey").value = ""; toast("Konfigurasi disimpan"); loadConfig();
  } catch(e){ toast(e.message, false); }
});

/* ===================== STORE SETTINGS ===================== */
async function loadStoreConfig() {
  try {
    const r = await fetch("/api/store-config");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    $("#sName").value = d.name || "";
    $("#sTagline").value = d.tagline || "";
    $("#sHeroTitle").value = d.hero_title || "";
    $("#sHeroSub").value = d.hero_subtitle || "";
    $("#sFooter").value = d.footer_text || "";
    $("#sBantuanContact").value = d.bantuan_contact || "";
    $("#sBantuanFaq").value = d.bantuan_faq || "";
    if (d.annon) {
      $("#sAnnonActive").checked = d.annon.active;
      $("#sAnnonBadge").value = d.annon.badge_text || "";
      $("#sAnnonText").value = d.annon.text || "";
    }
  } catch(e) { toast(e.message, false); }
}
$("#saveStoreBtn").addEventListener("click", async () => {
  const body = {
    store_name: $("#sName").value.trim(),
    store_tagline: $("#sTagline").value.trim(),
    store_hero_title: $("#sHeroTitle").value.trim(),
    store_hero_subtitle: $("#sHeroSub").value.trim(),
    store_footer_text: $("#sFooter").value.trim(),
    bantuan_contact: $("#sBantuanContact").value.trim(),
    bantuan_faq: $("#sBantuanFaq").value.trim(),
  };
  try {
    const r = await fetch("/api/store-save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast("Pengaturan toko disimpan");
  } catch(e) { toast(e.message, false); }
});
$("#saveBantuanBtn").addEventListener("click", async () => {
  const body = {
    bantuan_contact: $("#sBantuanContact").value.trim(),
    bantuan_faq: $("#sBantuanFaq").value.trim(),
  };
  try {
    const r = await fetch("/api/store-save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast("Pengaturan bantuan disimpan");
  } catch(e) { toast(e.message, false); }
});
$("#saveAnnonBtn").addEventListener("click", async () => {
  const body = {
    annon_active: $("#sAnnonActive").checked,
    annon_badge_text: $("#sAnnonBadge").value.trim(),
    annon_text: $("#sAnnonText").value.trim(),
  };
  try {
    const r = await fetch("/api/store-save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast("Announcement disimpan");
  } catch(e) { toast(e.message, false); }
});

/* ===================== SOSIAL MEDIA ===================== */
async function loadSocConfig() {
  try {
    const r = await fetch("/api/store-config");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const soc = d.soc || {};
    $("#sWaActive").checked = soc.wa_active;
    $("#sWaNumber").value = soc.wa_number || "";
    $("#sTeleActive").checked = soc.tele_active;
    $("#sTeleChannelActive").checked = soc.tele_channel_active;
    $("#sTeleChannel").value = soc.tele_channel || "";
    $("#sTeleBotActive").checked = soc.tele_bot_active;
    $("#sTeleBot").value = soc.tele_bot || "";
    $("#sXActive").checked = soc.x_active;
    $("#sXLink").value = soc.x_link || "";
    $("#sIgActive").checked = soc.ig_active;
    $("#sIgLink").value = soc.ig_link || "";
  } catch(e) { toast(e.message, false); }
}

$("#saveSocBtn").addEventListener("click", async () => {
  const body = {
    soc_wa_active: $("#sWaActive").checked,
    soc_wa_number: $("#sWaNumber").value.trim(),
    soc_tele_active: $("#sTeleActive").checked,
    soc_tele_channel_active: $("#sTeleChannelActive").checked,
    soc_tele_channel: $("#sTeleChannel").value.trim(),
    soc_tele_bot_active: $("#sTeleBotActive").checked,
    soc_tele_bot: $("#sTeleBot").value.trim(),
    soc_x_active: $("#sXActive").checked,
    soc_x_link: $("#sXLink").value.trim(),
    soc_ig_active: $("#sIgActive").checked,
    soc_ig_link: $("#sIgLink").value.trim(),
  };
  try {
    const r = await fetch("/api/store-save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    toast("Sosial media disimpan");
  } catch(e) { toast(e.message, false); }
});

/* ===================== TAMPILAN ===================== */
const BG_LIST = [
  { file: "bg/moon-sky-night-background-asset-game-2d-futuristic-generative-ai.jpg", label: "Moon Sky" },
  { file: "bg/halloween-scene-illustration-anime-style.jpg", label: "Halloween" },
  { file: "bg/anime-style-mythical-dragon-creature.jpg", label: "Dragon" },
  { file: "bg/mythical-dragon-beast-anime-style.jpg", label: "Dragon Beast" },
  { file: "bg/illustration-anime-character-rain.jpg", label: "Rain" },
];

function loadTampilan() {
  const mode = localStorage.getItem("nova_bg_mode") || "auto";
  const idx = localStorage.getItem("nova_bg_manual_idx") || 0;
  const interval = localStorage.getItem("nova_bg_interval") || "120";
  $("#bgMode").value = mode;
  $("#bgInterval").value = interval;
  renderBgPicker(Number(idx));
  toggleBgMode();
  $("#bgMode").addEventListener("change", toggleBgMode);
}

function toggleBgMode() {
  const mode = $("#bgMode").value;
  $("#bgManualPicker").classList.toggle("hidden", mode !== "manual");
  $("#bgAutoSettings").classList.toggle("hidden", mode !== "auto");
}

function renderBgPicker(activeIdx) {
  $("#bgList").innerHTML = BG_LIST.map((b, i) => `
    <button class="bg-opt text-left rounded-xl p-2 border text-sm ${i === activeIdx ? 'border-jadebright bg-jadebright/10' : 'border-mint/10 glass hover:border-jadebright/40'}" data-idx="${i}">
      <div class="w-full h-16 rounded-lg mb-1 overflow-hidden" style="background:url(${b.file}) center/cover"></div>
      <span class="text-xs ${i === activeIdx ? 'text-white' : 'text-mint/70'}">${b.label}</span>
    </button>
  `).join("");
  lucide.createIcons();
  $$(".bg-opt").forEach(btn => btn.addEventListener("click", () => {
    const idx = Number(btn.dataset.idx);
    localStorage.setItem("nova_bg_manual_idx", idx);
    localStorage.setItem("nova_bg_mode", "manual");
    applyBgManually(BG_LIST[idx].file);
    loadTampilan();
    toast("Background berubah");
  }));
}

function applyBgManually(file) {
  document.documentElement.style.setProperty("--bg-img", `url(${file})`);
}

$("#saveTampilanBtn").addEventListener("click", () => {
  const mode = $("#bgMode").value;
  const interval = Number($("#bgInterval").value) || 120;
  localStorage.setItem("nova_bg_mode", mode);
  localStorage.setItem("nova_bg_interval", String(interval));

  if (mode === "auto") {
    // Reset rotator with new interval
    localStorage.removeItem("nova_bg_idx");
    document.documentElement.style.setProperty("--bg-img", "");
    toast(`Mode auto dengan interval ${interval} menit. Refresh halaman untuk mengaktifkan.`);
  } else {
    toast("Pilih gambar manual di atas");
  }
});

/* ===================== INIT ===================== */
$("#refreshBtn").addEventListener("click", async () => { await loadCatalog({ refreshInsights: true }); toast("Data dashboard disinkronkan"); });

function startAutoSync() {
  if (window.__novaAdminSync) clearInterval(window.__novaAdminSync);
  window.__novaAdminSync = setInterval(() => loadCatalog({ refreshInsights: true }), 30000);
}
function boot() { loadCatalog({ refreshInsights: true }); startAutoSync(); }
lucide.createIcons();
