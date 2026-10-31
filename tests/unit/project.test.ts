import { describe, expect, it } from "vitest";
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

  it("usa o projeto de demonstração OB3270", () => {
    expect(demoProject().name).toBe("OB3270-SNF-BC Metalnord");
    expect(demoProject({ name: "Armazém" }).name).toBe("Armazém");
  });
});
