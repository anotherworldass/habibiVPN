const MAP: Record<string, string> = {
  "auth.email_taken": "该邮箱已被占用，请换一个邮箱",
  "auth.already_registered": "当前账号已绑定邮箱",
  "auth.invalid_credentials": "邮箱或密码不正确",
  "auth.email_unverified": "邮箱尚未验证，暂不能用邮箱登录，请先完成验证",
  "auth.verify_code_required": "请先获取并填写邮箱验证码",
  "auth.verify_code_invalid": "验证码无效或已过期",
  "auth.password_required": "请先设置密码后再获取验证码",
  "auth.code_cooldown": "验证码发送过于频繁，请稍后再试",
  "mail.ses.not_configured": "邮件服务未配置，请稍后重试或联系客服",
  "auth.required": "登录状态未就绪，请稍后重试或重新打开小程序",
  "auth.invalid_token": "登录已失效，请重新打开小程序",
  "auth.user_disabled": "账号已停用，请联系客服",
  "auth.anonymous_no_password": "请先绑定邮箱后再改密",
  "validation.failed": "请检查邮箱和密码格式",
  "auth.bootstrap_rate_limited": "操作太频繁，请稍后再试",
  "auth.bootstrap_device_limited": "今日创建账号已达上限",
  "auth.device_id_required": "缺少设备标识，请重开小程序",
  "auth.register_rate_limited": "注册过于频繁，请稍后再试",
  "auth.register_device_limited": "该设备今日注册次数已达上限",
  "auth.register_ip_limited": "当前网络今日注册次数已达上限",
  "plan.not_found": "套餐不存在或已下架",
  "plan.not_free_claimable": "该套餐不可免费领取",
  "subscription.plan_already_owned": "你已拥有该套餐",
  "subscription.not_found": "找不到该订阅",
  "subscription.renew_incompatible": "该套餐规格不同，不能续费到所选连接",
  "subscription.renew_disabled": "该套餐已停用，无法续费",
  "subscription.slot_id_required": "续费请选择要叠加的套餐",
  "user.not_found": "用户不存在",
  "user.disabled": "账号已停用",
  "invite.code_invalid": "邀请码无效或不存在，请核对；没有邀请码请留空",
  "invite.code_length_invalid": "邀请码为 3–8 位，没有请留空",
  "invite.code_format_invalid": "邀请码为 3–8 位字母或数字，没有请留空",
  "invite.inviter_disabled": "该邀请码已停用，请留空或换一个",
  "invite.self_invite": "不能填写自己的邀请码，请留空或换一个",
  "invite.already_bound": "邀请关系已绑定，无需再填邀请码",
  "invite.cross_project_forbidden": "该邀请码不属于本应用，请留空或换一个",
  "invite.cycle_forbidden": "邀请关系不合法，请留空或换一个",
  "promo.disabled": "推广资格已停用",
  "campaign.invite_progress": "邀请人数尚未达标",
  "campaign.not_eligible": "暂时不能领取该活动",
  "campaign.not_found": "活动不存在或已结束",
  "campaign.not_active": "活动未开始或已结束",
  "referral.disabled": "推广功能暂时关闭",
  "payment.channel_unavailable": "该支付通道暂不可用",
  "payment.create_failed": "创建支付订单失败，请稍后重试",
  "payment.too_many_pending": "未支付订单过多，请先完成已有订单后再试",
  "payment.rate_limited": "下单过于频繁，请稍后再试",
  "order.not_found": "订单不存在",
};

const ERROR_CODE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;

export function friendlyError(err: unknown, fallback = "操作失败，请稍后重试") {
  const raw = err instanceof Error ? err.message : String(err || "");
  if (MAP[raw]) return MAP[raw];
  if (!raw || raw.startsWith("http.") || ERROR_CODE_RE.test(raw)) return fallback;
  return raw;
}
