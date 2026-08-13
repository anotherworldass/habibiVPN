"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Shell from "../../components/Shell";
import { normalizeInviteCode, saveInviteCode } from "../../lib/invite";

function InviteRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
        <h1>邀请页</h1>
        <p>正在跳转…</p>
      </div>
    </Shell>
  );
}

/** Supports `invite_links` configured as `https://…/invite?ref=` */
export default function InviteIndexPage() {
  return (
    <Suspense
      fallback={
        <Shell narrow hideNavigation>
          <div className="page-head">
            <h1>邀请页</h1>
            <p>正在跳转…</p>
          </div>
        </Shell>
      }
    >
      <InviteRedirect />
    </Suspense>
  );
}
