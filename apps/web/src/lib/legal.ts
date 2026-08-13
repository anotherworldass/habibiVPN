import type { SiteLocale } from "./locale";
import { site } from "./site";

export type LegalBlock = {
  h3: string;
  paragraphs?: string[];
  list?: string[];
  muted?: string[];
};

export type LegalDoc = {
  title: string;
  lead: string;
  updatedLabel: string;
  blocks: LegalBlock[];
  footerAccount: string;
  footerHome: string;
  switchToZh: string;
  switchToEn: string;
  relatedPrivacy: string;
  relatedTerms: string;
  relatedSupport: string;
};

const privacyZh = (): LegalDoc => ({
  title: "隐私条款",
  lead: `${site.brand} 重视你的隐私。本页说明我们如何收集、使用与保护信息。`,
  updatedLabel: "最近更新：2026-07-29",
  footerAccount: "返回我的",
  footerHome: "回首页",
  switchToZh: "中文",
  switchToEn: "English",
  relatedPrivacy: "隐私条款",
  relatedTerms: "用户协议",
  relatedSupport: "联系客服",
  blocks: [
    {
      h3: "适用范围",
      paragraphs: [
        `本条款适用于 ${site.brand} 网站、App 及相关服务。继续使用服务，即表示你已阅读并理解本条款。`,
      ],
    },
    {
      h3: "我们收集的信息",
      list: [
        "账号信息：注册 / 登录邮箱、密码哈希、邀请关系等账号必要字段。",
        "服务信息：套餐、订阅状态、订单与支付结果（由支付渠道回传的必要字段）、设备侧用于开通服务的标识。",
        "客户端本地数据：订阅配置、节点延迟、连接状态与脱敏诊断日志等，主要用于本机展示与排障；默认不上传浏览内容或通信内容。",
        "技术日志：为保障可用性与安全，服务器可能记录请求时间、IP、接口错误等基础运维日志，并按最短必要期限保留。",
      ],
    },
    {
      h3: "我们不会做什么",
      list: [
        "不会出售你的个人信息",
        "不会出于广告画像目的追踪你的上网内容",
        "不会要求你提供与服务无关的敏感身份材料（法律或支付合规另有要求的除外）",
      ],
    },
    {
      h3: "使用目的",
      paragraphs: ["我们仅在提供服务所必需的范围内处理信息，包括："],
      list: [
        "创建与维护账号、开通与续订套餐",
        "建立 VPN 连接、展示订阅与节点状态",
        "处理支付、退款与客服咨询",
        "防范滥用、欺诈与安全风险",
        "改进稳定性与排查故障",
      ],
    },
    {
      h3: "共享与第三方",
      paragraphs: [
        "仅在完成服务所必要时与第三方共享有限信息，例如支付处理方、基础设施与邮件发送服务。我们要求其仅按约定用途处理数据。",
      ],
      muted: ["请勿将订阅链接分享给他人，以免账号被滥用或产生异常流量。"],
    },
    {
      h3: "你的控制权",
      list: [
        "可在客户端清除本地缓存与诊断日志",
        "卸载应用会移除应用本地数据",
        "如需注销账号或导出与账号相关的信息，请通过联系客服提出申请",
      ],
    },
    {
      h3: "数据安全与保存",
      paragraphs: [
        "我们采取合理的技术与管理措施保护数据，但互联网传输无法保证绝对安全。账号相关数据在服务存续期间及法律要求的合理期限内保存；超出必要期限后将删除或匿名化处理。",
      ],
    },
    {
      h3: "条款更新",
      paragraphs: [
        "我们可能更新本隐私条款。重大变更会在网站或客户端以合理方式提示。更新后继续使用服务，即视为接受修订内容。",
      ],
    },
    {
      h3: "联系我们",
      paragraphs: [
        `隐私相关问题请发邮件至 ${site.supportEmail}，或前往联系客服。也可参阅用户协议。`,
      ],
    },
  ],
});

