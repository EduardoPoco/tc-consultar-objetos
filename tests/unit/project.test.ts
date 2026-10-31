import { describe, expect, it } from "vitest";
import { apiBaseForLocation, fileItemsFromPayload, isModelName, rootFolderId, tokenFromEvent } from "../../src/domain/files";
import { isHttpUrl, loadLinks, saveLinks, upsertLink } from "../../src/domain/links";
import { formatUser, locationLabel } from "../../src/domain/project";
import { demoProject } from "../../src/demo/projectDemo";

describe("página do projeto", () => {
  it("traduz a região e compõe o utilizador", () => {
    expect(locationLabel("europe")).toBe("Europa");
    expect(locationLabel("northAmerica")).toBe("América do Norte");
    expect(locationLabel("asia")).toBe("Ásia");
    expect(locationLabel("")).toBe("Não indicada");
    expect(formatUser({ firstName: "Ana", lastName: "Martins", email: "ana.martins@exemplo.pt" })).toEqual({
      name: "Ana Martins",
      email: "ana.martins@exemplo.pt",
    });
  });

  it("escolhe o servidor da API pela região e distingue modelos", () => {
    expect(apiBaseForLocation("europe")).toContain("trimble.eu");
    expect(apiBaseForLocation("northAmerica")).toContain("trimble.com/tc");
    expect(apiBaseForLocation("asia")).toContain("com.au");
    expect(apiBaseForLocation("marte")).toBeNull();
    expect(isModelName("Obra.IFC")).toBe(true);
    expect(isModelName("Notas.pdf")).toBe(false);
    expect(rootFolderId({ rootFolder: { id: "raiz" } })).toBe("raiz");
    expect(tokenFromEvent({ data: "granted" })).toBe("");
    expect(tokenFromEvent({ data: "a".repeat(20) })).toHaveLength(20);
    const items = fileItemsFromPayload({
      items: [
        { id: "1", name: "Pasta", type: "FOLDER" },
        { id: "2", name: "Modelo.ifc", type: "FILE", versionId: "v2" },
      ],
    }, "raiz");
    expect(items.map((item) => item.kind)).toEqual(["folder", "file"]);
    expect(items[1].model).toBe(true);
    expect(items[1].versionId).toBe("v2");
  });

  it("guarda ligações http por projeto e recusa outros esquemas", () => {
    expect(isHttpUrl("https://exemplo.pt/obra")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    const store = new Map<string, string>();
    const memory = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };
    const saved = upsertLink([], { id: "", name: "Portal", url: "https://exemplo.pt" });
    saveLinks(memory, "obra", saved);
    expect(loadLinks(memory, "obra")).toHaveLength(1);
    expect(loadLinks(memory, "outra")).toEqual([]);
    expect(loadLinks(memory, "obra")[0].name).toBe("Portal");
  });

  it("usa o projeto de demonstração OB3270", () => {
    expect(demoProject().name).toBe("OB3270-SNF-BC Metalnord");
    expect(demoProject({ name: "Armazém" }).name).toBe("Armazém");
  });
});
