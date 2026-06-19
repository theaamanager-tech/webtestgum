/* ===================== DATA ===================== */
const PRODUCTS = [
  {
    id: "capcut", name: "CapCut Pro", cat: "Editing", group: "editing",
    initials: "CC", color: "linear-gradient(135deg,#00e0c6,#0a84ff)", tag: "Best Seller",
    variants: [
      { name: "7 Hari", price: 15000 },
      { name: "30 Hari", price: 35000 },
    ],
  },
  {
    id: "paypal", name: "PayPal Fresh", cat: "Akun", group: "account",
    initials: "PP", color: "linear-gradient(135deg,#0070ba,#1546a0)", tag: "Ready",
    variants: [
      { name: "Domain", price: 3000 },
      { name: "Gmail", price: 5000 },
    ],
  },
  {
    id: "chatgpt", name: "ChatGPT Plus", cat: "AI Tools", group: "ai",
    initials: "GP", color: "linear-gradient(135deg,#10a37f,#1a7f64)", tag: "Hot",
    variants: [
      { name: "No Garansi", price: 35000 },
      { name: "Full Garansi", price: 60000 },
    ],
  },
  {
    id: "grok", name: "Super Grok", cat: "AI Tools", group: "ai",
    initials: "GK", color: "linear-gradient(135deg,#4b4b4b,#0a0a0a)", tag: "New",
    variants: [
      { name: "3 Hari", price: 5000 },
      { name: "30 Hari", price: 160000 },
    ],
  },
  {
    id: "gemini", name: "Gemini AI Pro", cat: "AI Tools", group: "ai",
    initials: "GM", color: "linear-gradient(135deg,#4285f4,#9b72f9)", tag: "Promo",
    variants: [
      { name: "3 Bulan", price: 40000 },
      { name: "12 Bulan", price: 75000 },
    ],
  },
  {
    id: "canva", name: "Canva Pro", cat: "Editing", group: "editing",
    initials: "CV", color: "linear-gradient(135deg,#7d2ae8,#00c4cc)", tag: "Populer",
    variants: [
      { name: "1 Bulan Invite", price: 3000 },
      { name: "1 Bulan Individual", price: 10000 },
      { name: "1 Bulan Owner", price: null }, // harga belum ditentukan
    ],
  },
];

/* ===================== HELPERS ===================== */
const rupiah = (n) => (n == null ? "Chat Admin" : "Rp " + n.toLocaleString("id-ID"));
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

/* track selected variant per product */
const selected = {};
PRODUCTS.forEach((p) => (selected[p.id] = 0));

/* ===================== RENDER PRODUCTS ===================== */
const grid = $("#productGrid");

function cardHTML(p) {
  const sel = selected[p.id];
  const cur = p.variants[sel];
  const variantBtns = p.variants
    .map(
      (v, i) => `
      <button class="variant ${i === sel ? "active" : ""}" data-pid="${p.id}" data-vi="${i}">
        <span class="v-name">${v.name}</span>
        <span class="v-price">${rupiah(v.price)}</span>
      </button>`
    )
    .join("");

  return `
  <article class="card" data-group="${p.group}" data-name="${p.name.toLowerCase()}">
    <div class="card-top">
      <div class="card-logo">${p.initials}</div>
      <div>
        <div class="card-title">${p.name}</div>
        <div class="card-cat">${p.cat}</div>
      </div>
      <span class="card-tag">${p.tag}</span>
    </div>

    <div class="variants">
      <span class="variants-label">Pilih Variasi</span>
      <div class="variant-opts">${variantBtns}</div>
    </div>

    <div class="card-foot">
      <div class="price-now">
        <span>Harga</span>
        <strong data-price="${p.id}">${rupiah(cur.price)}</strong>
      </div>
      <button class="btn btn-primary btn-sm" data-add="${p.id}">
        <i data-lucide="plus"></i> Keranjang
      </button>
    </div>
  </article>`;
}

function renderProducts() {
  grid.innerHTML = PRODUCTS.map(cardHTML).join("");
  lucide.createIcons();
  revealCards();
}

