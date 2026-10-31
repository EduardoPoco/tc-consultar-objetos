import { describe, expect, it } from "vitest";
import { chooseHost } from "../../src/host/hostChoice";
import { projectMenu } from "../../src/host/projectHost";

describe("escolha do anfitrião", () => {
  it("fica no visualizador quando a API do viewer responde, mesmo que getHost diga projeto", () => {
    expect(chooseHost("project", "ok")).toBe("3dviewer");
    expect(chooseHost("3dviewer", "ok")).toBe("3dviewer");
    expect(chooseHost(null, "ok")).toBe("3dviewer");
  });

  it("só abre a página do projeto quando getHost diz projeto e o viewer falha", () => {
    expect(chooseHost("project", "fail")).toBe("project");
  });

  it("o menu do projeto tem título, ícone PNG, comando e submenus", () => {
    const menu = projectMenu("https://eduardopoco.github.io/tc-consultar-objetos/icon.png");
    expect(menu.title).toBe("Consultar Objetos");
    expect(menu.command).toBe("consultar-objetos");
    expect(menu.icon.endsWith(".png")).toBe(true);
    expect(menu.subMenus.map((item) => item.command)).toEqual(["projeto", "modelos", "ligacoes", "relatorio", "ajuda"]);
    expect(menu.subMenus.every((item) => item.title && item.icon === menu.icon)).toBe(true);
  });

  it("prefere o visualizador quando o contexto não é conclusivo", () => {
    expect(chooseHost("project", "unknown")).toBe("3dviewer");
    expect(chooseHost("3dviewer", "fail")).toBe("3dviewer");
    expect(chooseHost(null, "fail")).toBe("3dviewer");
    expect(chooseHost(null, "unknown")).toBe("3dviewer");
  });
});
