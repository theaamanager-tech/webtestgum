/* =====================================================================
 *  NOVACIY° — Public client config (anon key only).
 *  The anon key can read ONLY the catalog + stock counts (RLS enforced).
 *  All money/secret operations go through /api/* serverless functions.
 * ===================================================================== */
const SUPABASE_URL = "https://wfaeesuxuqftmlyeizan.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmYWVlc3V4dXFmdG1seWVpemFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDk5ODksImV4cCI6MjA5NzQ4NTk4OX0.O-PSeIzbUrz7aWe8G0NSq45CIVDeXzdBzScsk64pfMM";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CAT_LABEL = { ai: "AI Tools", editing: "Editing", account: "Akun" };

const rupiah = (n) => (n == null ? "—" : "Rp " + Number(n).toLocaleString("id-ID"));
function priceRange(variants) {
  const prices = variants.map((v) => v.price).filter((v) => v != null);
  if (!prices.length) return "Chat Admin";
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? rupiah(lo) : rupiah(lo) + " – " + rupiah(hi);
}

// Public catalog loader (anon).
async function loadPublicCatalog() {
  const { data: products, error: pErr } = await sb
    .from("products").select("*").eq("active", true).order("sort_order");
  if (pErr) throw pErr;
  const { data: variants } = await sb
    .from("variants").select("*").eq("active", true).order("sort_order");
  const { data: stock } = await sb.from("variant_stock").select("*");
  const map = {}; (stock || []).forEach((s) => (map[s.variant_id] = s.available));
  return (products || []).map((p) => ({
    ...p,
    variants: (variants || []).filter((v) => v.product_id === p.id)
      .map((v) => ({ ...v, available: map[v.id] ?? 0 })),
  }));
}

window.NOVA = { sb, CAT_LABEL, rupiah, priceRange, loadPublicCatalog };
