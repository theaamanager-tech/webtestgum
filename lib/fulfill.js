// Shared, idempotent fulfillment: claim 1 stock unit, build the .txt payload,
// mark the order paid. Safe to call multiple times (webhook + poll race).
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
  if (order.discount > 0) {
    L.push(`Harga    : ${rupiah(order.unit_price)}`);
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

  // claim exactly one stock unit atomically
  const { data: payload, error: claimErr } = await admin
    .rpc("claim_stock", { p_variant: order.variant_id, p_order: order.order_id });
  if (claimErr) throw claimErr;
  if (!payload) {
    await admin.from("orders").update({ status: "failed" }).eq("order_id", orderId);
    throw new Error("Stok habis saat fulfillment");
  }

  const enriched = { ...order, snk: order.variants?.snk || "" };
  const text = buildDeliveryText(enriched, [payload]);

  const { data: updated } = await admin.from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), delivery_text: text })
    .eq("order_id", orderId).select("*").single();

  // bump coupon usage
  if (order.coupon_code) {
    const { data: c } = await admin.from("coupons").select("used_count").eq("code", order.coupon_code).single();
    if (c) await admin.from("coupons").update({ used_count: (c.used_count || 0) + 1 }).eq("code", order.coupon_code);
  }
  return updated || { ...enriched, status: "paid", delivery_text: text };
}
