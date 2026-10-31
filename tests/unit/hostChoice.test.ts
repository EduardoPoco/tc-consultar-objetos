import { describe, expect, it } from "vitest";
import { chooseHost } from "../../src/host/hostChoice";

describe("escolha do anfitrião", () => {
  it("fica no visualizador quando a API do viewer responde, mesmo que getHost diga projeto", () => {
    expect(chooseHost("project", "ok")).toBe("3dviewer");
    expect(chooseHost("3dviewer", "ok")).toBe("3dviewer");
    expect(chooseHost(null, "ok")).toBe("3dviewer");
  });

  it("só abre a página do projeto quando getHost diz projeto e o viewer falha", () => {
    expect(chooseHost("project", "fail")).toBe("project");
  });

  it("prefere o visualizador quando o contexto não é conclusivo", () => {
    expect(chooseHost("project", "unknown")).toBe("3dviewer");
    expect(chooseHost("3dviewer", "fail")).toBe("3dviewer");
    expect(chooseHost(null, "fail")).toBe("3dviewer");
    expect(chooseHost(null, "unknown")).toBe("3dviewer");
  });
});
