// Cloudflare Pages Function — repo me  functions/tts.js  naam se rakhna hai
// Same GEMINI_API_KEY use hoti hai. Text leke awaaz (WAV) wapas deta hai.

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Agar kabhi raw PCM aaye to usko WAV bana do (24kHz, mono, 16-bit)
function pcmToWav(pcm, rate = 24000) {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h), 0); out.set(pcm, 44);
  return out;
}

async function callTts(model, key, text, voice, style) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model,
        input: [{
          type: "user_input",
          content: [{
            type: "text",
            text,
            annotations: [{ type: "speech_metadata", style }]
          }]
        }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] }
      }),
      signal: ctrl.signal
    });
    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (e) {}
    return { ok: r.ok, status: r.status, data, raw };
  } catch (e) {
    return { ok: false, status: 0, data: null, raw: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY set nahi hai." }, 500);
    const { text = "", voice = "Charon", style = "speaking slowly and clearly like a calm, friendly teacher" } = await request.json();
    const clean = String(text).slice(0, 1500).trim();
    if (!clean) return json({ error: "Text khaali hai." }, 400);

    const models = [env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"]
      .filter((m, i, a) => m && a.indexOf(m) === i);

    let lastErr = "Awaaz nahi bani.";
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await callTts(model, env.GEMINI_API_KEY, clean, voice, style);
        if (res.ok) {
          const blocks = (res.data?.steps || []).flatMap(s => s.content || []).filter(c => c.type === "audio");
          const audio = blocks[blocks.length - 1];
          if (audio?.data) {
            let bytes = b64ToBytes(audio.data);
            const mime = (audio.mime_type || "").toLowerCase();
            const isWav = bytes.length > 4 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF";
            if (!isWav) bytes = pcmToWav(bytes);
            return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
          }
          lastErr = "Audio khaali aaya.";
        } else {
          lastErr = res.data?.error?.message || res.raw.slice(0, 200) || "Unknown error";
          if (![0, 429, 500, 503].includes(res.status)) break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return json({ error: lastErr.slice(0, 200) }, 502);
  } catch (e) {
    return json({ error: "Server error: " + e.message }, 500);
  }
    }
      
