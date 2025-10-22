export function initSoftSearch() {
  let installed = (window as any).__lit_soft_search_installed__;
  if (installed) return;
  (window as any).__lit_soft_search_installed__ = true;

  const findInput = () =>
    (document.querySelector('input[data-test="search-input"]') as HTMLInputElement) ||
    (document.querySelector('input[name="keyword"]') as HTMLInputElement) ||
    (document.querySelector('input[type="search"]') as HTMLInputElement) ||
    (document.querySelector('input[placeholder*="search" i]') as HTMLInputElement) ||
    (document.querySelector('input[placeholder*="company" i]') as HTMLInputElement);

  const setReactValue = (el: HTMLInputElement, v: string) => {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    desc?.set?.call(el, v);
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const attach = (input: HTMLInputElement) => {
    let t: any = null;
    const onInput = (e: Event) => {
      const v = (e.target as HTMLInputElement)?.value?.trim() ?? "";
      if (v.length < 2) return;
      clearTimeout(t);
      t = setTimeout(() => {
        // ensure React sees latest value
        setReactValue(input, v);
        const form = input.closest("form");
        if (form && typeof (form as any).requestSubmit === "function") {
          (form as any).requestSubmit();
        } else {
          const btn = document.querySelector('[data-test="search-button"]') as HTMLButtonElement;
          if (btn) btn.click();
        }
      }, 250);
    };
    input.addEventListener("input", onInput);
    // keep hard button behavior intact
  };

  const init = () => {
    const input = findInput();
    if (input) { attach(input); return true; }
    const obs = new MutationObserver(() => {
      const i = findInput();
      if (i) { attach(i); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return false;
  };

  init();
}
