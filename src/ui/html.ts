export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

const writtenHtml = new WeakMap<Element, string>();

/** Skip a rewrite when the markup is unchanged, so a progress tick does not rebuild the list. */
export function setHtml(element: Element, html: string): void {
  if (writtenHtml.get(element) === html) return;
  element.innerHTML = html;
  writtenHtml.set(element, html);
}
