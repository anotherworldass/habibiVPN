import type { ClientChannel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { CLIENT_CHANNELS } from "./catalog.js";
import { findPackageByName } from "./app-update.js";

export const DEFAULT_PROJECT_ID = "habibi";
export const DEFAULT_PROJECT_CODE = "habibi";

export type ResolvedSource = {
  projectId: string;
  projectCode: string;
  sourceSiteId: string | null;
  sourcePackageId: string | null;
  sourceClient: ClientChannel | null;
};

type ResolveInput = {
  projectCode?: string | null;
  packageName?: string | null;
  siteHost?: string | null;
  client?: string | null;
  platform?: string | null;
};

function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  if (h.startsWith("http://") || h.startsWith("https://")) {
    try {
      h = new URL(h).hostname;
    } catch {
      /* keep */
    }
  }
  // strip port
  h = h.split(":")[0] || h;
  if (!h || h === "null" || h === "undefined") return null;
  return h;
}

function parseClient(raw: string | null | undefined): ClientChannel | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if ((CLIENT_CHANNELS as string[]).includes(v)) return v as ClientChannel;
  return null;
}

/** Ensure default project exists (id=habibi). */
export async function seedDefaultProjectIfNeeded(): Promise<void> {
  await prisma.project.upsert({
    where: { id: DEFAULT_PROJECT_ID },
    create: {
      id: DEFAULT_PROJECT_ID,
      code: DEFAULT_PROJECT_CODE,
      name: "HabibiVPN",
      enabled: true,
      remark: "默认项目（存量数据迁移）",
    },
    update: {},
  });

  // Local hosts for H5 attribution in dev
  for (const [id, host, name] of [
    ["site_habibi_localhost", "localhost", "本地 H5"],
    ["site_habibi_127", "127.0.0.1", "本地 H5 127"],
  ] as const) {
    await prisma.projectSite.upsert({
      where: { host },
      create: {
        id,
        projectId: DEFAULT_PROJECT_ID,
        name,
        host,
        enabled: true,
      },
      update: {},
    });
  }
}

/**
 * Resolve project + attribution from package / site host / project code.
 * Priority: packageName → siteHost → projectCode → default habibi.
 */
export async function resolveSource(input: ResolveInput): Promise<ResolvedSource> {
  await seedDefaultProjectIfNeeded();
  const client = parseClient(input.client);
  const packageName = input.packageName?.trim() || null;
  const host = normalizeHost(input.siteHost);
  const projectCode = input.projectCode?.trim().toLowerCase() || null;

  if (packageName) {
    const pkg = await findPackageByName(packageName, {
      client,
      platform: input.platform,
    });
    if (!pkg || !pkg.enabled) {
      throw Object.assign(new Error("project.package_unknown"), { statusCode: 400 });
    }
    const project = await prisma.project.findUnique({
      where: { id: pkg.projectId },
    });
    if (!project || !project.enabled) {
      throw Object.assign(new Error("project.package_unknown"), { statusCode: 400 });
    }
    return {
      projectId: pkg.projectId,
      projectCode: project.code,
      sourceSiteId: null,
      sourcePackageId: pkg.id,
      sourceClient: client || pkg.client,
    };
  }

  if (host) {
    const site = await prisma.projectSite.findUnique({
      where: { host },
      include: { project: true },
    });
    if (site && site.enabled && site.project.enabled) {
      return {
        projectId: site.projectId,
        projectCode: site.project.code,
        sourceSiteId: site.id,
        sourcePackageId: null,
        sourceClient: client || "h5",
      };
    }
  }

  if (projectCode) {
    const project = await prisma.project.findUnique({ where: { code: projectCode } });
    if (!project || !project.enabled) {
      throw Object.assign(new Error("project.not_found"), { statusCode: 404 });
    }
    return {
      projectId: project.id,
      projectCode: project.code,
      sourceSiteId: null,
      sourcePackageId: null,
      sourceClient: client,
    };
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: DEFAULT_PROJECT_ID },
  });
  return {
    projectId: project.id,
    projectCode: project.code,
    sourceSiteId: null,
    sourcePackageId: null,
    sourceClient: client,
  };
}

