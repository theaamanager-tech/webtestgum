// Pakasir QRIS API wrapper (https://pakasir.com/p/docs)
const BASE = "https://app.pakasir.com";

// Create a QRIS transaction. Returns { payment_number (QR string), total_payment, expired_at, ... }
export async function createQris({ project, apiKey, orderId, amount }) {
  const res = await fetch(`${BASE}/api/transactioncreate/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, order_id: orderId, amount, api_key: apiKey }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.payment) {
    throw new Error(json.message || `Pakasir create failed (${res.status})`);
  }
  return json.payment;
}

// Verify a transaction's real status (more trustworthy than the webhook body).
export async function getDetail({ project, apiKey, orderId, amount }) {
  const url = `${BASE}/api/transactiondetail?project=${encodeURIComponent(project)}&amount=${amount}&order_id=${encodeURIComponent(orderId)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Pakasir detail failed (${res.status})`);
  return json.transaction || null;
}

// Sandbox-only: simulate a payment to test the webhook/fulfillment.
export async function simulate({ project, apiKey, orderId, amount }) {
  const res = await fetch(`${BASE}/api/paymentsimulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, order_id: orderId, amount, api_key: apiKey }),
  });
  return res.json().catch(() => ({}));
}

// Hosted QRIS-only pay page (fallback link).
export function payPageUrl({ project, amount, orderId, redirect }) {
  let u = `${BASE}/pay/${project}/${amount}?order_id=${encodeURIComponent(orderId)}&qris_only=1`;
  if (redirect) u += `&redirect=${encodeURIComponent(redirect)}`;
  return u;
}
