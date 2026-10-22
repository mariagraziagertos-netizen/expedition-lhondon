const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } });

const inLondon = (lat, lng) => lat > 51.25 && lat < 51.75 && lng > -0.6 && lng < 0.4;

export default async (req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return json({ error: "q" }, 400);
  try {
    // 1. codice postale completo (es. E14 0BG) o solo la prima parte (es. E14)
    const full = q.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
    if (full) {
      const r = await fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(full[1] + " " + full[2]));
      if (r.ok) {
        const d = (await r.json()).result;
        if (d && inLondon(d.latitude, d.longitude))
          return json({ lat: d.latitude, lng: d.longitude, label: `${d.postcode}, ${d.admin_ward || d.admin_district || "Londra"}` });
      }
    }
    const out = q.match(/^\s*([A-Z]{1,2}\d[A-Z\d]?)\s*$/i);
    if (out) {
      const r = await fetch("https://api.postcodes.io/outcodes/" + encodeURIComponent(out[1]));
      if (r.ok) {
        const d = (await r.json()).result;
        if (d && inLondon(d.latitude, d.longitude))
          return json({ lat: d.latitude, lng: d.longitude, label: `${d.outcode} (zona, posizione indicativa)` });
      }
    }
    // 2. indirizzo libero con OpenStreetMap, limitato all'area di Londra
    const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&bounded=1&viewbox=-0.6,51.75,0.4,51.25&q=" + encodeURIComponent(q);
    const r = await fetch(u, { headers: { "User-Agent": "expedition-lhondon/1.0 (sito personale di viaggio)", "Accept-Language": "it,en" } });
    if (r.ok) {
      const d = await r.json();
      if (d[0]) return json({ lat: +d[0].lat, lng: +d[0].lon, label: d[0].display_name });
    }
    return json({ error: "not_found" }, 404);
  } catch (e) {
    return json({ error: "fetch" }, 502);
  }
};

export const config = { path: "/api/geocode" };