const privacyEn = (): LegalDoc => ({
  title: "Privacy Policy",
  lead: `${site.brand} respects your privacy. This page explains what we collect, how we use it, and how we protect it.`,
  updatedLabel: "Last updated: 2026-07-29",
  footerAccount: "My account",
  footerHome: "Home",
  switchToZh: "中文",
  switchToEn: "English",
  relatedPrivacy: "Privacy Policy",
  relatedTerms: "Terms of Service",
  relatedSupport: "Support",
  blocks: [
    {
      h3: "Scope",
      paragraphs: [
        `This policy applies to the ${site.brand} website, apps, and related services. By continuing to use the service, you acknowledge that you have read and understood this policy.`,
      ],
    },
    {
      h3: "Information we collect",
      list: [
        "Account data: email used for sign-up/login, password hashes, and invite relationships needed to operate your account.",
        "Service data: plans, subscription status, order/payment results (necessary fields returned by payment providers), and device identifiers required to provision service.",
        "On-device client data: subscription config, node latency, connection state, and redacted diagnostics for local display and troubleshooting. Browsing or communication content is not uploaded by default.",
        "Technical logs: to keep the service available and secure, servers may record request time, IP, and API errors for the shortest practical retention period.",
      ],
    },
    {
      h3: "What we do not do",
      list: [
        "We do not sell your personal information",
        "We do not track your browsing content for advertising profiles",
        "We do not ask for sensitive identity documents unrelated to the service (except where required by law or payment compliance)",
      ],
    },
    {
      h3: "How we use information",
      paragraphs: ["We process information only as needed to provide the service, including to:"],
      list: [
        "Create and maintain accounts, and activate or renew plans",
        "Establish VPN connections and show subscription/node status",
        "Handle payments, refunds, and support requests",
        "Prevent abuse, fraud, and security risks",
        "Improve reliability and troubleshoot issues",
      ],
    },
    {
      h3: "Sharing and third parties",
      paragraphs: [
        "We share limited information with third parties only when necessary to deliver the service—for example payment processors, infrastructure providers, and email delivery. They may use the data only for the agreed purposes.",
      ],
      muted: [
        "Do not share your subscription URL with others; misuse can compromise your account or create abnormal traffic.",
      ],
    },
    {
      h3: "Your controls",
      list: [
        "You can clear local caches and diagnostic logs in the client",
        "Uninstalling the app removes app-local data",
        "To delete your account or export account-related information, contact support",
      ],
    },
    {
      h3: "Security and retention",
      paragraphs: [
        "We apply reasonable technical and organizational measures to protect data, but no internet transmission is perfectly secure. Account-related data is kept while the service is active and for periods required by law; afterward it is deleted or anonymized.",
      ],
    },
    {
      h3: "Policy updates",
      paragraphs: [
        "We may update this Privacy Policy. Material changes will be communicated reasonably via the website or client. Continued use after an update means you accept the revised policy.",
      ],
    },
    {
      h3: "Contact us",
      paragraphs: [
        `For privacy questions, email ${site.supportEmail} or visit Support. You may also review the Terms of Service.`,
      ],
    },
  ],
});

