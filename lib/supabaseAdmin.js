// Shared Supabase service-role client (server-side only — bypasses RLS).
// Lazy init: tidak crash saat module load kalau env vars belum diset.
import { createClient } from "@supabase/supabase-js";

let _db = null;

function db() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase belum dikonfigurasi. Set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di Vercel.");
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

// Proxy supaya admin.from("x").select("*") tetap jalan.
// Proxy ini lazy-init: error baru muncul waktu dipakai, bukan pas import.
export const admin = new Proxy({}, {
  get(_, prop) {
    const client = db();
    const val = client[prop];
    // Kalau property-nya function (from, rpc), balikin function
    if (typeof val === "function") return val.bind(client);
    // Kalau property-nya object (storage), balikin object dengan proxy juga
    if (val !== null && typeof val === "object") {
      return new Proxy(val, {
        get(target, p) {
          const v = target[p];
          if (typeof v === "function") return v.bind(target);
          return v;
        },
      });
    }
    return val;
  },
});

// Load the single app_config row (Pakasir credentials live here).
export async function getConfig() {
  const { data, error } = await admin.from("app_config").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

// Small JSON body reader (Vercel parses JSON automatically, this is a fallback).
export async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
