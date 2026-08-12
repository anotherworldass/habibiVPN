import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSwitch,
  ProFormText,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Form, Input, Popconfirm, Tabs, Tag } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { APP_COPY_LOCALES } from "@habibi/shared";
import { adminFetch } from "../lib/api";

type PlanGroup = {
  id: string;
  code: string;
  name: string;
  nameI18n?: Record<string, string>;
  enabled: boolean;
  sortOrder: number;
};

function i18nFromValues(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const loc of APP_COPY_LOCALES) {
    const v = values[`name_${loc.code}`];
    out[loc.code] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}

function valuesFromI18n(g: PlanGroup | null) {
  const fields: Record<string, string> = {};
  for (const loc of APP_COPY_LOCALES) {
    fields[`name_${loc.code}`] =
      g?.nameI18n?.[loc.code] || (loc.code === "zh" ? g?.name || "" : "");
  }
  return fields;
}

export default function PlanGroupsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlanGroup | null>(null);

  const reload = () => actionRef.current?.reload();

  const columns: ProColumns<PlanGroup>[] = [
    { title: "排序", dataIndex: "sortOrder", width: 70, search: false },
    { title: "code", dataIndex: "code", copyable: true },
    {
      title: "名称",
      dataIndex: "name",
      render: (_, r) => r.nameI18n?.zh || r.nameI18n?.en || r.name,
    },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 90,
      valueType: "select",
      valueEnum: {
        true: { text: "启用", status: "Success" },
        false: { text: "禁用", status: "Default" },
      },
      render: (_, r) =>
        r.enabled ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>,
    },
    {
      title: "操作",
      valueType: "option",
      width: 160,
      render: (_, r) => [
        <a key="edit" onClick={() => setEditing(r)}>
          编辑
        </a>,
        <Popconfirm
          key="del"
          title="删除分组？所属套餐将变为无分组"
          onConfirm={async () => {
            await adminFetch(`/admin/v1/plan-groups/${r.id}`, {
              method: "DELETE",
            });
            message.success("已删除");
            reload();
          }}
        >
          <a style={{ color: "var(--ant-color-error)" }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  const formFields = (
    <>
      <ProFormText
        name="code"
        label="code"
        rules={[{ required: true, message: "必填" }]}
        disabled={!!editing}
        tooltip="项目内唯一，如 duration / traffic"
      />
      <Form.Item label="名称（多语言）" required>
        <Tabs
          items={APP_COPY_LOCALES.map((loc) => ({
            key: loc.code,
            label: loc.label,
            children: (
              <Form.Item
                name={`name_${loc.code}`}
                rules={
                  loc.code === "zh"
                    ? [{ required: true, message: "至少填写中文名称" }]
                    : undefined
                }
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder={
                    loc.code === "zh" ? "按时长付费" : "Pay by duration"
                  }
                />
              </Form.Item>
            ),
          }))}
        />
      </Form.Item>
      <ProFormDigit name="sortOrder" label="排序" initialValue={0} />
      <ProFormSwitch name="enabled" label="启用" initialValue />
    </>
  );

  return (
    <PageContainer
      title="套餐分组"
      subTitle="目录展示分组（如按时长 / 按流量）；套餐可归属一组或保持无分组"
    >
      <ProTable<PlanGroup>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        toolBarRender={() => [
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建分组
          </Button>,
        ]}
        request={async () => {
          const data = await adminFetch<{ groups: PlanGroup[] }>(
            "/admin/v1/plan-groups",
          );
          return {
            data: data.groups || [],
            success: true,
            total: (data.groups || []).length,
          };
        }}
      />

      <ModalForm
        title="新建套餐分组"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnClose: true, width: 520 }}
        initialValues={{ enabled: true, sortOrder: 0 }}
        onFinish={async (values) => {
          await adminFetch("/admin/v1/plan-groups", {
            method: "POST",
            body: JSON.stringify({
              code: values.code,
              nameI18n: i18nFromValues(values),
              enabled: !!values.enabled,
              sortOrder: Number(values.sortOrder ?? 0),
            }),
          });
          message.success("已创建");
          reload();
          return true;
        }}
      >
        {formFields}
      </ModalForm>

      <ModalForm
        title="编辑套餐分组"
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        modalProps={{ destroyOnClose: true, width: 520 }}
        initialValues={
          editing
            ? {
                ...editing,
                ...valuesFromI18n(editing),
              }
            : undefined
        }
        onFinish={async (values) => {
          if (!editing) return false;
          await adminFetch(`/admin/v1/plan-groups/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              nameI18n: i18nFromValues(values),
              enabled: !!values.enabled,
              sortOrder: Number(values.sortOrder ?? 0),
            }),
          });
          message.success("已保存");
          setEditing(null);
          reload();
          return true;
        }}
      >
        {formFields}
      </ModalForm>
    </PageContainer>
  );
}