const termsZh = (): LegalDoc => ({
  title: "用户协议",
  lead: `使用 ${site.brand} 前，请阅读并同意以下服务条款。`,
  updatedLabel: "最近更新：2026-07-29",
  footerAccount: "返回我的",
  footerHome: "回首页",
  switchToZh: "中文",
  switchToEn: "English",
  relatedPrivacy: "隐私条款",
  relatedTerms: "用户协议",
  relatedSupport: "联系客服",
  blocks: [
    {
      h3: "协议接受",
      paragraphs: [
        `欢迎使用 ${site.brand}（下称「本服务」）。当你注册账号、登录、购买或使用客户端 / 网站功能时，即表示你已阅读、理解并同意本协议及隐私条款。`,
      ],
    },
    {
      h3: "服务说明",
      paragraphs: [
        "本服务提供个人 VPN / 网络代理相关能力，包括账号体系、套餐订阅、节点访问与客户端配套功能。具体可用地区、协议、速率与配额以你购买或领取的套餐及客户端实时展示为准。",
      ],
      muted: [
        "我们可能因维护、升级、合规或上游线路调整，对节点、功能或接口做合理变更，并尽量减少对你的影响。",
      ],
    },
    {
      h3: "账号与安全",
      list: [
        "你应提供真实、可用的注册信息，并妥善保管账号与密码",
        "因保管不善导致的账号被盗用、订阅被滥用，由你自行承担相应风险",
        "请勿将订阅链接、登录凭证分享给他人或公开传播",
        "发现异常登录或盗用，请立即修改密码并联系客服",
      ],
    },
    {
      h3: "套餐、支付与订阅",
      list: [
        "套餐时长、流量、设备数等权益以订单与账号内展示为准",
        "通过 App Store / 其他支付渠道购买时，还须遵守对应平台的支付与退款规则",
        "除非法律强制或我们书面承诺，已生效的虚拟服务权益通常不支持无理由退款",
        "活动、兑换码、邀请奖励等以当时公示规则为准，我们保留在合理范围内调整的权利",
      ],
    },
    {
      h3: "使用规范",
      paragraphs: ["你承诺合法使用本服务，不得利用服务从事以下行为（包括但不限于）："],
      list: [
        "违反适用法律法规的行为",
        "攻击、扫描、入侵他人系统或传播恶意软件",
        "侵犯他人知识产权、隐私权或其他合法权益",
        "发送垃圾信息、实施欺诈或洗钱等违法活动",
        "对服务进行倒卖、批量注册、滥用节点资源或绕过合理限制",
        "干扰、破坏服务正常运行或试图未授权访问系统",
      ],
      muted: [
        "若我们发现或合理怀疑存在违规，可限制、暂停或终止服务，并保留依法追责的权利。",
      ],
    },
    {
      h3: "免责声明",
      list: [
        "服务按「现状」提供；我们尽力保障可用，但不保证绝对不中断、无错误或满足所有特定用途",
        "因不可抗力、网络故障、上游线路、第三方平台或你自身设备 / 配置原因导致的中断或损失，我们将在法律允许范围内免责",
        "你应自行判断目标网站 / 应用的可访问性与合规性，并承担使用后果",
      ],
    },
    {
      h3: "知识产权",
      paragraphs: [
        `${site.brand} 相关的商标、界面、文案、软件与文档等权益归权利人所有。未经许可，不得复制、修改、反向工程或用于商业用途。`,
      ],
    },
    {
      h3: "协议变更与终止",
      paragraphs: [
        "我们可能更新本协议，并以网站公示或客户端提示等方式通知。若你不同意变更，应停止使用服务；继续使用视为接受更新后的协议。",
        "你可随时停止使用并申请注销账号。我们也可在你严重违约、长期未使用或服务停止运营等情形下终止或回收相关服务。",
      ],
    },
    {
      h3: "适用法律与联系",
      paragraphs: [
        "本协议的解释与争议解决，在不违反强制适用法的前提下，优先适用服务运营主体所在地法律。争议应尽量协商解决。",
        `如有疑问，请发邮件至 ${site.supportEmail}，或前往联系客服。`,
      ],
    },
  ],
});

