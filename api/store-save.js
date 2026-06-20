// POST /api/store-save  — Save store settings (admin key required)
import { admin, cors, readJson } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY) return res.status(500).json({ error: "ADMIN_KEY belum diset di server" });
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

  const body = await readJson(req);
  const allowed = ["store_name", "store_tagline", "store_hero_title", "store_hero_subtitle", "store_footer_text"];
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
