"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useLocale } from "../../components/LocaleProvider";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import Shell from "../../components/Shell";
import { t } from "../../lib/copy";
import { normalizeInviteCode, saveInviteCode } from "../../lib/invite";

function InviteRedirect() {
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const copy = t(useLocale()).invite;

  useEffect(() => {
    const ref = normalizeInviteCode(searchParams.get("ref"));
    if (ref) {
      saveInviteCode(ref);
      router.replace(`/invite/${ref}`);
      return;
    }
    router.replace("/register");
  }, [router, searchParams]);

  return (
    <Shell narrow hideNavigation>
      <div className="page-head">
        <h1>{copy.redirectTitle}</h1>
        <p>{copy.redirectLead}</p>
      </div>
    </Shell>
  );
}

/** Supports `invite_links` configured as `https://…/invite?ref=` */
export default function InviteIndexPage() {
  const copy = t(useLocale()).invite;
  return (
    <Suspense
      fallback={
        <Shell narrow hideNavigation>
          <div className="page-head">
            <h1>{copy.redirectTitle}</h1>
            <p>{copy.redirectLead}</p>
          </div>
        </Shell>
      }
    >
      <InviteRedirect />
    </Suspense>
  );
}
