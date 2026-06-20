// GET /api/store-config  — Public store settings (no auth needed)
import { admin, cors } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { data, error } = await admin.from("app_config").select("*").eq("id", 1).single();
    if (error) throw error;
    return res.json({
      name: data.store_name || "Novaciy°",
      tagline: data.store_tagline || "Produk Digital Premium",
      hero_title: data.store_hero_title || 'Beli sekali klik,<br><em class="italic text-jadebright">akun langsung jadi.</em>',
      hero_subtitle: data.store_hero_subtitle || 'Pilih variasi, klik <strong class="text-white">Beli</strong>, scan QRIS, dan akun otomatis terkirim sebagai file begitu pembayaran sukses.',
      footer_text: data.store_footer_text || "© Novaciy° · Semua transaksi via QRIS aman.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Gagal memuat konfigurasi toko" });
  }
}
