/* ===================== DATA (demo — sumber data bersama menyusul) ===================== */
let PRODUCTS = [
  { id:"capcut",  name:"CapCut Pro",   cat:"editing", initials:"CC", tag:"Best Seller", variants:[{name:"7 Hari",price:15000},{name:"30 Hari",price:35000}] },
  { id:"paypal",  name:"PayPal Fresh", cat:"account", initials:"PP", tag:"Ready",       variants:[{name:"Domain",price:3000},{name:"Gmail",price:5000}] },
  { id:"chatgpt", name:"ChatGPT Plus", cat:"ai",      initials:"GP", tag:"Hot",         variants:[{name:"No Garansi",price:35000},{name:"Full Garansi",price:60000}] },
  { id:"grok",    name:"Super Grok",   cat:"ai",      initials:"GK", tag:"New",         variants:[{name:"3 Hari",price:5000},{name:"30 Hari",price:160000}] },
  { id:"gemini",  name:"Gemini AI Pro",cat:"ai",      initials:"GM", tag:"Promo",       variants:[{name:"3 Bulan",price:40000},{name:"12 Bulan",price:75000}] },
  { id:"canva",   name:"Canva Pro",    cat:"editing", initials:"CV", tag:"Populer",     variants:[{name:"1 Bulan Invite",price:3000},{name:"1 Bulan Individual",price:10000},{name:"1 Bulan Owner",price:null}] },
];
const CAT_LABEL = { ai:"AI Tools", editing:"Editing", account:"Akun" };

/* ===================== HELPERS ===================== */
const $ = (s,c=document)=>c.querySelector(s);
const $$ = (s,c=document)=>[...c.querySelectorAll(s)];
const rupiah = n => n==null ? "—" : "Rp "+n.toLocaleString("id-ID");
function priceRange(p){
  const prices = p.variants.map(v=>v.price).filter(v=>v!=null);
  if(!prices.length) return "Chat Admin";
  const lo=Math.min(...prices), hi=Math.max(...prices);
  return lo===hi ? rupiah(lo) : rupiah(lo)+" – "+rupiah(hi);
}

/* ===================== TAB SWITCHING ===================== */
const TITLES = {overview:"Ringkasan",products:"Produk",texts:"Teks Store",orders:"Pesanan",settings:"Pengaturan"};
$$(".nav-item").forEach(btn=>{
  btn.addEventListener("click",()=>{
    $$(".nav-item").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.dataset.panel;
    $$(".panel").forEach(p=>p.classList.remove("active"));
    $("#panel-"+panel).classList.add("active");
    $("#panelTitle").textContent = TITLES[panel];
    closeSidebar();
  });
});

/* ===================== PRODUCT TABLE ===================== */
const tbody = $("#productTable");
function rowHTML(p){
  return `<tr data-id="${p.id}">
    <td><div class="t-prod"><div class="t-logo">${p.initials}</div><span class="t-name">${p.name}</span></div></td>
    <td>${CAT_LABEL[p.cat]||p.cat}</td>
    <td>${p.variants.length} variasi</td>
    <td>${priceRange(p)}</td>
    <td><span class="badge ok">${p.tag||"Aktif"}</span></td>
    <td><div class="row-actions">
      <button class="act-btn" data-edit="${p.id}" title="Edit"><i data-lucide="pencil"></i></button>
      <button class="act-btn danger" data-del="${p.id}" title="Hapus"><i data-lucide="trash-2"></i></button>
    </div></td>
  </tr>`;
}
function renderTable(filter=""){
  filter=filter.trim().toLowerCase();
  const rows = PRODUCTS.filter(p=>p.name.toLowerCase().includes(filter)).map(rowHTML).join("");
  tbody.innerHTML = rows || `<tr><td colspan="6" style="text-align:center;color:var(--text-mute);padding:40px">Tidak ada produk</td></tr>`;
  lucide.createIcons();
}
$("#prodSearch").addEventListener("input",e=>renderTable(e.target.value));