/** Extract attribution hints from a Fastify-like request. */
export function sourceHintsFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
  query?: unknown;
}): ResolveInput {
  const h = req.headers;
  const q = (req.query || {}) as Record<string, string | undefined>;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  return {
    projectCode:
      one(h["x-habibi-project"]) || q.project || q.project_code || null,
    packageName:
      one(h["x-habibi-package"]) || q.package || q.package_name || null,
    siteHost:
      one(h["x-habibi-site-host"]) ||
      one(h["x-forwarded-host"]) ||
      one(h.origin)?.replace(/^https?:\/\//, "") ||
      one(h.host) ||
      q.host ||
      null,
    client: one(h["x-habibi-client"]) || q.client || null,
    platform:
      one(h["x-habibi-platform"]) ||
      one(h["x-habibi-os"]) ||
      q.platform ||
      null,
  };
}

export type ProjectView = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  remark: string | null;
  siteCount: number;
  packageCount: number;
  userCount: number;
  planCount: number;
};

export async function listProjects(): Promise<ProjectView[]> {
  await seedDefaultProjectIfNeeded();
  const rows = await prisma.project.findMany({
    include: {
      _count: { select: { sites: true, packages: true, users: true, plans: true } },
    },
    orderBy: [{ code: "asc" }],
  });
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    enabled: p.enabled,
    remark: p.remark,
    siteCount: p._count.sites,
    packageCount: p._count.packages,
    userCount: p._count.users,
    planCount: p._count.plans,
  }));
}

export async function getProjectOrThrow(idOrCode: string) {
  const p = await prisma.project.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
  });
  if (!p) {
    throw Object.assign(new Error("project.not_found"), { statusCode: 404 });
  }
  return p;
}

export async function createProject(input: {
  code: string;
  name: string;
  remark?: string | null;
  /** Copy sellable plans from this project (default: habibi) */
  copyPlansFromProjectId?: string | null;
}): Promise<ProjectView & { plans_copied?: number }> {
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(code)) {
    throw Object.assign(new Error("project.code_invalid"), { statusCode: 400 });
  }
  try {
    const p = await prisma.project.create({
      data: {
        code,
        name: input.name.trim(),
        remark: input.remark ?? null,
        enabled: true,
      },
    });

    const { seedReferralConfigForProject } = await import("./referral/config.js");
    const { seedPromoGroupsForProject } = await import("./referral/groups.js");
    await seedReferralConfigForProject(p.id);
    await seedPromoGroupsForProject(p.id);

    let plansCopied = 0;
    const copyFrom = input.copyPlansFromProjectId;
    if (copyFrom !== null) {
      const fromId = copyFrom || DEFAULT_PROJECT_ID;
      const { copyPlansBetweenProjects } = await import("./plan-copy.js");
      const result = await copyPlansBetweenProjects(fromId, p.id);
      plansCopied = result.copied;
    }

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      enabled: p.enabled,
      remark: p.remark,
      siteCount: 0,
      packageCount: 0,
      userCount: 0,
      planCount: plansCopied,
      plans_copied: plansCopied,
    };
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw Object.assign(new Error("project.code_conflict"), { statusCode: 409 });
    }
    throw err;
  }
}

export async function updateProject(
  id: string,
  input: { name?: string; enabled?: boolean; remark?: string | null },
) {
  if (id === DEFAULT_PROJECT_ID && input.enabled === false) {
    throw Object.assign(new Error("project.default_cannot_disable"), { statusCode: 400 });
  }
  try {
    return await prisma.project.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.enabled != null ? { enabled: input.enabled } : {}),
        ...(input.remark !== undefined ? { remark: input.remark } : {}),
      },
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      throw Object.assign(new Error("project.not_found"), { statusCode: 404 });
    }
    throw err;
  }
}

export function userSourceCreateData(source: ResolvedSource) {
  return {
    projectId: source.projectId,
    sourceSiteId: source.sourceSiteId,
    sourcePackageId: source.sourcePackageId,
    sourceClient: source.sourceClient,
  };
}
