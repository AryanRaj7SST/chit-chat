// Keep the tab icon aligned with the app theme and accent. The static SVG
// remains a fallback when JavaScript or the request is unavailable.
(() => {
  const root = document.documentElement;
  let svg, previous;
  const update = () => {
    if (!svg) return;
    const style = getComputedStyle(root);
    const primary = style.getPropertyValue("--primary").trim();
    const hover = style.getPropertyValue("--primary-hover").trim();
    if (!/^#[0-9a-f]{6}$/i.test(primary) || !/^#[0-9a-f]{6}$/i.test(hover)) return;
    const white = root.classList.contains("dark") ? .1 : .25;
    const top = "#" + primary.slice(1).match(/../g).map(pair => Math.round(parseInt(pair, 16) * (1 - white) + 255 * white).toString(16).padStart(2, "0")).join("");
    const signature = `${top}:${hover}`;
    if (signature === previous) return;
    previous = signature;
    svg.setAttribute("style", `--top:${top};--bottom:${hover}`);
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  };
  fetch("/favicon.svg").then(response => response.ok ? response.text() : Promise.reject()).then(text => {
    svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    update();
  }).catch(() => { /* Keep the static favicon if loading fails. */ });
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["class", "data-accent"] });
  document.addEventListener("DOMContentLoaded", update, { once: true });
})();
