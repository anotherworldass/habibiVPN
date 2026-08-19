import { useEffect, useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDateTimePicker,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Tag } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import AppCopyI18nFields from "../components/AppCopyI18nFields";
import {
  formValuesToI18n,
  i18nToFormValues,
} from "../lib/app-copy-form";

type Announcement = {
  id: string;
  code: string | null;
  type: "modal" | "banner" | "top_bar";
  status: "draft" | "published" | "archived";
  title_i18n: Record<string, string>;
  body_i18n: Record<string, string>;
  action_url: string | null;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  dismissible: boolean;
  repeat: "once" | "every_launch";
  remark: string | null;
  clients: Array<{ client: string; enabled: boolean }>;
  package_ids: string[];
  site_ids: string[];
};

type Meta = {
  clients: string[];
  packages: Array<{
    id: string;
    name: string;
    packageName: string;
    client: string;
    enabled: boolean;
  }>;
  sites: Array<{ id: string; name: string; host: string; enabled: boolean }>;
};

const CLIENT_LABELS: Record<string, string> = {
  h5: "H5 / 网站",
  ios_appstore: "iOS App Store",
  ios_alt: "iOS 企业签/侧载",
  android_play: "Android Play",
  android_direct: "Android 非商店",
  windows: "Windows",
  macos: "macOS",
};

const statusColor: Record<string, string> = {
  draft: "default",
  published: "success",
  archived: "warning",
};

const typeLabel: Record<string, string> = {
  modal: "弹窗",
  banner: "横幅",
  top_bar: "顶栏",
};

function i18nFromValues(
  values: Record<string, unknown>,
  field: "title" | "body",
): Record<string, string> {
  return formValuesToI18n(values, field, "sparse");
}

function valuesFromI18n(row: Announcement | null) {
  return {
    ...i18nToFormValues("title", row?.title_i18n),
    ...i18nToFormValues("body", row?.body_i18n),
  };
}

