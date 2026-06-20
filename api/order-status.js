// GET /api/order-status?order_id=...
// Buyer polls this. Also self-heals: if Pakasir says completed but the webhook
// hasn't fired yet, it verifies + fulfills here. Returns delivery_text once paid.
import { admin, getConfig, cors } from "../lib/supabaseAdmin.js";
import { getDetail } from "../lib/pakasir.js";
import { fulfillOrder } from "../lib/fulfill.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const orderId = req.query.order_id;
    if (!orderId) return res.status(400).json({ error: "order_id wajib" });

    const { data: order } = await admin.from("orders").select("*").eq("order_id", orderId).single();
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

    if (order.status === "paid" && order.delivery_text) {
      return res.status(200).json({ status: "paid", delivery_text: order.delivery_text });
    }

    // poll Pakasir; fulfill if completed
    if (order.status === "pending") {
      try {
        const cfg = await getConfig();
        const detail = await getDetail({
          project: cfg.pakasir_project, apiKey: cfg.pakasir_api_key,
          orderId, amount: order.amount,
        });
        if (detail && detail.status === "completed") {
          const fulfilled = await fulfillOrder(orderId);
          if (fulfilled?.delivery_text) {
            return res.status(200).json({ status: "paid", delivery_text: fulfilled.delivery_text });
          }
        }
      } catch (e) { /* keep returning pending */ }
    }

    return res.status(200).json({ status: order.status });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