const termsEn = (): LegalDoc => ({
  title: "Terms of Service",
  lead: `Please read and accept these terms before using ${site.brand}.`,
  updatedLabel: "Last updated: 2026-07-29",
  footerAccount: "My account",
  footerHome: "Home",
  switchToZh: "中文",
  switchToEn: "English",
  relatedPrivacy: "Privacy Policy",
  relatedTerms: "Terms of Service",
  relatedSupport: "Support",
  blocks: [
    {
      h3: "Acceptance",
      paragraphs: [
        `Welcome to ${site.brand} (the “Service”). By registering, signing in, purchasing, or using the website/app features, you confirm that you have read, understood, and agree to these Terms and the Privacy Policy.`,
      ],
    },
    {
      h3: "The Service",
      paragraphs: [
        "The Service provides personal VPN / network proxy capabilities, including accounts, plan subscriptions, node access, and companion client features. Available regions, protocols, speeds, and quotas follow the plan you purchase or claim and what the client shows in real time.",
      ],
      muted: [
        "We may reasonably change nodes, features, or APIs for maintenance, upgrades, compliance, or upstream network adjustments, and will try to minimize disruption.",
      ],
    },
    {
      h3: "Accounts and security",
      list: [
        "Provide accurate, usable registration details and keep your credentials secure",
        "You are responsible for risks from credential leakage, account takeover, or subscription misuse caused by poor custody",
        "Do not share subscription URLs or login credentials publicly or with others",
        "If you notice unusual sign-ins or misuse, change your password and contact support immediately",
      ],
    },
    {
      h3: "Plans, payments, and subscriptions",
      list: [
        "Plan duration, traffic, device limits, and other benefits follow the order and what your account shows",
        "Purchases via the App Store or other payment channels are also subject to that platform’s payment and refund rules",
        "Unless required by law or promised by us in writing, activated digital entitlements are generally non-refundable without cause",
        "Campaigns, redeem codes, and invite rewards follow the rules published at the time; we may adjust them within a reasonable scope",
      ],
    },
    {
      h3: "Acceptable use",
      paragraphs: [
        "You agree to use the Service lawfully and not to use it for any of the following (including without limitation):",
      ],
      list: [
        "Violating applicable laws or regulations",
        "Attacking, scanning, or compromising others’ systems, or distributing malware",
        "Infringing intellectual property, privacy, or other rights",
        "Spam, fraud, money laundering, or similar illegal activity",
        "Reselling the Service, bulk sign-ups, abusing node capacity, or bypassing reasonable limits",
        "Interfering with the Service or attempting unauthorized access",
      ],
      muted: [
        "If we find or reasonably suspect violations, we may limit, suspend, or terminate service and reserve the right to pursue remedies available by law.",
      ],
    },
    {
      h3: "Disclaimer",
      list: [
        "The Service is provided “as is.” We work to keep it available, but do not guarantee uninterrupted, error-free operation or fitness for every purpose",
        "To the extent permitted by law, we are not liable for interruptions or losses caused by force majeure, network faults, upstream providers, third-party platforms, or your own device/configuration",
        "You are responsible for judging whether target sites/apps are accessible and lawful for you, and for the consequences of use",
      ],
    },
    {
      h3: "Intellectual property",
      paragraphs: [
        `Trademarks, UI, copy, software, and documentation related to ${site.brand} belong to their respective owners. Without permission, you may not copy, modify, reverse engineer, or use them commercially.`,
      ],
    },
    {
      h3: "Changes and termination",
      paragraphs: [
        "We may update these Terms and notify you via the website or client. If you disagree, stop using the Service; continued use means you accept the updated Terms.",
        "You may stop using the Service and request account deletion at any time. We may also terminate or reclaim service for serious breach, prolonged inactivity, or if we discontinue operations.",
      ],
    },
    {
      h3: "Governing law and contact",
      paragraphs: [
        "Subject to mandatory applicable law, these Terms are governed by the laws of the jurisdiction where the service operator is established. Disputes should first be resolved amicably.",
        `Questions? Email ${site.supportEmail} or visit Support.`,
      ],
    },
  ],
});

export function getPrivacyDoc(locale: SiteLocale): LegalDoc {
  return locale === "en" ? privacyEn() : privacyZh();
}

export function getTermsDoc(locale: SiteLocale): LegalDoc {
  return locale === "en" ? termsEn() : termsZh();
}
