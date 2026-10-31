import { describe, expect, it } from "vitest";
import { planColors } from "../../src/domain/palette";
import { PropertyType, type InquiredObject, type PropItem } from "../../src/domain/types";

const item: PropItem = { key: "Fabrico||Corte · %", setName: "Fabrico", name: "Corte · %", label: "Corte · %" };

function object(title: string, value: string): InquiredObject {
  return {
    modelId: "demonstracao",
    runtimeId: title.length,
    title,
    className: "IfcElement",
    box: null,
    raw: {
      id: title.length,
      properties: [{ name: "Fabrico", properties: [{ name: "Corte · %", type: PropertyType.StringValue, value }] }],
    },
  };
}

describe("cores de fabrico", () => {
  it("usa um gradiente para percentagens", () => {
    const plan = planColors([object("A", "0%"), object("B", "100%"), object("C", "50%")], item, "auto");
    expect(plan.scale).toBe("gradient");
    expect(plan.legend.map((stop) => stop.label)).toEqual(["0%", "50%", "100%"]);
    expect(new Set(plan.colors.map((entry) => entry.color)).size).toBe(3);
  });

  it("dá uma cor por categoria ao texto", () => {
    const machine: PropItem = { key: "Fabrico||Máquina", setName: "Fabrico", name: "Máquina", label: "Máquina" };
    const withMachine = (title: string, value: string): InquiredObject => ({
      ...object(title, ""),
      raw: {
        id: title.length,
        properties: [{ name: "Fabrico", properties: [{ name: "Máquina", type: PropertyType.StringValue, value }] }],
      },
    });
    const plan = planColors([
      withMachine("A", "Trumpf Laser"),
      withMachine("B", "Vernet"),
      withMachine("C", "Trumpf Laser"),
    ], machine, "auto");
    expect(plan.scale).toBe("categories");
    expect(plan.legend.map((stop) => stop.label).sort()).toEqual(["Trumpf Laser", "Vernet"]);
    expect(plan.colors[0].color).toBe(plan.colors[2].color);
    expect(plan.colors[0].color).not.toBe(plan.colors[1].color);
  });
});