export default function AnnouncementsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [meta, setMeta] = useState<Meta>({ clients: [], packages: [], sites: [] });

  useEffect(() => {
    void adminFetch<Meta>("/admin/v1/announcements/meta")
      .then((r) =>
        setMeta({
          clients: r.clients || [],
          packages: r.packages || [],
          sites: r.sites || [],
        }),
      )
      .catch(() => setMeta({ clients: [], packages: [], sites: [] }));
  }, []);

  const columns: ProColumns<Announcement>[] = [
    {
      title: "code",
      dataIndex: "code",
      copyable: true,
      width: 180,
      ellipsis: true,
      render: (_, r) => r.code || "—",
    },
    {
      title: "标题",
      search: false,
      ellipsis: true,
      render: (_, r) => r.title_i18n?.zh || r.title_i18n?.en || "—",
    },
    {
      title: "类型",
      dataIndex: "type",
      valueEnum: {
        modal: { text: "弹窗" },
        banner: { text: "横幅" },
        top_bar: { text: "顶栏" },
      },
      render: (_, r) => typeLabel[r.type] || r.type,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueEnum: {
        draft: { text: "draft" },
        published: { text: "published" },
        archived: { text: "archived" },
      },
      render: (_, r) => <Tag color={statusColor[r.status]}>{r.status}</Tag>,
    },
    {
      title: "投放端",
      search: false,
      render: (_, r) => {
        const enabled = r.clients.filter((c) => c.enabled).map((c) => c.client);
        if (!enabled.length) return <Tag>全部端</Tag>;
        return enabled.map((c) => (
          <Tag key={c}>{CLIENT_LABELS[c] || c}</Tag>
        ));
      },
    },
    {
      title: "重复",
      dataIndex: "repeat",
      search: false,
      width: 110,
      render: (_, r) =>
        r.repeat === "every_launch" ? (
          <Tag color="blue">每次启动</Tag>
        ) : (
          <Tag>关后不再</Tag>
        ),
    },
    {
      title: "优先级",
      dataIndex: "priority",
      search: false,
      width: 80,
    },
    {
      title: "操作",
      valueType: "option",
      width: 220,
      render: (_, row) => [
        <a
          key="edit"
          onClick={() => {
            setEditing(row);
            setCreateOpen(true);
          }}
        >
          编辑
        </a>,
        row.status !== "published" ? (
          <a
            key="pub"
            onClick={async () => {
              await adminFetch(`/admin/v1/announcements/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "published" }),
              });
              message.success("已发布");
              actionRef.current?.reload();
            }}
          >
            发布
          </a>
        ) : (
          <a
            key="arch"
            onClick={async () => {
              await adminFetch(`/admin/v1/announcements/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "archived" }),
              });
              message.success("已归档");
              actionRef.current?.reload();
            }}
          >
            归档
          </a>
        ),
        <a
          key="del"
          style={{ color: "#cf1322" }}
          onClick={async () => {
            await adminFetch(`/admin/v1/announcements/${row.id}`, {
              method: "DELETE",
            });
            message.success("已删除");
            actionRef.current?.reload();
          }}
        >
          删除
        </a>,
      ],
    },
  ];

  return (
    <PageContainer
      header={{
        title: "公告 / 通知条",
        subTitle: "面向 App 与 H5/网站的广播公告；个人站内信后续另做",
      }}
    >
      <ProTable<Announcement>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={{ labelWidth: "auto" }}
        toolBarRender={() => [
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setCreateOpen(true);
            }}
          >
            新建公告
          </Button>,
        ]}
        request={async (params) => {
          const qs = new URLSearchParams();
          if (params.status) qs.set("status", String(params.status));
          if (params.type) qs.set("type", String(params.type));
          const res = await adminFetch<{ announcements: Announcement[] }>(
            `/admin/v1/announcements?${qs.toString()}`,
          );
          return { data: res.announcements || [], success: true };
        }}
      />

      <ModalForm
        title={editing ? "编辑公告" : "新建公告"}
        open={createOpen}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => {
            setCreateOpen(false);
            setEditing(null);
          },
          width: 720,
        }}
        initialValues={
          editing
            ? {
                code: editing.code,
                type: editing.type,
                status: editing.status,
                priority: editing.priority,
                action_url: editing.action_url,
                dismissible: editing.dismissible,
                repeat: editing.repeat || "once",
                remark: editing.remark,
                start_at: editing.start_at,
                end_at: editing.end_at,
                clients: editing.clients.filter((c) => c.enabled).map((c) => c.client),
                package_ids: editing.package_ids,
                site_ids: editing.site_ids,
                ...valuesFromI18n(editing),
              }
            : {
                type: "banner",
                status: "draft",
                priority: 0,
                dismissible: true,
                repeat: "once",
                clients: ["h5", "ios_appstore", "android_play", "android_direct"],
                ...valuesFromI18n(null),
              }
        }
        onFinish={async (values) => {
          const body = {
            type: values.type,
            status: values.status,
            priority: Number(values.priority || 0),
            action_url: values.action_url?.trim() || null,
            dismissible: !!values.dismissible,
            repeat: values.repeat || "once",
            remark: values.remark || null,
            start_at: values.start_at
              ? new Date(values.start_at).toISOString()
              : null,
            end_at: values.end_at ? new Date(values.end_at).toISOString() : null,
            title_i18n: i18nFromValues(values, "title"),
            body_i18n: i18nFromValues(values, "body"),
            clients: (values.clients as string[] | undefined)?.map((client) => ({
              client,
              enabled: true,
            })),
            package_ids: values.package_ids || [],
            site_ids: values.site_ids || [],
          };
          if (editing) {
            await adminFetch(`/admin/v1/announcements/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
            message.success("已更新");
          } else {
            await adminFetch("/admin/v1/announcements", {
              method: "POST",
              body: JSON.stringify(body),
            });
            message.success("已创建");
          }
          setCreateOpen(false);
          setEditing(null);
          actionRef.current?.reload();
          return true;
        }}
      >
        {editing?.code ? (
          <ProFormText
            name="code"
            label="内部 code"
            disabled
            extra="创建时按时间自动生成，不可改"
          />
        ) : (
          <div style={{ marginBottom: 16, color: "rgba(0,0,0,0.45)", fontSize: 12 }}>
            内部 code 将在创建时按时间自动生成（如 ann_20260727_233045_a1b2）
          </div>
        )}
        <ProFormSelect
          name="type"
          label="展示类型"
          rules={[{ required: true }]}
          options={[
            { value: "modal", label: "弹窗 modal" },
            { value: "banner", label: "横幅 banner" },
            { value: "top_bar", label: "顶栏 top_bar" },
          ]}
        />
        <ProFormSelect
          name="status"
          label="状态"
          rules={[{ required: true }]}
          options={[
            { value: "draft", label: "draft" },
            { value: "published", label: "published" },
            { value: "archived", label: "archived" },
          ]}
        />
        <ProFormDigit name="priority" label="优先级" min={0} extra="数字越大越靠前" />
        <ProFormSelect
          name="clients"
          label="投放端"
          mode="multiple"
          options={meta.clients.map((c) => ({
            value: c,
            label: CLIENT_LABELS[c] || c,
          }))}
          extra="不选 = 全部端；选 H5 可覆盖网站，选 App 端覆盖客户端"
        />
        <ProFormSelect
          name="package_ids"
          label="限定 App 包（可选）"
          mode="multiple"
          options={meta.packages.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.packageName})`,
          }))}
          extra="不选 = 不限制包名；选中后仅这些马甲可见"
        />
        <ProFormSelect
          name="site_ids"
          label="限定 H5 站点（可选）"
          mode="multiple"
          options={meta.sites.map((s) => ({
            value: s.id,
            label: `${s.name} (${s.host})`,
          }))}
          extra="不选 = 不限制站点；选中后仅这些域名可见"
        />
        <ProFormDateTimePicker name="start_at" label="开始时间" />
        <ProFormDateTimePicker name="end_at" label="结束时间" />
        <ProFormText name="action_url" label="点击跳转链接" placeholder="https://..." />
        <ProFormSwitch name="dismissible" label="允许关闭" />
        <ProFormSelect
          name="repeat"
          label="关闭后行为"
          rules={[{ required: true }]}
          options={[
            { value: "once", label: "once · 关闭后不再显示" },
            {
              value: "every_launch",
              label: "every_launch · 每次冷启动可再显示（至过期/归档）",
            },
          ]}
          extra="与「允许关闭」独立：every_launch 仅当次会话内不重复弹，下次启动仍会出"
        />

        <AppCopyI18nFields
          context="announcement"
          fields={[
            {
              key: "title",
              label: "标题",
              placeholders: { zh: "系统维护通知", en: "Maintenance notice" },
            },
            {
              key: "body",
              label: "正文",
              input: "textarea",
              rows: 4,
              placeholders: {
                zh: "我们将于今晚进行维护…",
                en: "We will perform maintenance tonight…",
              },
            },
          ]}
        />

        <ProFormTextArea name="remark" label="备注（仅后台）" />
      </ModalForm>
    </PageContainer>
  );
}
