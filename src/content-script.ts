import styleUrl from "./content-style.scss?url";

async function attachShadowStyles(shadow: ShadowRoot): Promise<void> {
  const href = chrome.runtime.getURL(styleUrl); // résout l’URL packagée
  const css = await fetch(href).then((r) => r.text());

  // Option A: style classique
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  shadow.appendChild(styleEl);
}

class TranslatorPopover {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private box: HTMLDivElement;
  private btnEl: HTMLButtonElement;
  private caret: HTMLDivElement;
  private visible = false;
  private lastRect: DOMRect | null = null;
  private currentText = "";
  private savedRange: Range | null = null;

  constructor() {
    this.init();
  }

  async init() {
    this.host = document.createElement("div");
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.classList.add("--noctis-root");

    this.root = this.host.attachShadow({ mode: "open" });
    await attachShadowStyles(this.root);

    const style = document.createElement("style");
    style.textContent = `
      
    `;
    this.root.appendChild(style);

    this.box = document.createElement("div");
    this.box.className = "box";

    this.btnEl = document.createElement("button");
    this.btnEl.className = "btn";
    // this.btnEl.textContent = "Traduire";

    const i = `<svg style="fill: currentColor; width: 16px" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 469.333 469.333" style="enable-background:new 0 0 512 512" xml:space="preserve"><g><path d="M253.227 300.267 199.04 246.72l.64-.64c37.12-41.387 63.573-88.96 79.147-139.307h62.507V64H192V21.333h-42.667V64H0v42.453h238.293c-14.4 41.173-36.907 80.213-67.627 114.347-19.84-22.08-36.267-46.08-49.28-71.467H78.72c15.573 34.773 36.907 67.627 63.573 97.28l-108.48 107.2L64 384l106.667-106.667 66.347 66.347 16.213-43.413zM373.333 192h-42.667l-96 256h42.667l24-64h101.333l24 64h42.667l-96-256zm-56 149.333L352 248.853l34.667 92.48h-69.334z"></path></g></svg>`;
    this.btnEl.innerHTML = i;

    const actions = document.createElement("div");
    actions.className = "row";
    actions.appendChild(this.btnEl);

    this.box.appendChild(actions);

    this.caret = document.createElement("div");
    this.caret.className = "caret";

    const translateRow = document.createElement("div");
    translateRow.className = "rows";

    this.root.appendChild(this.box);
    this.root.appendChild(this.caret);
    this.root.appendChild(translateRow);

    document.documentElement.appendChild(this.host);

    // events
    this.btnEl.addEventListener("click", () => this.doTranslate());
    document.addEventListener(
      "mousedown",
      (ev) => {
        const path = (ev.composedPath?.() ?? []) as EventTarget[];
        if (!path.includes(this.host)) this.hide();
      },
      true
    );
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
    window.addEventListener("scroll", () => this.reposition(), {
      passive: true,
    });
    window.addEventListener("resize", () => this.reposition());

    document.addEventListener("mouseup", () => this.onSelection());
    document.addEventListener("keyup", () => this.onSelection());
    document.addEventListener("selectionchange", () =>
      queueMicrotask(() => this.onSelection())
    );
  }

  private restoreSelection() {
    if (!this.savedRange) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    try {
      sel.addRange(this.savedRange);
    } catch {}
  }

  private async doTranslate() {
    if (!this.currentText) return;
    this.restoreSelection();

    new TranslateText(this.root, this.currentText);
    this.hide();
    // try {
    //   // await chrome.runtime.sendMessage({
    //   //   type: "TRANSLATE",
    //   //   text: this.currentText,
    //   // });
    // } catch (e: any) {}
  }

