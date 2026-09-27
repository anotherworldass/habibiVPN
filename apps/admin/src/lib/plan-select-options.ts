export type GroupedSelectOption = {
  label: string;
  options: { label: string; value: string }[];
};

type LocalPlan = {
  id: string;
  name: string;
  code: string;
  enabled?: boolean;
  nameI18n?: Record<string, string>;
  group?: {
    id: string;
    name: string;
    enabled: boolean;
    sortOrder: number;
  } | null;
};

type UpstreamPlan = {
  code: string;
  name: string;
  type?: string;
  enabled?: boolean;
};

function planLabel(name: string, code: string, enabled?: boolean) {
  return `${name} (${code})${enabled === false ? "（已停用）" : ""}`;
}

/** Group local sell plans by 套餐分组. Ungrouped plans stay under「无分组」. */
export function groupLocalPlanOptions(plans: LocalPlan[]): GroupedSelectOption[] {
  const buckets = new Map<
    string,
    { label: string; sort: number; options: { label: string; value: string }[] }
  >();

  for (const plan of plans) {
    const name = plan.nameI18n?.zh || plan.nameI18n?.en || plan.name;
    const option = {
      label: planLabel(name, plan.code, plan.enabled),
      value: plan.id,
    };
    const group = plan.group;
    const key = group?.id || "__none__";
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        label: group
          ? `${group.name}${group.enabled ? "" : "（已禁用）"}`
          : "无分组",
        sort: group ? (group.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER,
        options: [],
      };
      buckets.set(key, bucket);
    }
    bucket.options.push(option);
  }

  return [...buckets.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "zh"))
    .map(({ label, options }) => ({ label, options }));
}

/** Group WireRaw customer plans into 时长 / 流量. */
export function groupUpstreamPlanOptions(
  plans: UpstreamPlan[],
): GroupedSelectOption[] {
  const duration: GroupedSelectOption["options"] = [];
  const traffic: GroupedSelectOption["options"] = [];
  for (const plan of plans) {
    const option = {
      label: planLabel(plan.name, plan.code, plan.enabled),
      value: plan.code,
    };
    if (plan.type === "traffic") traffic.push(option);
    else duration.push(option);
  }
  const groups: GroupedSelectOption[] = [];
  if (duration.length) groups.push({ label: "时长", options: duration });
  if (traffic.length) groups.push({ label: "流量", options: traffic });
  return groups;
}
