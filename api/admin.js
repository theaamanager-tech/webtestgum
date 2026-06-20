// POST /api/admin   { action, ...payload }   header: x-admin-token
// One key-gated endpoint for ALL admin operations (service role).
// Security:
//   - Login: verifikasi password, return HMAC session token (24h)
//   - Semua action lain: validasi token, bukan password mentah
//   - Rate limit: 5 gagal → block 15 menit per IP
import crypto from "crypto";
import { admin, getConfig, readJson, cors } from "../lib/supabaseAdmin.js";

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const PEPPER = process.env.ADMIN_PEPPER || "verdent-admin-secret-2024";

// Rate limiter in-memory
const failMap = {};
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = failMap[ip];
  if (entry) {
    if (entry.count >= 5 && now - entry.last < 15 * 60 * 1000) return false;
    if (now - entry.last > 15 * 60 * 1000) delete failMap[ip];
  }
  return true;
}
function recordFail(ip) {
  if (!failMap[ip]) failMap[ip] = { count: 0, last: Date.now() };
  failMap[ip].count += 1;
  failMap[ip].last = Date.now();
}

// Session token: base64url(JSON{key,exp,nonce}.HMAC)
function signToken(key) {
  const payload = { key, exp: Date.now() + 24 * 60 * 60 * 1000, nonce: crypto.randomUUID() };
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", PEPPER).update(data).digest("hex");
  return Buffer.from(data + "." + sig).toString("base64url");
}
function verifyToken(token) {
  try {
    const raw = Buffer.from(token, "base64url").toString();
    const dot = raw.lastIndexOf(".");
    if (dot === -1) return null;
    const data = raw.slice(0, dot), sig = raw.slice(dot + 1);
    const exp = crypto.createHmac("sha256", PEPPER).update(data).digest("hex");
    if (sig !== exp) return null;
    const p = JSON.parse(data);
    if (p.exp < Date.now() || !p.key) return null;
    return p;
  } catch { return null; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = await readJson(req);
  const { action } = body;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";

  try {
    // === LOGIN (tanpa token) ===
    if (action === "login") {
      if (!ADMIN_KEY) return res.status(500).json({ error: "ADMIN_KEY belum diset di Vercel" });
      if (!checkRateLimit(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba 15 menit lagi." });

      const { password } = body;
      if (!password) return res.status(400).json({ error: "Password wajib" });

      // Timing-safe compare
      const pk = String(password);
      if (pk.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(pk), Buffer.from(ADMIN_KEY))) {
        delete failMap[ip];
        return res.json({ ok: true, token: signToken(ADMIN_KEY) });
      }

      recordFail(ip);
      return res.status(401).json({ error: "Password salah" });
    }

    // === SEMUA ACTION LAIN: validasi session token ===
    const token = req.headers["x-admin-token"];
    if (!token) return res.status(401).json({ error: "Belum login. Kirim x-admin-token." });

    const session = verifyToken(token);
    if (!session || session.key !== ADMIN_KEY) return res.status(401).json({ error: "Session tidak valid. Login ulang." });

    switch (action) {
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
        return res.json({ config: {
          pakasir_project: cfg.pakasir_project, pakasir_mode: cfg.pakasir_mode,
          webhook_url: cfg.webhook_url,
          api_key_set: !!cfg.pakasir_api_key,
          api_key_preview: cfg.pakasir_api_key ? cfg.pakasir_api_key.slice(0, 4) + "••••" : "",
          telegram_bot_token: cfg.telegram_bot_token || '',
          telegram_chat_id: cfg.telegram_chat_id || '',
        }});
      }
      case "save_config": {
        const patch = { updated_at: new Date().toISOString() };
        if (body.pakasir_project !== undefined) patch.pakasir_project = body.pakasir_project;
        if (body.pakasir_mode !== undefined) patch.pakasir_mode = body.pakasir_mode;
        if (body.webhook_url !== undefined) patch.webhook_url = body.webhook_url;
        if (body.pakasir_api_key) patch.pakasir_api_key = body.pakasir_api_key;
        if (body.telegram_bot_token !== undefined) patch.telegram_bot_token = body.telegram_bot_token;
        if (body.telegram_chat_id !== undefined) patch.telegram_chat_id = body.telegram_chat_id;
        const { error } = await admin.from("app_config").update(patch).eq("id", 1);
        if (error) throw error; return res.json({ ok: true });
      }

      /* ---------- insights ---------- */
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
          .from("stock_items").select("id", { count: "exact", head: true }).neq("status", "sold");
        if (stockError) throw stockError;
        return res.json({ insights: {
          revenue, orders: paid.length, prodCount: prodCount ?? 0, available: availableCount ?? 0, top,
        }});
      }

      /* ---------- rekap penjualan ---------- */
      case "list_orders": {
        const { start_date, end_date } = body;
        let query = admin.from("orders").select("*").order("created_at", { ascending: false });
        if (start_date) query = query.gte("created_at", start_date);
        if (end_date) query = query.lte("created_at", end_date + "T23:59:59Z");
        const { data, error } = await query;
        if (error) throw error;
        const orders = (data || []).map((o) => ({ ...o }));
        const lunas = orders.filter((o) => o.status === "paid");
        const revenue = lunas.reduce((a, o) => a + (o.amount || 0), 0);
        return res.json({ orders, summary: {
          total_orders: orders.length, paid_orders: lunas.length,
          revenue, avg_order: lunas.length ? Math.round(revenue / lunas.length) : 0,
        }});
      }

      /* ---------- upload image ---------- */
      case "upload_image": {
        const { product_id, file_data, url, filename } = body;
        if (!product_id) return res.status(400).json({ error: "product_id required" });

        let buffer, contentType, ext;

        if (url) {
          try { new URL(url); } catch { return res.status(400).json({ error: "URL tidak valid" }); }
          const imgRes = await fetch(url);
          if (!imgRes.ok) return res.status(400).json({ error: "Gagal download gambar dari URL" });
          buffer = Buffer.from(await imgRes.arrayBuffer());
          contentType = imgRes.headers.get("content-type") || "image/jpeg";
          ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
        } else if (file_data) {
          const raw = file_data.replace(/^data:image\/\w+;base64,/, "");
          buffer = Buffer.from(raw, "base64");
          contentType = file_data.startsWith("data:") ? file_data.split(";")[0].split(":")[1] : "image/jpeg";
          ext = (filename || "image.jpg").split(".").pop()?.toLowerCase() || "jpg";
          if (buffer.length > 3 * 1024 * 1024) return res.status(400).json({ error: "Maks 3MB" });
        } else {
          return res.status(400).json({ error: "Kirim file_data (base64) atau url" });
        }

        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
        if (!allowed.includes(contentType)) return res.status(400).json({ error: "Tipe harus JPG/PNG/WEBP/GIF/AVIF" });
        if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Maks 5MB" });

        const fileName = `${product_id}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await admin.storage.from("product-images").upload(fileName, buffer, { contentType, upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = admin.storage.from("product-images").getPublicUrl(fileName);
        const { error: updateErr } = await admin.from("products").update({ image_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", product_id);
        if (updateErr) throw updateErr;
        return res.json({ image_url: publicUrl, ok: true });
      }

      default:
        return res.status(400).json({ error: "Unknown action: " + action });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
