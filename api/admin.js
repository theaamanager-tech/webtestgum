// POST /api/admin   { action, ...payload }   header: x-admin-key
// One key-gated endpoint for ALL admin operations (service role).
import { admin, getConfig, readJson, cors } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // --- auth gate ---
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY) return res.status(500).json({ error: "ADMIN_KEY belum diset di server" });
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

  const body = await readJson(req);
  const { action } = body;

  try {
    switch (action) {
      case "login":
        return res.json({ ok: true });

      /* ---------- catalog (with stock counts) ---------- */
      case "catalog": {
        const [productsRes, variantsRes, stockRes] = await Promise.all([
          admin.from("products").select("*").order("sort_order", { ascending: true }),
          admin.from("variants").select("*").order("sort_order", { ascending: true }),
          admin.from("stock_items").select("id, variant_id, status, payload, created_at"),
        ]);
        if (productsRes.error) throw productsRes.error;
        if (variantsRes.error) throw variantsRes.error;
        if (stockRes.error) throw stockRes.error;

        const stockMap = {};
        (stockRes.data || []).forEach((s) => {
          const key = s.variant_id;
          if (!stockMap[key]) stockMap[key] = { total: 0, available: 0, sold: 0, rows: [] };
          stockMap[key].total += 1;
          stockMap[key].rows.push(s);
          if (s.status === "sold") stockMap[key].sold += 1;
          else stockMap[key].available += 1;
        });

        const out = (productsRes.data || []).map((product) => ({
          ...product,
          variants: (variantsRes.data || [])
            .filter((variant) => variant.product_id === product.id)
            .map((variant) => ({
              ...variant,
              available: stockMap[variant.id]?.available ?? 0,
              sold: stockMap[variant.id]?.sold ?? 0,
              stock_total: stockMap[variant.id]?.total ?? 0,
            })),
        }));
        return res.json({ products: out, synced_at: new Date().toISOString() });
      }

      /* ---------- products ---------- */
      case "save_product": {
        const { product } = body;
        const { error } = await admin.from("products").upsert({ ...product, updated_at: new Date().toISOString() });
        if (error) throw error; return res.json({ ok: true });
      }
      case "delete_product": {
        const { error } = await admin.from("products").delete().eq("id", body.id);
        if (error) throw error; return res.json({ ok: true });
      }

      /* ---------- variants ---------- */
      case "save_variant": {
        const { data, error } = await admin.from("variants").upsert(body.variant).select().single();
        if (error) throw error; return res.json({ variant: data });
      }
      case "delete_variant": {
        const { error } = await admin.from("variants").delete().eq("id", body.id);
        if (error) throw error; return res.json({ ok: true });
      }

      /* ---------- stock ---------- */
      case "list_stock": {
        const { data, error } = await admin.from("stock_items")
          .select("*").eq("variant_id", body.variant_id).order("created_at");
        if (error) throw error; return res.json({ stock: data });
      }
      case "add_stock": {
        const rows = (body.payloads || []).map((payload) => ({ variant_id: body.variant_id, payload, status: "available" }));
        const { error } = await admin.from("stock_items").insert(rows);
        if (error) throw error; return res.json({ added: rows.length });
      }
      case "delete_stock": {
        const { error } = await admin.from("stock_items").delete().eq("id", body.id).neq("status", "sold");
        if (error) throw error; return res.json({ ok: true });
      }

      /* ---------- variant SNK ---------- */
      case "save_snk": {
        const { error } = await admin.from("variants").update({ snk: body.snk }).eq("id", body.variant_id);
        if (error) throw error;
        return res.json({ ok: true });
      }

      /* ---------- coupons ---------- */
      case "list_coupons": {
        const { data, error } = await admin.from("coupons").select("*").order("created_at", { ascending: false });
        if (error) throw error; return res.json({ coupons: data });
      }
      case "save_coupon": {
        const c = body.coupon;
        const { error } = await admin.from("coupons").upsert({ ...c, code: c.code.toUpperCase() }, { onConflict: "code" });
        if (error) throw error; return res.json({ ok: true });
      }
      case "delete_coupon": {
        const { error } = await admin.from("coupons").delete().eq("id", body.id);
        if (error) throw error; return res.json({ ok: true });
      }

      /* ---------- pakasir config ---------- */
      case "get_config": {
        const cfg = await getConfig();
        // never expose full api key to the browser
        return res.json({ config: {
          pakasir_project: cfg.pakasir_project, pakasir_mode: cfg.pakasir_mode,
          webhook_url: cfg.webhook_url,
          api_key_set: !!cfg.pakasir_api_key,
          api_key_preview: cfg.pakasir_api_key ? cfg.pakasir_api_key.slice(0, 4) + "••••" : "",
        }});
      }
      case "save_config": {
        const patch = { updated_at: new Date().toISOString() };
        if (body.pakasir_project !== undefined) patch.pakasir_project = body.pakasir_project;
        if (body.pakasir_mode !== undefined) patch.pakasir_mode = body.pakasir_mode;
        if (body.webhook_url !== undefined) patch.webhook_url = body.webhook_url;
        if (body.pakasir_api_key) patch.pakasir_api_key = body.pakasir_api_key; // only overwrite if provided
        const { error } = await admin.from("app_config").update(patch).eq("id", 1);
        if (error) throw error; return res.json({ ok: true });
      }

      /* ---------- financial insights / reports ---------- */
      case "insights": {
        const { data: orders } = await admin.from("orders").select("*").eq("status", "paid");
        const paid = orders || [];
        const revenue = paid.reduce((a, o) => a + (o.amount || 0), 0);
        const byProduct = {};
        paid.forEach((o) => {
          const k = `${o.product_name} — ${o.variant_name}`;
          if (!byProduct[k]) byProduct[k] = { label: k, qty: 0, revenue: 0 };
          byProduct[k].qty += 1; byProduct[k].revenue += o.amount || 0;
        });
        const top = Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 5);
        const { count: prodCount } = await admin.from("products").select("*", { count: "exact", head: true });
        const { count: availableCount, error: stockError } = await admin
          .from("stock_items")
          .select("id", { count: "exact", head: true })
          .neq("status", "sold");
        if (stockError) throw stockError;
        const available = availableCount ?? 0;
        return res.json({ insights: {
          revenue, orders: paid.length, prodCount: prodCount ?? 0, available, top,
        }});
      }

      default:
        return res.status(400).json({ error: "Unknown action: " + action });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
