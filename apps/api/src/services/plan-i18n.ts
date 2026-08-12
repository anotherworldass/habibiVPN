import type { Prisma } from "@prisma/client";
import {
  normalizeAppCopyI18n,
  pickAppCopy,
  type AppCopyI18n,
} from "@habibi/shared";

export function asCopyMap(raw: unknown): AppCopyI18n {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as AppCopyI18n) };
}

function primaryFromI18n(map: AppCopyI18n, fallback = ""): string {
  return (
    pickAppCopy(map, "zh").text ||
    pickAppCopy(map, "en").text ||
    Object.values(map).find((v) => !!v?.trim()) ||
    fallback
  );
}

/**
 * Resolve plan name/description i18n + denormalized primary fields (create).
 * Accepts name_i18n / description_i18n (or camelCase) and legacy name / description (→ zh).
 */
export function resolvePlanCopyInput(input: {
  name?: string | null;
  description?: string | null;
  name_i18n?: unknown;
  description_i18n?: unknown;
  nameI18n?: unknown;
  descriptionI18n?: unknown;
}): {
  name: string;
  description: string | null;
  nameI18n: Prisma.InputJsonValue;
  descriptionI18n: Prisma.InputJsonValue;
} {
  let nameI18n = normalizeAppCopyI18n(input.name_i18n ?? input.nameI18n, 128);
  let descriptionI18n = normalizeAppCopyI18n(
    input.description_i18n ?? input.descriptionI18n,
    2000,
  );

  if (!Object.keys(nameI18n).length && input.name?.trim()) {
    nameI18n = { zh: input.name.trim().slice(0, 128) };
  }
  if (
    !Object.keys(descriptionI18n).length &&
    typeof input.description === "string" &&
    input.description.trim()
  ) {
    descriptionI18n = { zh: input.description.trim().slice(0, 2000) };
  }

  const name = primaryFromI18n(nameI18n);
  if (!name) {
    throw Object.assign(new Error("plan.name_required"), { statusCode: 400 });
  }

  const description = primaryFromI18n(descriptionI18n) || null;

  return {
    name,
    description,
    nameI18n: nameI18n as Prisma.InputJsonValue,
    descriptionI18n: descriptionI18n as Prisma.InputJsonValue,
  };
}

/**
 * Merge incoming i18n into existing.
 * - non-empty string → set/overwrite locale
 * - explicit empty string / null → clear that locale
 * - omitted locale keys → keep existing (avoids accidental wipe when client only sends zh)
 */
function mergeCopyI18nPatch(
  existing: AppCopyI18n,
  raw: unknown,
  maxLen: number,
): AppCopyI18n {
  const next = { ...existing };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return normalizeAppCopyI18n(next, maxLen);
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim().toLowerCase().slice(0, 16);
    if (!key) continue;
    if (typeof v !== "string" || !v.trim()) {
      delete next[key];
      continue;
    }
    next[key] = v.trim().slice(0, maxLen);
  }
  return normalizeAppCopyI18n(next, maxLen);
}

/** Partial update: merge i18n maps when provided; else merge legacy name/description into zh. */
export function mergePlanCopyPatch(
  existing: {
    name: string;
    description: string | null;
    nameI18n: unknown;
    descriptionI18n: unknown;
  },
  input: {
    name?: string | null;
    description?: string | null;
    name_i18n?: unknown;
    description_i18n?: unknown;
    nameI18n?: unknown;
    descriptionI18n?: unknown;
  },
): {
  name?: string;
  description?: string | null;
  nameI18n?: Prisma.InputJsonValue;
  descriptionI18n?: Prisma.InputJsonValue;
} {
  const hasNameI18n =
    input.name_i18n !== undefined || input.nameI18n !== undefined;
  const hasDescI18n =
    input.description_i18n !== undefined || input.descriptionI18n !== undefined;

  const out: {
    name?: string;
    description?: string | null;
    nameI18n?: Prisma.InputJsonValue;
    descriptionI18n?: Prisma.InputJsonValue;
  } = {};

  if (hasNameI18n || input.name !== undefined) {
    let nameI18n = hasNameI18n
      ? mergeCopyI18nPatch(
          asCopyMap(existing.nameI18n),
          input.name_i18n ?? input.nameI18n,
          128,
        )
      : asCopyMap(existing.nameI18n);
    if (!hasNameI18n && input.name != null && String(input.name).trim()) {
      nameI18n = { ...nameI18n, zh: String(input.name).trim().slice(0, 128) };
    }
    if (!Object.keys(nameI18n).length && existing.name) {
      nameI18n = { zh: existing.name };
    }
    const name = primaryFromI18n(nameI18n, existing.name);
    if (!name) {
      throw Object.assign(new Error("plan.name_required"), { statusCode: 400 });
    }
    out.name = name;
    out.nameI18n = nameI18n as Prisma.InputJsonValue;
  }

  if (hasDescI18n || input.description !== undefined) {
    let descriptionI18n = hasDescI18n
      ? mergeCopyI18nPatch(
          asCopyMap(existing.descriptionI18n),
          input.description_i18n ?? input.descriptionI18n,
          2000,
        )
      : asCopyMap(existing.descriptionI18n);
    if (!hasDescI18n) {
      if (input.description == null || input.description === "") {
        const next = { ...descriptionI18n };
        delete next.zh;
        descriptionI18n = next;
      } else if (typeof input.description === "string") {
        descriptionI18n = {
          ...descriptionI18n,
          zh: input.description.trim().slice(0, 2000),
        };
      }
    }
    const description = primaryFromI18n(descriptionI18n) || null;
    out.description = description;
    out.descriptionI18n = descriptionI18n as Prisma.InputJsonValue;
  }

  return out;
}

export function localizePlanCopy(
  plan: {
    name: string;
    description: string | null;
    nameI18n?: unknown;
    descriptionI18n?: unknown;
  },
  locale: string | null | undefined,
) {
  const nameI18n = asCopyMap(plan.nameI18n);
  const descriptionI18n = asCopyMap(plan.descriptionI18n);
  if (!Object.keys(nameI18n).length && plan.name) {
    nameI18n.zh = plan.name;
  }
  if (!Object.keys(descriptionI18n).length && plan.description) {
    descriptionI18n.zh = plan.description;
  }
  return {
    name: pickAppCopy(nameI18n, locale).text || plan.name,
    description: pickAppCopy(descriptionI18n, locale).text || plan.description,
    name_i18n: nameI18n,
    description_i18n: descriptionI18n,
  };
}
