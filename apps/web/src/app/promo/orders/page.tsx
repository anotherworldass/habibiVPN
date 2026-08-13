"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — order amounts are shown in commission records */
export default function PromoOrdersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/promo/team?tab=commissions");
  }, [router]);
  return null;
}