/* ===================== VARIANT SELECT + ADD ===================== */
grid.addEventListener("click", (e) => {
  const vbtn = e.target.closest(".variant");
  if (vbtn) {
    const pid = vbtn.dataset.pid;
    selected[pid] = +vbtn.dataset.vi;
    const card = vbtn.closest(".card");
    $$(".variant", card).forEach((b) => b.classList.remove("active"));
    vbtn.classList.add("active");
    const p = PRODUCTS.find((x) => x.id === pid);
    $(`[data-price="${pid}"]`).textContent = rupiah(p.variants[selected[pid]].price);
    return;
  }
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    const pid = addBtn.dataset.add;
    addToCart(pid, selected[pid]);
  }
});

/* ===================== CART ===================== */
let cart = [];
const cartItemsEl = $("#cartItems");
const cartCountEl = $("#cartCount");
const cartTotalEl = $("#cartTotal");

function addToCart(pid, vi) {
  const p = PRODUCTS.find((x) => x.id === pid);
  const v = p.variants[vi];
  if (v.price == null) {
    showToast("Variasi ini hubungi admin dulu 🙏", false);
    return;
  }
  const key = pid + "-" + vi;
  const existing = cart.find((c) => c.key === key);
  if (existing) existing.qty++;
  else cart.push({ key, pid, name: p.name, variant: v.name, price: v.price, initials: p.initials, color: p.color, qty: 1 });
  renderCart();
  showToast(`${p.name} (${v.name}) ditambahkan`, true);
}

function removeFromCart(key) {
  cart = cart.filter((c) => c.key !== key);
  renderCart();
}

function renderCart() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  cartCountEl.textContent = count;
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  cartTotalEl.textContent = rupiah(total);

  if (!cart.length) {
    cartItemsEl.innerHTML = `<div class="cart-empty"><i data-lucide="shopping-cart"></i><p>Keranjang masih kosong</p></div>`;
    lucide.createIcons();
    return;
  }
  cartItemsEl.innerHTML = cart
    .map(
      (c) => `
    <div class="cart-item">
      <div class="ci-logo">${c.initials}</div>
      <div class="ci-info">
        <strong>${c.name}</strong>
        <span>${c.variant} × ${c.qty}</span>
      </div>
      <div class="ci-price">${rupiah(c.price * c.qty)}</div>
      <button class="ci-remove" data-remove="${c.key}"><i data-lucide="trash-2"></i></button>
    </div>`
    )
    .join("");
  lucide.createIcons();
}

cartItemsEl.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-remove]");
  if (rm) removeFromCart(rm.dataset.remove);
});

/* drawer open/close */
const drawer = $("#cartDrawer");
const overlay = $("#overlay");
const openCart = () => { drawer.classList.add("open"); overlay.classList.add("open"); };
const closeCart = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); };
$("#cartBtn").addEventListener("click", openCart);
$("#cartClose").addEventListener("click", closeCart);
overlay.addEventListener("click", () => { closeCart(); closeSidebar(); });
$("#checkoutBtn").addEventListener("click", () => {
  if (!cart.length) return showToast("Keranjang masih kosong", false);
  showToast("Mengarahkan ke pembayaran… 🚀", true);
});

/* ===================== SEARCH + FILTER ===================== */
$("#searchInput").addEventListener("input", (e) => applyFilters(e.target.value));
let activeFilter = "all";
$("#filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  $$(".chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  activeFilter = chip.dataset.filter;
  applyFilters($("#searchInput").value);
});
function applyFilters(q = "") {
  q = q.trim().toLowerCase();
  $$(".card").forEach((card) => {
    const matchQ = card.dataset.name.includes(q);
    const matchF = activeFilter === "all" || card.dataset.group === activeFilter;
    card.style.display = matchQ && matchF ? "" : "none";
  });
}

/* ===================== SIDEBAR (mobile) ===================== */
const sidebar = $("#sidebar");
const closeSidebar = () => sidebar.classList.remove("open");
$("#menuToggle").addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.add("open");
});

/* ===================== TOAST ===================== */
const toastEl = $("#toast");
let toastT;
function showToast(msg, ok = true) {
  toastEl.innerHTML = `<i data-lucide="${ok ? "check-circle-2" : "info"}"></i> ${msg}`;
  lucide.createIcons();
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

/* ===================== SCROLL REVEAL ===================== */
function revealCards() {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }),
    { threshold: 0.1 }
  );
  $$(".card").forEach((c, i) => { c.style.transitionDelay = (i % 3) * 60 + "ms"; io.observe(c); });
}

/* ===================== INIT ===================== */
renderProducts();
renderCart();
lucide.createIcons();