  private getSelectionRect(): {
    text: string;
    rect: DOMRect | null;
    range: Range | null;
  } {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0)
      return { text: "", rect: null, range: null };
    const text = sel.toString().trim();
    if (!text) return { text: "", rect: null, range: null };
    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0))
        return { text, rect: null, range: null };
      return { text, rect, range };
    } catch {
      return { text, rect: null, range: null };
    }
  }

  private onSelection() {
    const { text, rect, range } = this.getSelectionRect();
    if (!rect || !text) {
      this.hide();
      return;
    }

    this.currentText = text;
    this.savedRange = range ? range.cloneRange() : null;
    this.btnEl.classList.remove("muted");
    this.show(rect);
  }

  private show(rect: DOMRect) {
    this.visible = true;
    this.lastRect = rect;
    this.box.style.display = "block";
    this.caret.style.display = "block";
    requestAnimationFrame(() => this.place(rect));
  }

  private place(rect: DOMRect) {
    const vw = window.innerWidth;
    const offset = 8;
    const b = this.box.getBoundingClientRect();
    const topPref = rect.top - b.height - offset;
    const above = topPref >= 8;
    const top = above ? topPref : rect.bottom + offset;
    let left = rect.left + rect.width / 2 - b.width / 2;
    left = Math.max(8, Math.min(left, vw - b.width - 8));
    this.box.style.transform = `translate(${Math.round(left)}px, ${Math.round(
      top
    )}px)`;

    const caretX = rect.left + rect.width / 2 - 7;
    const caretY = above ? rect.top - 1 : rect.bottom + 1;
    this.caret.style.transform = `translate(${Math.round(
      caretX
    )}px, ${Math.round(caretY)}px) rotate(${above ? "0" : "180deg"})`;
  }

  private hide() {
    if (!this.visible) return;
    this.visible = false;
    this.lastRect = null;
    this.box.style.display = "none";
    this.caret.style.display = "none";
  }

  private reposition() {
    if (!this.visible || !this.lastRect) return;
    const { rect } = this.getSelectionRect();
    if (!rect) {
      this.hide();
      return;
    }
    this.place(rect);
  }
}

class TranslateText {
  private row: HTMLDivElement;
  private root: ShadowRoot;
  private srcSelect: HTMLSelectElement;
  private tgtSelect: HTMLSelectElement;
  private resultEl: HTMLDivElement;
  private text: string;
  private translating = false;

  languages: { code: string; label: string }[] = [
    { code: "ar", label: "العربية" }, // Arabe
    { code: "bg", label: "Български" }, // Bulgare
    { code: "cs", label: "Čeština" }, // Tchèque
    { code: "da", label: "Dansk" }, // Danois
    { code: "de", label: "Deutsch" }, // Allemand
    { code: "el", label: "Ελληνικά" }, // Grec
    { code: "en", label: "English" }, // Anglais UK
    { code: "en-GB", label: "English (UK)" }, // Anglais UK
    { code: "en-US", label: "English (US)" }, // Anglais US
    { code: "es", label: "Español" }, // Espagnol
    { code: "es-419", label: "Español (LatAm)" }, // Espagnol Amérique latine
    { code: "et", label: "Eesti" }, // Estonien
    { code: "fi", label: "Suomi" }, // Finnois
    { code: "fr", label: "Français" }, // Français
    { code: "he", label: "עברית" }, // Hébreu
    { code: "hu", label: "Magyar" }, // Hongrois
    { code: "id", label: "Bahasa Indonesia" }, // Indonésien
    { code: "it", label: "Italiano" }, // Italien
    { code: "ja", label: "日本語" }, // Japonais
    { code: "ko", label: "한국어" },
    { code: "lt", label: "Lietuvių" }, // Lituanien
    { code: "lv", label: "Latviešu" }, // Letton
    { code: "nb", label: "Norsk bokmål" }, // Norvégien Bokmål
    { code: "nl", label: "Nederlands" }, // Néerlandais
    { code: "pl", label: "Polski" }, // Polonais
    { code: "pt-BR", label: "Português (Brasil)" }, // Portugais Brésil
    { code: "pt-PT", label: "Português (Portugal)" }, // Portugais Portugal
    { code: "ro", label: "Română" }, // Roumain
    { code: "ru", label: "Русский" }, // Russe
    { code: "sk", label: "Slovenčina" }, // Slovaque
    { code: "sl", label: "Slovenščina" }, // Slovène
    { code: "sv", label: "Svenska" }, // Suédois
    { code: "th", label: "ไทย" }, // Thaï
    { code: "tr", label: "Türkçe" }, // Turc
    { code: "uk", label: "Українська" }, // Ukrainien
    { code: "vi", label: "Tiếng Việt" }, // Vietnamien
    { code: "zh", label: "中文" }, // Chinois (générique)
    { code: "zh-Hans", label: "简体中文" }, // Chinois simplifié
    { code: "zh-Hant", label: "繁體中文" }, // Chinois traditionnel
  ];

