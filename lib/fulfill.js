// Shared, idempotent fulfillment: claim N stock units (1 per quantity),
// build the .txt payload, mark the order paid.
// Safe to call multiple times (webhook + poll race).
import { admin } from "./supabaseAdmin.js";

export function buildDeliveryText(order, payloads) {
  const now = new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
  const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
  const L = [];
  L.push("============================================");
  L.push("        NOVACIY° — DETAIL PESANAN");
  L.push("============================================");
  L.push(`Order ID : ${order.order_id}`);
  L.push(`Tanggal  : ${now}`);
  L.push(`Produk   : ${order.product_name} — ${order.variant_name}`);
  L.push(`Jumlah   : ${order.quantity || 1} unit`);
  if (order.discount > 0) {
    L.push(`Harga    : ${rupiah(order.unit_price)} × ${order.quantity || 1}`);
    L.push(`Diskon   : -${rupiah(order.discount)}${order.coupon_code ? " (" + order.coupon_code + ")" : ""}`);
  }
  L.push(`Total    : ${rupiah(order.amount)}`);
  L.push("============================================\n");
  L.push("AKUN / DETAIL:");
  payloads.forEach((p, i) => L.push(`  ${i + 1}. ${p}`));
  L.push("\nSYARAT & KETENTUAN (SNK):");
  L.push(`  ${order.snk || "-"}`);
  L.push("\n============================================");
  L.push("Simpan file ini baik-baik. Terima kasih!");
  L.push("Butuh bantuan? Hubungi admin Novaciy°.");
  L.push("============================================");
  return L.join("\n");
}

// Returns the order row (with delivery_text) once paid+fulfilled, or null if not paid.
export async function fulfillOrder(orderId) {
  const { data: order, error } = await admin
    .from("orders").select("*, variants(snk)").eq("order_id", orderId).single();
  if (error || !order) return null;

  // already delivered → idempotent return
  if (order.status === "paid" && order.delivery_text) return order;

  const qty = Math.max(1, order.quantity || 1);

  // claim N stock units atomically (loop claim_stock RPC)
  const payloads = [];
  for (let i = 0; i < qty; i++) {
    const { data: payload, error: claimErr } = await admin
      .rpc("claim_stock", { p_variant: order.variant_id, p_order: order.order_id });
    if (claimErr) throw claimErr;
    if (!payload) {
      // partial fulfillment — what we got so far is already claimed
      if (i > 0) break; // deliver what we have
      await admin.from("orders").update({ status: "failed" }).eq("order_id", orderId);
      throw new Error(`Stok habis saat fulfillment: butuh ${qty}, hanya dapat ${i}`);
    }
    payloads.push(payload);
  }

  const enriched = { ...order, snk: order.variants?.snk || "" };
  const text = buildDeliveryText(enriched, payloads);

  const { data: updated } = await admin.from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), delivery_text: text })
    .eq("order_id", orderId).select("*").single();

  // bump coupon usage
  if (order.coupon_code) {
    const { data: c } = await admin.from("coupons").select("used_count").eq("code", order.coupon_code).single();
    if (c) await admin.from("coupons").update({ used_count: (c.used_count || 0) + 1 }).eq("code", order.coupon_code);
  }

  // Kirim notifikasi Telegram setelah fulfill sukses
  await sendTelegramNotification(updated || { ...enriched, status: "paid", delivery_text: text, quantity: qty });

  return updated || { ...enriched, status: "paid", delivery_text: text };
}

// Notifikasi Telegram ke admin
async function sendTelegramNotification(order) {
  try {
    const { data: cfg, error } = await admin
      .from("app_config").select("telegram_bot_token, telegram_chat_id").eq("id", 1).single();
    if (error || !cfg) return; // not configured
    const token = cfg.telegram_bot_token;
    const chatId = cfg.telegram_chat_id;
    if (!token || !chatId) return;

    const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
    const qty = order.quantity || 1;

    const msg = `🛒 <b>PESANAN BARU</b>
━━━━━━━━━━━━━
📦 ${order.product_name || '—'} — ${order.variant_name || '—'}
🔢 Jumlah: ${qty} unit
💰 Total: ${rupiah(order.amount)}
🆔 Order: ${order.order_id || '—'}
📧 Email: ${order.buyer_contact || '—'}
📝 Catatan: ${order.buyer_note || '—'}
━━━━━━━━━━━━━
✅ Status: <b>LUNAS</b>`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("[telegram notify] error:", e);
    // don't fail the order just because notification failed
  }
}
