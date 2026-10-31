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