/* ===================== MODAL (ADD / EDIT) ===================== */
const modal=$("#productModal"), overlay=$("#overlay");
let editingId=null;
function openModal(){modal.classList.add("open");overlay.classList.add("open");}
function closeModal(){modal.classList.remove("open");overlay.classList.remove("open");}
function variantRowHTML(name="",price=""){
  return `<div class="variant-row">
    <input type="text" class="vr-name" placeholder="Nama variasi" value="${name}" />
    <input type="number" class="vr-price" placeholder="Harga" value="${price}" />
    <button class="vr-remove" title="Hapus"><i data-lucide="x"></i></button>
  </div>`;
}
function addVariantRow(name,price){
  $("#variantRows").insertAdjacentHTML("beforeend",variantRowHTML(name,price));
  lucide.createIcons();
}
$("#variantRows").addEventListener("click",e=>{
  const rm=e.target.closest(".vr-remove"); if(rm) rm.closest(".variant-row").remove();
});
$("#addVariantBtn").addEventListener("click",()=>addVariantRow());

function fillModal(p){
  $("#fName").value=p?p.name:"";
  $("#fCat").value=p?p.cat:"ai";
  $("#fInitials").value=p?p.initials:"";
  $("#fTag").value=p?p.tag:"";
  $("#variantRows").innerHTML="";
  if(p) p.variants.forEach(v=>addVariantRow(v.name, v.price==null?"":v.price));
  else { addVariantRow(); addVariantRow(); }
}
$("#addProductBtn").addEventListener("click",()=>{editingId=null;$("#modalTitle").textContent="Tambah Produk";fillModal(null);openModal();});
tbody.addEventListener("click",e=>{
  const ed=e.target.closest("[data-edit]"), dl=e.target.closest("[data-del]");
  if(ed){editingId=ed.dataset.edit;const p=PRODUCTS.find(x=>x.id===editingId);$("#modalTitle").textContent="Edit Produk";fillModal(p);openModal();}
  if(dl){const p=PRODUCTS.find(x=>x.id===dl.dataset.del);if(confirm(`Hapus "${p.name}"?`)){PRODUCTS=PRODUCTS.filter(x=>x.id!==dl.dataset.del);renderTable($("#prodSearch").value);toast("Produk dihapus");}}
});
$("#modalClose").addEventListener("click",closeModal);
$("#modalCancel").addEventListener("click",closeModal);
$("#modalSave").addEventListener("click",()=>{
  const name=$("#fName").value.trim();
  if(!name) return toast("Nama produk wajib diisi");
  const variants=$$(".variant-row").map(r=>{
    const vn=$(".vr-name",r).value.trim();
    const vp=$(".vr-price",r).value;
    return vn?{name:vn,price:vp===""?null:Number(vp)}:null;
  }).filter(Boolean);
  if(!variants.length) return toast("Tambahkan minimal 1 variasi");
  const data={name,cat:$("#fCat").value,initials:($("#fInitials").value||name.slice(0,2)).toUpperCase(),tag:$("#fTag").value.trim(),variants};
  if(editingId){Object.assign(PRODUCTS.find(x=>x.id===editingId),data);toast("Produk diperbarui");}
  else{data.id="p"+Date.now();PRODUCTS.push(data);toast("Produk ditambahkan");}
  renderTable($("#prodSearch").value);
  closeModal();
});

/* ===================== SAVE / SIDEBAR / TOAST ===================== */
$("#saveBtn").addEventListener("click",()=>toast("Perubahan disimpan (demo)"));
const sidebar=$("#sidebar");
const closeSidebar=()=>sidebar.classList.remove("open");
$("#menuToggle").addEventListener("click",()=>{sidebar.classList.add("open");overlay.classList.add("open");});
overlay.addEventListener("click",()=>{closeModal();closeSidebar();});

const toastEl=$("#toast");let tT;
function toast(msg){toastEl.innerHTML=`<i data-lucide="check-circle-2"></i> ${msg}`;lucide.createIcons();toastEl.classList.add("show");clearTimeout(tT);tT=setTimeout(()=>toastEl.classList.remove("show"),2400);}

/* ===================== INIT ===================== */
renderTable();
lucide.createIcons();
