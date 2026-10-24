// Cloudflare Pages Function — repo me  functions/chat.js  naam se rakhna hai
// API key yahan nahi likhni. Cloudflare me GEMINI_API_KEY naam se secret daalna hai.

const MODES = {
  samjhao: "Teacher mode: topic ko shuru se, step by step, detail me samjhao. Pehle simple intuition, phir concept, phir daily-life example, phir NEET me kya aata hai (important facts, formulas, exceptions, common galtiyan). End me ek chhota sawaal pucho taaki student ki understanding check ho.",
  quiz: "Quiz mode: student se NEET level MCQ pucho, EK baar me sirf EK sawaal, 4 options ke saath. Student ka jawab aane par bataao sahi hai ya galat, kyun, aur concept samjhao. Phir agla sawaal.",
  doubt: "Doubt mode: student ka doubt dhyan se suno, jahan atka hai wahi se samjhao. Seedha aur clear jawab do, phir confirm karo ki samajh aaya ya nahi.",
  revision: "Revision mode: topic ke short, point-wise high-yield notes do, important formulas/facts/mnemonics ke saath, jo NEET ke last-minute revision me kaam aayein."
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

async function callGemini(model, key, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal }
    );
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
    if (!env.GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY set nahi hai (Cloudflare settings me daalo)." }, 500);
    }
    const { messages = [], mode = "samjhao", cls = "Class 11", sub = "Biology" } = await request.json();

    const system = `Tu "NEET Guru" hai — ek dost jaisa, pyaara aur dhairyawaan teacher, jo NEET (India ki medical entrance exam) ke student ko padhata hai.

Student ki class: ${cls}, subject: ${sub}.
Syllabus: NCERT Class 11 aur 12 (Physics, Chemistry, Biology — Botany + Zoology) ke hisaab se, NEET ke official syllabus ke andar.

Bhasha ke niyam:
- Jawab hamesha DEVANAGARI lipi me (हिन्दी में) likho, kyunki jawab awaaz me padha jaayega aur Devanagari se uchcharan saaf aata hai. Roman/Hinglish me mat likho.
- Bhasha simple, bol-chaal wali ho, jaise ek dost samjha raha ho. Bhaari shuddh Hindi mat use karo (jaise "इसलिए", "मतलब", "देखो" jaise aam shabd use karo).
- Technical terms English me hi rakho aur English letters me hi likho (jaise mitochondria, enzyme, velocity, Newton's law), aur unka matlab Hindi me samjhao.
- Chhote-chhote vaakya likho, har vaakya ke ant me poorn viram (।) lagao. Table, markdown stars, bullet symbols aur emoji bilkul mat use karo, kyunki jawab awaaz me padha jaayega.
- Formula bolne layak likho, jaise "F बराबर m गुणा a".
- Student ka hausla badhao, par jhoothi tareef mat karo.

Padhaane ke niyam:
- Student chapter ka naam bole to us chapter ka NCERT ke flow me topic-wise, detail me samjhao. Lamba chapter ho to 1-2 topic karke poochho "aage badhein?".
- Sirf wahi batao jo tumhe pakka sahi pata ho. Agar kisi number, date ya fact par yakeen nahi hai to saaf bolo ki "yeh ek baar NCERT me verify kar lena". Galat jaankari bilkul mat do.
- Har explanation ke baad kabhi-kabhi student se ek chhota sawaal pucho.
- NEET se jude topics, PYQ-style points aur common mistakes zaroor batao.
- Agar sawaal NEET/padhai se bahar ka ho to pyaar se wapas padhai par laao.

${MODES[mode] || MODES.samjhao}`;

    const contents = messages.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: String(m.text).slice(0, 4000) }]
    }));

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 1200 }
    });

    // Pehle aapka chuna hua model, phir backup models (busy hone par)
    const models = [env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"]
      .filter((m, i, a) => m && a.indexOf(m) === i);

    let lastErr = "AI se jawab nahi mila.";
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await callGemini(model, env.GEMINI_API_KEY, body, 22000);
        if (res.ok) {
          const reply = res.data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
          if (reply) return json({ reply });
          lastErr = "Jawab khaali aaya, dobara poochho.";
        } else {
          lastErr = res.data?.error?.message || res.raw.slice(0, 200) || "Unknown error";
          // 429/503/timeout -> dobara try; baaki errors me agle model par jao
          if (![0, 429, 500, 503].includes(res.status)) break;
        }
        await new Promise(r => setTimeout(r, 800));
      }
    }
    return json({ error: "Abhi AI busy hai, 1 minute baad dobara try karo. (" + lastErr.slice(0, 120) + ")" }, 502);
  } catch (e) {
    return json({ error: "Server error: " + e.message }, 500);
  }
}
