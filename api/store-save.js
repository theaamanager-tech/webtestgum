// POST /api/store-save  — Save store settings (password in body)
import { admin, cors, readJson } from "../lib/supabaseAdmin.js";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = await readJson(req);

  // Auth via password
  const pw = String(body.password || "");
  if (!pw || pw !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

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
