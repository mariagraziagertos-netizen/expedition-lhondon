import { getStore } from "@netlify/blobs";

const KEY = "state";
const empty = () => ({ listings: [], prices: {}, votes: {}, removedBase: [] });
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const str = (v, n) => String(v ?? "").slice(0, n);

function cleanListing(l) {
  const lat = +l.lat, lng = +l.lng, url = str(l.url, 600);
  if (!isFinite(lat) || !isFinite(lng) || !/^https?:\/\//.test(url)) return null;
  return {
    name: str(l.name, 80) || "Alloggio",
    url,
    src: str(l.src, 40),
    lat,
    lng,
    price: typeof l.price === "number" && l.price > 0 ? Math.round(l.price * 100) / 100 : null,
    div: Math.min(10, Math.max(1, +l.div || 3)),
    note: str(l.note, 160),
    createdAt: +l.createdAt || Date.now(),
  };
}

export default async (req) => {
  const store = getStore({ name: "expedition-lhondon", consistency: "strong" });
  const space = (new URL(req.url).searchParams.get("space") || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
  const key = space ? KEY + "-" + space : KEY;
  const state = (await store.get(key, { type: "json" })) || empty();

  if (req.method === "GET") return json(state);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const code = process.env.EDIT_CODE;
  if (code && req.headers.get("x-edit-code") !== code) return json({ error: "code" }, 401);

  let b;
  try { b = await req.json(); } catch { return json({ error: "body" }, 400); }

  let newId = null;
  switch (b.op) {
    case "add": {
      const l = cleanListing(b.listing || {});
      if (!l) return json({ error: "listing" }, 400);
      if (state.listings.length >= 60) return json({ error: "full" }, 400);
      newId = "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      state.listings.push({ id: newId, ...l });
      break;
    }
    case "update": {
      const i = state.listings.findIndex((x) => x.id === b.id);
      const l = cleanListing(b.listing || {});
      if (i < 0 || !l) return json({ error: "not_found" }, 404);
      state.listings[i] = { id: b.id, ...l };
      break;
    }
    case "remove": {
      state.listings = state.listings.filter((x) => x.id !== b.id);
      for (const v in state.votes) if (state.votes[v] === "u_" + b.id) delete state.votes[v];
      break;
    }
    case "price": {
      const k = str(b.key, 40), v = +b.value;
      if (v > 0) state.prices[k] = Math.round(v * 100) / 100; else delete state.prices[k];
      break;
    }
    case "vote": {
      const voter = str(b.voter, 30).trim();
      if (!voter) return json({ error: "voter" }, 400);
      if (b.choice == null) delete state.votes[voter]; else state.votes[voter] = str(b.choice, 60);
      break;
    }
    case "removeBase": {
      const k = str(b.key, 40);
      state.removedBase = state.removedBase || [];
      if (!state.removedBase.includes(k)) state.removedBase.push(k);
      for (const v in state.votes) if (state.votes[v] === k) delete state.votes[v];
      break;
    }
    case "restoreBase": {
      state.removedBase = (state.removedBase || []).filter((k) => k !== str(b.key, 40));
      break;
    }
    default:
      return json({ error: "op" }, 400);
  }

  await store.setJSON(key, state);
  return json({ ...state, newId });
};

export const config = { path: "/api/data" };
