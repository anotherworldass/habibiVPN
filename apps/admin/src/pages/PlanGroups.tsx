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
import { Button, Popconfirm, Tag } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import AppCopyI18nFields from "../components/AppCopyI18nFields";
import {
  formValuesToI18n,
  i18nToFormValues,
} from "../lib/app-copy-form";

type PlanGroup = {
  id: string;
  code: string;
  name: string;
  nameI18n?: Record<string, string>;
  enabled: boolean;
  sortOrder: number;
};

function i18nFromValues(values: Record<string, unknown>): Record<string, string> {
  return formValuesToI18n(values, "name", "full");
}

function valuesFromI18n(g: PlanGroup | null) {
  return i18nToFormValues("name", g?.nameI18n, g?.name);
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
      <AppCopyI18nFields
        context="plan_group"
        label="名称（多语言）"
        fields={[
          {
            key: "name",
            label: "名称",
            requiredZh: true,
            placeholders: { zh: "按时长付费", en: "Pay by duration" },
          },
        ]}
      />
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
