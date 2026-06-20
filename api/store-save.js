// POST /api/store-save  — Save store settings (admin token required)
import { admin, cors, readJson } from "../lib/supabaseAdmin.js";
import crypto from "crypto";

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const PEPPER = process.env.ADMIN_PEPPER || "verdent-admin-secret-2024";

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

  // Auth via token
  const token = req.headers["x-admin-token"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const session = verifyToken(token);
  if (!session || session.key !== ADMIN_KEY) return res.status(401).json({ error: "Session tidak valid" });

  const body = await readJson(req);
  const allowed = ["store_name", "store_tagline", "store_hero_title", "store_hero_subtitle", "store_footer_text", "bantuan_faq", "annon_active", "annon_text", "annon_badge_text", "soc_wa_active", "soc_wa_number", "soc_tele_active", "soc_tele_channel", "soc_tele_channel_active", "soc_tele_bot", "soc_tele_bot_active", "soc_x_active", "soc_x_link", "soc_ig_active", "soc_ig_link"];
  const patch = { updated_at: new Date().toISOString() };

  for (const field of allowed) {
    if (body[field] !== undefined) patch[field] = body[field];
  }

  try {
    const { error } = await admin.from("app_config").update(patch).eq("id", 1);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Gagal menyimpan" });
  }
}
