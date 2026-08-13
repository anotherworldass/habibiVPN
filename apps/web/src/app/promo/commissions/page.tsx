"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — merged into /promo/team?tab=commissions */
export default function PromoCommissionsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/promo/team?tab=commissions");
  }, [router]);
  return null;
}
