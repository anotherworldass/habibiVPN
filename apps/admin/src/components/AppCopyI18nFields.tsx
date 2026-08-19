import { useState } from "react";
import { TranslationOutlined } from "@ant-design/icons";
import { APP_COPY_LOCALES } from "@habibi/shared";
import { Button, Form, Input, Modal, Space, Tabs, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { adminFetch, ApiError } from "../lib/api";
import { message } from "../lib/antd-message";

export type AppCopyField = {
  key: string;
  label: string;
  input?: "input" | "textarea";
  rows?: number;
  requiredZh?: boolean;
  placeholders?: Partial<Record<string, string>>;
};

type TranslationResponse = {
  translations: Record<string, Record<string, string>>;
};

export default function AppCopyI18nFields({
  fields,
  context,
  label = "多语言文案",
}: {
  fields: AppCopyField[];
  context: "plan_group" | "plan" | "announcement" | "campaign" | "release";
  label?: string;
}) {
  const form = Form.useFormInstance();
  const navigate = useNavigate();
  const [translating, setTranslating] = useState(false);
  const targetLocales = APP_COPY_LOCALES.filter(
    (locale) => locale.code !== "zh",
  );

  const runTranslate = async (overwrite: boolean) => {
    const sourceFields = Object.fromEntries(
      fields
        .map((field) => [
          field.key,
          String(form.getFieldValue(`${field.key}_zh`) || "").trim(),
        ])
        .filter(([, value]) => Boolean(value)),
    );
    if (!Object.keys(sourceFields).length) {
      message.warning("请先填写中文文案");
      return;
    }
    if (!targetLocales.length) {
      message.info("当前没有需要翻译的目标语言");
      return;
    }
    setTranslating(true);
    try {
      const response = await adminFetch<TranslationResponse>(
        "/admin/v1/translate/copy",
        {
          method: "POST",
          body: JSON.stringify({
            source_locale: "zh",
            target_locales: targetLocales.map((locale) => locale.code),
            fields: sourceFields,
            context,
          }),
        },
      );
      const patch: Record<string, string> = {};
      let filled = 0;
      let skipped = 0;
      for (const field of fields) {
        for (const locale of targetLocales) {
          const name = `${field.key}_${locale.code}`;
          const existing = String(form.getFieldValue(name) || "").trim();
          const translated = response.translations[field.key]?.[locale.code];
          if (!translated) continue;
          if (existing && !overwrite) {
            skipped += 1;
            continue;
          }
          patch[name] = translated;
          filled += 1;
        }
      }
      form.setFieldsValue(patch);
      message.success(
        skipped
          ? `已填充 ${filled} 项，保留已有译文 ${skipped} 项`
          : `已填充 ${filled} 项译文`,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.message === "llm.default_profile_unavailable"
      ) {
        Modal.confirm({
          title: "尚未配置可用的默认模型",
          content: "请先在系统设置中添加并启用模型。",
          okText: "前往设置",
          onOk: () => navigate("/settings/llm"),
        });
      } else {
        message.error(error instanceof Error ? error.message : "翻译失败");
      }
    } finally {
      setTranslating(false);
    }
  };

  const hasExistingTranslation = () =>
    fields.some((field) =>
      targetLocales.some((locale) =>
        String(form.getFieldValue(`${field.key}_${locale.code}`) || "").trim(),
      ),
    );

  return (
    <Form.Item label={label} style={{ marginBottom: 8 }}>
      <Space style={{ marginBottom: 8 }}>
        <Tooltip title="根据中文批量翻译，仅填充空白字段">
          <Button
            size="small"
            icon={<TranslationOutlined />}
            loading={translating}
            onClick={() => void runTranslate(false)}
          >
            自动翻译
          </Button>
        </Tooltip>
        <Button
          size="small"
          type="text"
          disabled={translating}
          onClick={() => {
            if (!hasExistingTranslation()) {
              void runTranslate(true);
              return;
            }
            Modal.confirm({
              title: "覆盖已有译文？",
              content: "所有目标语言字段将按当前中文内容重新翻译。",
              okText: "确认覆盖",
              okButtonProps: { danger: true },
              onOk: () => runTranslate(true),
            });
          }}
        >
          覆盖翻译
        </Button>
      </Space>
      <Tabs
        size="small"
        items={APP_COPY_LOCALES.map((locale) => ({
          key: locale.code,
          label: locale.label,
          forceRender: true,
          children: (
            <>
              {fields.map((field, index) => (
                <Form.Item
                  key={field.key}
                  name={`${field.key}_${locale.code}`}
                  label={field.label}
                  rules={
                    locale.code === "zh" && field.requiredZh
                      ? [{ required: true, message: `请填写中文${field.label}` }]
                      : undefined
                  }
                  style={{
                    marginBottom: index === fields.length - 1 ? 0 : 12,
                  }}
                >
                  {field.input === "textarea" ? (
                    <Input.TextArea
                      rows={field.rows || 3}
                      placeholder={field.placeholders?.[locale.code]}
                    />
                  ) : (
                    <Input placeholder={field.placeholders?.[locale.code]} />
                  )}
                </Form.Item>
              ))}
            </>
          ),
        }))}
      />
    </Form.Item>
  );
}
