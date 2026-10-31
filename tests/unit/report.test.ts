import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT, buildReportUrl, jobNumberFromName, loadReportConfig, saveReportConfig } from "../../src/domain/report";

describe("relatório de produção", () => {
  it("lê o número da obra no início do nome do projeto", () => {
    expect(jobNumberFromName("OB3270-SNF-BC Metalnord")).toBe("3270");
    expect(jobNumberFromName("ob3228 estrutura")).toBe("3228");
    expect(jobNumberFromName("  OB1001 ")).toBe("1001");
    expect(jobNumberFromName("Pavilhão A")).toBeNull();
    expect(jobNumberFromName("OB32")).toBeNull();
    expect(jobNumberFromName("")).toBeNull();
  });

  it("gera o endereço do portal e do ReportServer com NObra", () => {
    expect(buildReportUrl(DEFAULT_REPORT, "3270")).toBe(
      "http://192.168.1.9/reports/report/PO%C3%87O/PRODU%C3%87%C3%83O/Produ%C3%A7%C3%A3o%20-%20Resumo%20Listas?NObra=3270",
    );
    expect(buildReportUrl({ ...DEFAULT_REPORT, kind: "reportServer" }, "3228")).toBe(
      "http://192.168.1.9/ReportServer?/PO%C3%87O/PRODU%C3%87%C3%83O/Produ%C3%A7%C3%A3o%20-%20Resumo%20Listas&rs:Command=Render&NObra=3228",
    );
    expect(DEFAULT_REPORT.parameter).toBe("NObra");
  });

  it("grava a configuração e repõe NObra se o parâmetro vier vazio", () => {
    const store = new Map<string, string>();
    const memory = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };
    saveReportConfig(memory, { ...DEFAULT_REPORT, kind: "reportServer", parameter: "NObra" });
    expect(loadReportConfig(memory).kind).toBe("reportServer");
    memory.setItem("tc-consultar-objetos:relatorio", JSON.stringify({ parameter: "  " }));
    expect(loadReportConfig(memory).parameter).toBe("NObra");
  });
});
