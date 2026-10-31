export interface ProjectDetails {
  id: string;
  name: string;
  location: string;
  locationLabel: string;
  address: string;
}

export interface ProjectUser {
  name: string;
  email: string;
}

const REGION_LABELS: Record<string, string> = {
  europe: "Europa",
  eu: "Europa",
  northamerica: "América do Norte",
  north_america: "América do Norte",
  us: "América do Norte",
  asia: "Ásia",
  australia: "Ásia",
};

export function locationLabel(location: string | undefined): string {
  const raw = (location ?? "").trim();
  if (!raw) return "Não indicada";
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  return REGION_LABELS[key] ?? raw;
}

export function formatUser(user: { firstName?: string; lastName?: string; email?: string } | null | undefined): ProjectUser {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return {
    name: name || "Utilizador não identificado",
    email: user?.email?.trim() ?? "",
  };
}
