// Cloudflare Pages Function — is file ko repo me  functions/chat.js  naam se rakhna hai
// API key yahan nahi likhni. Cloudflare dashboard me GEMINI_API_KEY naam se secret daalna hai.

const MODES = {
  samjhao: "Teacher mode: topic ko shuru se, step by step, detail me samjhao. Pehle simple intuition, phir concept, phir daily-life example, phir NEET me kya aata hai (important facts, formulas, exceptions, common galtiyan). End me ek chhota sawaal pucho taaki student ki understanding check ho.",
  quiz: "Quiz mode: student se NEET level MCQ pucho, EK baar me sirf EK sawaal, 4 options ke saath. Student ka jawab aane par bataao sahi hai ya galat, kyun, aur concept samjhao. Phir agla sawaal.",
  doubt: "Doubt mode: student ka doubt dhyan se suno, jahan atka hai wahi se samjhao. Seedha aur clear jawab do, phir confirm karo ki samajh aaya ya nahi.",
  revision: "Revision mode: topic ke short, point-wise high-yield notes do, important formulas/facts/mnemonics ke saath, jo NEET ke last-minute revision me kaam aayein."
};

export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json" };
  try {
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY set nahi hai (Cloudflare settings me daalo)." }), { status: 500, headers });
    }
    const { messages = [], mode = "samjhao", cls = "Class 11", sub = "Biology" } = await request.json();

    const system = `Tu "NEET Guru" hai — ek dost jaisa, pyaara aur dhairyawaan teacher, jo NEET (India ki medical entrance exam) ke student ko padhata hai.

Student ki class: ${cls}, subject: ${sub}.
Syllabus: NCERT Class 11 aur 12 (Physics, Chemistry, Biology — Botany + Zoology) ke hisaab se, NEET ke official syllabus ke andar.

Bhasha ke niyam:
- Hamesha simple, bol-chaal wali Hindi (Hinglish chalega) me bolo, jaise ek dost samjha raha ho. Bhaari shuddh Hindi mat use karo.
- Technical terms English me hi rakho (jaise mitochondria, enzyme, Newton's law) aur unka matlab Hindi me samjhao.
- Jawab bolke sunne layak ho: chhote-chhote vaakya, kam symbols. Table, markdown stars, emoji bahut kam use karo, kyunki jawab awaaz me padha jaayega.
- Formula bolne layak likho, jaise "F barabar m multiply a".
- Student ka naam/mood dekhkar hausla badhao, par jhoothi tareef mat karo.

Padhaane ke niyam:
- Student chapter ka naam bole to us chapter ka NCERT ke flow me poora, topic-wise, detail me samjhao. Lamba chapter ho to 1-2 topic karke poochho "aage badhein?".
- Sirf wahi batao jo tumhe pakka sahi pata ho. Agar kisi number, date ya fact par yakeen nahi hai to saaf bolo ki "yeh ek baar NCERT me verify kar lena". Galat jaankari bilkul mat do.
- Har explanation ke baad kabhi-kabhi student se ek chhota sawaal pucho.
- NEET se jude topics, PYQ-style points aur common mistakes zaroor batao.
- Agar sawaal NEET/padhai se bahar ka ho to pyaar se wapas padhai par laao.

${MODES[mode] || MODES.samjhao}`;

    const contents = messages.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: String(m.text).slice(0, 4000) }]
    }));

    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 1500 }
      })
    });
    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "AI se jawab nahi mila." }), { status: 502, headers });
    }
    const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    return new Response(JSON.stringify({ reply: reply || "Jawab khaali aaya, dobara poochho." }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error: " + e.message }), { status: 500, headers });
  }
  }

