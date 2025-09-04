// src/background.ts
type TranslateReq = {
  type: "TRANSLATE";
  text: string;
  to: string; // ex: "fr"
  from?: string; // "auto" par défaut
};

const DEFAULTS = {
  apiUrl: "https://libretranslate.com", // remplace par ton instance
  target: "fr",
};

async function getSettings() {
  const s = await chrome.storage.sync.get(["apiUrl", "target"]);
  return {
    apiUrl: (s.apiUrl as string) || DEFAULTS.apiUrl,
    target: (s.target as string) || DEFAULTS.target,
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.sync.get(["apiUrl", "target"]);
  if (!s.apiUrl) await chrome.storage.sync.set({ apiUrl: DEFAULTS.apiUrl });
  if (!s.target) await chrome.storage.sync.set({ target: DEFAULTS.target });
  console.log("[noctis] installed with", await getSettings());
});

// Traduction via LibreTranslate (no-key sur certaines instances ; sinon ajoute l’API key)
// async function translate(
//   apiUrl: string,
//   text: string,
//   to: string,
//   from = "auto"
// ) {
//   const res = await fetch(`${apiUrl}/translate`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ q: text, source: from, target: to, format: "text" }),
//   });
//   if (!res.ok) throw new Error(`HTTP ${res.status}`);
//   const data = (await res.json()) as { translatedText: string };
//   return data.translatedText;
// }

async function useDeepl(text: string, to: string, from?: string) {
  const res = await fetch(`https://api-free.deepl.com/v2/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "DeepL-Auth-Key *************",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: from === "auto" ? undefined : from,
      target_lang: to,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.translations[0];
}

async function useGoogle(text: string, to: string, from?: string) {
  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", from === "auto" ? "auto" : from);
    url.searchParams.set("tl", to);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // la réponse est un gros tableau JSON
    const data = await res.json();

    // texte traduit : data[0][0][0]
    const translated = data[0].map((part: any) => part[0]).join("");
    const detectedLang = data[2]; // langue détectée

    return {
      ok: true,
      text: translated,
      detected_source_language: detectedLang,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || String(err),
    };
  }
}

chrome.runtime.onMessage.addListener(
  (msg: TranslateReq, _sender, sendResponse) => {
    if (msg?.type === "TRANSLATE") {
      (async () => {
        try {
          //   const { apiUrl } = await getSettings();
          //   const out = await translate(
          //     apiUrl,
          //     msg.text,
          //     msg.to ?? DEFAULTS.target,
          //     msg.from ?? "auto"
          //   );
          const out = await useDeepl(
            msg.text,
            msg.to ?? DEFAULTS.target,
            msg.from
          );
          sendResponse({ ok: true, ...out });
        } catch (e: any) {
          sendResponse({ ok: false, error: e?.message || String(e) });
        }
      })();
      return true; // async
    }
    return false;
  }
);
