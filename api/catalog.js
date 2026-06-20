// GET /api/catalog
// Public storefront catalog served from the backend so the front dashboard
// stays in sync with admin data and does not depend on browser-side RLS/view issues.
import { admin, cors } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const [productsRes, variantsRes, stockRes] = await Promise.all([
      admin.from("products").select("*").eq("active", true).order("sort_order", { ascending: true }),
      admin.from("variants").select("*").eq("active", true).order("sort_order", { ascending: true }),
      admin.from("stock_items").select("variant_id, status"),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (variantsRes.error) throw variantsRes.error;
    if (stockRes.error) throw stockRes.error;

    const stockMap = {};
    (stockRes.data || []).forEach((item) => {
      if (item.status !== "sold") stockMap[item.variant_id] = (stockMap[item.variant_id] || 0) + 1;
    });

    const products = (productsRes.data || []).map((product) => ({
      ...product,
      variants: (variantsRes.data || [])
        .filter((variant) => variant.product_id === product.id)
        .map((variant) => ({ ...variant, available: stockMap[variant.id] || 0 })),
    }));

    return res.json({ products, synced_at: new Date().toISOString() });
  } catch (error) {
    console.error("[catalog]", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
