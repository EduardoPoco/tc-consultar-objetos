import type { ProjectDetails, ProjectUser } from "../domain/project";
import { formatUser, locationLabel } from "../domain/project";

export interface DemoProjectOptions {
  name?: string | null;
}

export const DEMO_PROJECT_NAME = "OB3270-SNF-BC Metalnord";

export function demoProject(options: DemoProjectOptions = {}): ProjectDetails {
  const name = options.name?.trim() ? options.name.trim() : DEMO_PROJECT_NAME;
  const location = "europe";
  return {
    id: "projeto-demonstracao",
    name,
    location,
    locationLabel: locationLabel(location),
    address: "Setúbal, Portugal",
  };
}

export function demoUser(): ProjectUser {
  return formatUser({ firstName: "Ana", lastName: "Martins", email: "ana.martins@exemplo.pt" });
}
