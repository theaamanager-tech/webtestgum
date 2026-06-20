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
      hero_title: data.store_hero_title || 'Beli sekali klik, akun langsung jadi.',
      hero_subtitle: data.store_hero_subtitle || 'Pilih produk, bayar via QRIS, akun langsung terkirim otomatis.',
      footer_text: data.store_footer_text || "© Novaciy° · Semua transaksi via QRIS aman.",
      bantuan_contact: data.bantuan_contact || '',
      bantuan_faq: data.bantuan_faq || '',
      annon: {
        active: !!data.annon_active,
        text: data.annon_text || "New feature is ready to use, let's try",
        badge_text: data.annon_badge_text || "Promo",
        badge_bg: '#28C39D',
        badge_text_color: '#0D0E10',
        bg: 'rgba(40,195,157,0.12)',
        text_color: '#CFEEE6',
      },
      soc: {
        wa_active: !!data.soc_wa_active,
        wa_number: data.soc_wa_number || '',
        tele_active: !!data.soc_tele_active,
        tele_channel: data.soc_tele_channel || '',
        tele_channel_active: !!data.soc_tele_channel_active,
        tele_bot: data.soc_tele_bot || '',
        tele_bot_active: !!data.soc_tele_bot_active,
        x_active: !!data.soc_x_active,
        x_link: data.soc_x_link || '',
        ig_active: !!data.soc_ig_active,
        ig_link: data.soc_ig_link || '',
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Gagal memuat konfigurasi toko" });
  }
}
