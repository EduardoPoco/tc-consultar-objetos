export type ReportKind = "portal" | "reportServer";

export interface ReportConfig {
  kind: ReportKind;
  portalBase: string;
  serverBase: string;
  parameter: string;
}

export const DEFAULT_REPORT: ReportConfig = {
  kind: "portal",
  portalBase: "http://192.168.1.9/reports/report/PO%C3%87O/PRODU%C3%87%C3%83O/Produ%C3%A7%C3%A3o%20-%20Resumo%20Listas",
  serverBase: "http://192.168.1.9/ReportServer?/PO%C3%87O/PRODU%C3%87%C3%83O/Produ%C3%A7%C3%A3o%20-%20Resumo%20Listas",
  parameter: "NObra",
};

const CONFIG_KEY = "tc-consultar-objetos:relatorio";
const jobKey = (projectId: string) => `tc-consultar-objetos:obra:${projectId}`;

export function jobNumberFromName(name: string): string | null {
  const match = name.trim().match(/^OB(\d{4})/i);
  return match?.[1] ?? null;
}

export function buildReportUrl(config: ReportConfig, job: string): string {
  const parameter = encodeURIComponent(config.parameter.trim() || DEFAULT_REPORT.parameter);
  const value = encodeURIComponent(job.trim());
  if (config.kind === "reportServer") {
    const base = config.serverBase.trim();
    const separator = base.includes("?") ? "&" : "?";
    const command = /[?&]rs:Command=/i.test(base) ? "" : `${separator}rs:Command=Render`;
    const joiner = command ? "&" : separator;
    return `${base}${command}${joiner}${parameter}=${value}`;
  }
  const base = config.portalBase.trim();
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${parameter}=${value}`;
}

export function loadReportConfig(store: Pick<Storage, "getItem">): ReportConfig {
  const raw = store.getItem(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_REPORT };
  try {
    const parsed = JSON.parse(raw) as Partial<ReportConfig>;
    const kind = parsed.kind === "reportServer" ? "reportServer" : "portal";
    return {
      kind,
      portalBase: typeof parsed.portalBase === "string" && parsed.portalBase.trim() ? parsed.portalBase.trim() : DEFAULT_REPORT.portalBase,
      serverBase: typeof parsed.serverBase === "string" && parsed.serverBase.trim() ? parsed.serverBase.trim() : DEFAULT_REPORT.serverBase,
      parameter: typeof parsed.parameter === "string" && parsed.parameter.trim() ? parsed.parameter.trim() : DEFAULT_REPORT.parameter,
    };
  } catch {
    return { ...DEFAULT_REPORT };
  }
}

export function saveReportConfig(store: Pick<Storage, "setItem">, config: ReportConfig): void {
  store.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadManualJob(store: Pick<Storage, "getItem">, projectId: string): string {
  return store.getItem(jobKey(projectId))?.trim() ?? "";
}

export function saveManualJob(store: Pick<Storage, "setItem">, projectId: string, job: string): void {
  store.setItem(jobKey(projectId), job.trim());
}
