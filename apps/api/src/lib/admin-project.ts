import type { FastifyRequest } from "fastify";
import { DEFAULT_PROJECT_ID, getProjectOrThrow } from "../services/project.js";

/** Resolve current admin project from X-Admin-Project-Id / query.project_id */
export async function resolveAdminProjectId(req: FastifyRequest): Promise<string> {
  const q = req.query as { project_id?: string };
  const header = req.headers["x-admin-project-id"];
  const raw = (Array.isArray(header) ? header[0] : header) || q.project_id || DEFAULT_PROJECT_ID;
  const project = await getProjectOrThrow(String(raw).trim());
  if (!project.enabled && project.id !== DEFAULT_PROJECT_ID) {
    throw Object.assign(new Error("project.disabled"), { statusCode: 400 });
  }
  return project.id;
}