  constructor(root: ShadowRoot, text: string) {
    this.root = root;
    this.text = text;

    this.row = document.createElement("div");
    this.row.classList.add("row");

    const header = document.createElement("div");
    header.classList.add("header");
    this.row.appendChild(header);

    this.srcSelect = document.createElement("select");
    this.srcSelect.classList.add("btn");
    header.appendChild(this.srcSelect);

    this.tgtSelect = document.createElement("select");
    this.tgtSelect.classList.add("btn");
    header.appendChild(this.tgtSelect);

    this.populateSelects();

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `<svg width="12px" xmlns="http://www.w3.org/2000/svg"	xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Capa_1" x="0px" y="0px" viewBox="0 0 511.991 511.991" style="enable-background:new 0 0 511.991 511.991;" xml:space="preserve" width="512" height="512"><g><path d="M286.161,255.867L505.745,36.283c8.185-8.474,7.951-21.98-0.523-30.165c-8.267-7.985-21.375-7.985-29.642,0   L255.995,225.702L36.411,6.118c-8.475-8.185-21.98-7.95-30.165,0.524c-7.985,8.267-7.985,21.374,0,29.641L225.83,255.867   L6.246,475.451c-8.328,8.331-8.328,21.835,0,30.165l0,0c8.331,8.328,21.835,8.328,30.165,0l219.584-219.584l219.584,219.584   c8.331,8.328,21.835,8.328,30.165,0l0,0c8.328-8.331,8.328-21.835,0-30.165L286.161,255.867z"/></g></svg>`;
    closeBtn.className = "btn icon";
    closeBtn.style.marginLeft = "auto";
    closeBtn.style.border = "0";
    closeBtn.addEventListener("click", () => this.destroy());
    header.appendChild(closeBtn);

    this.resultEl = document.createElement("div");
    this.resultEl.className = "result";
    this.resultEl.textContent = "";
    this.row.appendChild(this.resultEl);

    this.root.querySelector(".rows")?.appendChild(this.row);
    this.doTranslate();

    this.srcSelect.addEventListener("change", () => this.doTranslate());
    this.tgtSelect.addEventListener("change", () => this.doTranslate());
  }

  private populateSelects() {
    const srcOptions = [{ code: "auto", label: "auto" }, ...this.languages];
    srcOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.code;
      o.textContent = opt.label;
      this.srcSelect.appendChild(o);
    });
    this.srcSelect.value = "auto";

    const tgtOptions = [...this.languages];
    tgtOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.code;
      o.textContent = opt.label;
      this.tgtSelect.appendChild(o);
    });
    this.tgtSelect.value = navigator.language.slice(0, 2) || "fr";
  }

  private async doTranslate() {
    this.resultEl.textContent = "Traduction…";
    this.translating = true;

    try {
      const res = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        text: this.text,
        from: this.srcSelect.value,
        to: this.tgtSelect.value,
      });
      if (res?.ok) {
        // this.btnEl.classList.add("muted");
        this.resultEl.textContent = res.text;
        if (this.srcSelect.value === "auto") {
          const l = this.languages.find(
            (l) => l.code === res.detected_source_language.toLowerCase()
          );

          this.srcSelect.options.item(0).label = `${l?.label} (auto)`;
        } else {
          this.srcSelect.options.item(0).label = `auto`;
        }
      } else {
        this.resultEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      }
    } catch (e: any) {
      this.resultEl.textContent = `Erreur: ${e?.message || String(e)}`;
    } finally {
      this.translating = false;
    }
  }

  destroy() {
    this.row.remove();
  }
}

(() => {
  new TranslatorPopover();
  console.log("[noctis] translator ready");
})();
