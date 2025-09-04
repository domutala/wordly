class TranslatorPopover {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private box: HTMLDivElement;
  private textEl: HTMLDivElement;
  private btnEl: HTMLButtonElement;
  private resultEl: HTMLDivElement;
  private caret: HTMLDivElement;
  private srcSelect: HTMLSelectElement;
  private tgtSelect: HTMLSelectElement;
  private visible = false;
  private lastRect: DOMRect | null = null;
  private currentText = "";
  private savedRange: Range | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.root = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      .box {
        all: initial;
        position: fixed;
        max-width: 380px;
        background: #0f1115;
        color: #f5f7fb;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.35);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial;
        display: none;
        user-select: none;
      }
      .sel { font-size: 12px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
      .row { display: flex; gap: 8px; align-items: center; }
      .btn {
        all: unset; cursor: pointer; padding: 6px 10px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.18); font-size: 12px;
        user-select: none;
      }
      .btn:hover { background: rgba(255,255,255,0.08); }
     
      .muted { opacity: .7; }
      .caret {
        position: fixed; width: 0; height: 0; display: none;
        border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 7px solid #0f1115;
      }
      .lang-row { display: flex; gap: 6px; margin-top: 6px; }
      select {
        all: unset;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        font-size: 12px;
        padding: 4px 6px;
        color: #f5f7fb;
        cursor: pointer;
      }
    `;
    this.root.appendChild(style);

    this.box = document.createElement("div");
    this.box.className = "box";

    this.textEl = document.createElement("div");
    this.textEl.className = "sel";

    this.btnEl = document.createElement("button");
    this.btnEl.className = "btn";
    this.btnEl.textContent = "Traduire";

    const actions = document.createElement("div");
    actions.className = "row";
    actions.appendChild(this.btnEl);

    this.resultEl = document.createElement("div");
    this.resultEl.className = "result muted";
    this.resultEl.textContent = "";

    // selects
    this.srcSelect = document.createElement("select");
    this.tgtSelect = document.createElement("select");
    this.populateSelects();

    const langRow = document.createElement("div");
    langRow.className = "lang-row";
    langRow.appendChild(this.srcSelect);
    langRow.appendChild(this.tgtSelect);

    this.box.appendChild(this.textEl);
    this.box.appendChild(actions);
    this.box.appendChild(langRow);
    this.box.appendChild(this.resultEl);

    this.caret = document.createElement("div");
    this.caret.className = "caret";

    this.root.appendChild(this.box);
    this.root.appendChild(this.caret);
    document.documentElement.appendChild(this.host);

    // empêcher la perte de sélection au clic
    this.root.addEventListener(
      "mousedown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true }
    );

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

  private populateSelects() {
    const srcOptions = [
      { code: "auto", label: "Détection auto" },
      { code: "en", label: "Anglais" },
      { code: "fr", label: "Français" },
      { code: "es", label: "Espagnol" },
      { code: "de", label: "Allemand" },
    ];
    srcOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.code;
      o.textContent = opt.label;
      this.srcSelect.appendChild(o);
    });
    this.srcSelect.value = "auto";

    const tgtOptions = [
      { code: "fr", label: "Français" },
      { code: "en", label: "Anglais" },
      { code: "es", label: "Espagnol" },
      { code: "de", label: "Allemand" },
    ];
    tgtOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.code;
      o.textContent = opt.label;
      this.tgtSelect.appendChild(o);
    });
    this.tgtSelect.value = navigator.language.slice(0, 2) || "fr";
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
    this.textEl.textContent = `“${text}”`;
    this.resultEl.textContent = "";
    this.resultEl.classList.add("muted");
    this.btnEl.classList.remove("muted");
    this.show(rect);
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

    this.resultEl.textContent = "Traduction…";
    this.resultEl.classList.add("muted");
    try {
      const res = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        text: this.currentText,
        from: this.srcSelect.value,
        to: this.tgtSelect.value,
      });
      if (res?.ok) {
        this.btnEl.classList.add("muted");
        this.resultEl.textContent = res.text;
        this.resultEl.classList.remove("muted");
      } else {
        this.resultEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      }
    } catch (e: any) {
      this.resultEl.textContent = `Erreur: ${e?.message || String(e)}`;
    }
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

(() => {
  new TranslatorPopover();
  console.log("[noctis] translator ready");
})();
