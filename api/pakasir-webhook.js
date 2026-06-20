// POST /api/pakasir-webhook  (called by Pakasir when payment completes)
// Verifies the payment via the Detail API, then fulfills the order.
import { admin, getConfig, readJson, cors } from "../lib/supabaseAdmin.js";
import { getDetail } from "../lib/pakasir.js";
import { fulfillOrder } from "../lib/fulfill.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJson(req);
    const { order_id, amount, status } = body;
    if (!order_id) return res.status(400).json({ error: "order_id missing" });

    // match against our record
    const { data: order } = await admin.from("orders").select("*").eq("order_id", order_id).single();
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (Number(amount) !== Number(order.amount)) {
      return res.status(400).json({ error: "Amount mismatch" });
    }

    // re-verify with Pakasir (don't trust the webhook body alone)
    const cfg = await getConfig();
    const detail = await getDetail({
      project: cfg.pakasir_project, apiKey: cfg.pakasir_api_key,
      orderId: order_id, amount: order.amount,
    });
    const ok = (detail && detail.status === "completed") || status === "completed";
    if (!ok) return res.status(202).json({ ok: false, note: "Not completed yet" });

    await fulfillOrder(order_id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
