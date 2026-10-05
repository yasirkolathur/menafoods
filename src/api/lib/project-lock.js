export const CATALYST_PROJECT = Object.freeze({
  id: "17990000000237407",
  name: "menafoodscustomermiddleware",
  environment: "Development",
  orgId: 809407193
});

export function assertCatalystProject(target = {}) {
  const id = String(target.projectId ?? target.id ?? "");
  const name = target.projectName ?? target.name ?? CATALYST_PROJECT.name;
  const environment = target.environment ?? CATALYST_PROJECT.environment;

  if (id !== CATALYST_PROJECT.id) {
    const error = new Error("catalyst_project_mismatch");
    error.status = 409;
    throw error;
  }
  if (name && name !== CATALYST_PROJECT.name) {
    const error = new Error("catalyst_project_name_mismatch");
    error.status = 409;
    throw error;
  }
  if (environment !== "Development") {
    const error = new Error("development_environment_required");
    error.status = 409;
    throw error;
  }
  return CATALYST_PROJECT;
}
