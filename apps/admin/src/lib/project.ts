const PROJECT_KEY = "habibi_admin_project_id";

export type AdminProject = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
};

export function getProjectId(): string {
  return localStorage.getItem(PROJECT_KEY) || "habibi";
}

export const PROJECT_CHANGE_EVENT = "habibi-admin-project";

export function setProjectId(id: string) {
  localStorage.setItem(PROJECT_KEY, id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROJECT_CHANGE_EVENT, { detail: id }));
  }
}

export function clearProjectId() {
  localStorage.removeItem(PROJECT_KEY);
}
