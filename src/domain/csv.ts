import { buildInquiryTable, inquiryTableToCsv } from "./table";
import type { InquiredObject, PropItem } from "./types";

export function toCsv(objects: InquiredObject[], items: PropItem[], showUnits: boolean): string {
  return inquiryTableToCsv(buildInquiryTable(objects, items, showUnits));
}
