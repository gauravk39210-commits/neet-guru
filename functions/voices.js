// Cloudflare Pages Function — repo me  functions/voices.js  naam se rakhna hai
// Google ki Hindi (India) male voices ki list laata hai, taaki site me chun sako.

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestGet({ env }) {
  try {
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY set nahi hai." }, 500);
    const url = "https://generativelanguage.googleapis.com/v1beta/voices"
      + "?language_code=hi-IN&gender=male&page_size=50";
    const r = await fetch(url, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (e) {}
    if (!r.ok) return json({ error: data?.error?.message || raw.slice(0, 200) }, 502);
    const voices = (data?.voices || []).map(v => ({
      id: v.id,
      name: v.display_name || v.id,
      accent: v.accent || "",
      pitch: v.pitch || "",
      description: v.description || ""
    }));
    return json({ voices });
  } catch (e) {
    return json({ error: "Server error: " + e.message }, 500);
  }
}
