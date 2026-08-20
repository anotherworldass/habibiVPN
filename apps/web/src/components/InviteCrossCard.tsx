"use client";

import Link from "./LocaleLink";
import {
  inviteCampaignTeaser,
  type InviteCampaignAuth,
  type InviteCampaignPublic,
} from "../lib/campaigns";
import { t } from "../lib/copy";
import { useLocale } from "./LocaleProvider";

type Props =
  | { to: "activity"; campaign: InviteCampaignPublic | InviteCampaignAuth; className?: string }
  | { to: "promo"; className?: string };

function cx(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function InviteCrossCard(props: Props) {
  const copy = t(useLocale());

  if (props.to === "activity") {
    const campaign = props.campaign;
    const a = copy.activity;
    const progress = "invite_progress" in campaign ? campaign.invite_progress : null;
    const required = progress?.required_count ?? campaign.required_count ?? 0;
    const current = progress?.current_count ?? 0;
    return (
      <Link
        href="/activity"
        className={cx("invite-cross-card", "invite-cross-card--activity", props.className)}
      >
        <div className="invite-cross-body">
          <div className="invite-cross-kicker">{copy.promo.extraKicker}</div>
          <div className="invite-cross-title">
            {campaign.ui?.title?.trim() || a.fallbackTitle}
          </div>
          <p className="invite-cross-desc">
            {inviteCampaignTeaser(a, campaign)}
            {required > 0 ? ` · ${current}/${required}` : ""}
          </p>
        </div>
        <span className="invite-cross-cta">{copy.promo.extraCta}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/promo"
      className={cx("invite-cross-card", "invite-cross-card--promo", props.className)}
    >
      <div className="invite-cross-body">
        <div className="invite-cross-kicker">{copy.activity.promoLinkKicker}</div>
        <div className="invite-cross-title">{copy.activity.promoLinkTitle}</div>
        <p className="invite-cross-desc">{copy.activity.promoLinkDesc}</p>
      </div>
      <span className="invite-cross-cta">{copy.activity.promoLinkCta}</span>
    </Link>
  );
}
