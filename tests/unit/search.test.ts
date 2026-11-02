import { describe, expect, it } from "vitest";
import { searchObjects, textMatches } from "../../src/domain/search";
import { toInquiredObject } from "../../src/domain/properties";
import { PropertyType, type RawObject } from "../../src/domain/types";

const beam: RawObject = {
  id: 2,
  class: "IfcBeam",
  product: { name: "HEA200", description: "Viga" },
  properties: [
    { name: "Perfil", properties: [{ name: "Nome", type: PropertyType.StringValue, value: "HEA200" }] },
    { name: "Material", properties: [{ name: "Grau", type: PropertyType.StringValue, value: "S275JR" }] },
  ],
};

describe("pesquisa de peças", () => {
  it("compara sem maiúsculas e sem espaços laterais", () => {
    expect(textMatches(" HEA200 ", "hea200", "equal")).toBe(true);
    expect(textMatches("HEA200", "hea", "equal")).toBe(false);
    expect(textMatches("HEA200", "hea", "contains")).toBe(true);
    expect(textMatches("S275JR", "   ", "equal")).toBe(false);
  });

  it("encontra pelo nome do produto e pelo perfil", () => {
    const object = toInquiredObject("m", beam, null);
    const produto = { key: "Produto||Nome", setName: "Produto", name: "Nome", label: "Nome" };
    const perfil = { key: "Perfil||Nome", setName: "Perfil", name: "Nome", label: "Nome" };
    expect(searchObjects([object], produto, "hea200", "equal")).toHaveLength(1);
    expect(searchObjects([object], perfil, "HEA200", "equal")).toHaveLength(1);
    expect(searchObjects([object], perfil, "HEB", "contains")).toHaveLength(0);
  });
});
