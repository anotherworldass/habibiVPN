import { QrcodeOutlined } from "@ant-design/icons";
import { Button, Popover, QRCode, Typography } from "antd";

type Props = {
  url?: string | null;
  label?: string;
  ellipsis?: boolean | { rows: number };
};

export function CopyableUrlWithQr({ url, label, ellipsis }: Props) {
  if (!url) return <span>—</span>;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        width: "100%",
      }}
    >
      <Typography.Paragraph
        copyable
        ellipsis={ellipsis}
        style={{
          marginBottom: 0,
          wordBreak: "break-all",
          fontSize: 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        {url}
      </Typography.Paragraph>
      <Popover
        trigger="click"
        placement="leftTop"
        title={label ? `${label} · 扫码导入` : "扫码导入"}
        content={
          <div style={{ width: 200, textAlign: "center" }}>
            <QRCode value={url} size={200} bordered={false} errorLevel="M" />
            <Typography.Text
              type="secondary"
              style={{ display: "block", marginTop: 8, fontSize: 12 }}
            >
              用客户端扫描此码
            </Typography.Text>
          </div>
        }
      >
        <Button
          type="link"
          size="small"
          icon={<QrcodeOutlined />}
          style={{ paddingInline: 0, height: 22, flexShrink: 0 }}
        >
          二维码
        </Button>
      </Popover>
    </div>
  );
}
