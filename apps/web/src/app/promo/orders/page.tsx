"use client";

import { useEffect } from "react";
import { useLocaleRouter } from "../../../components/useLocaleRouter";

/** Legacy path — order amounts are shown in commission records */
export default function PromoOrdersRedirectPage() {
  const router = useLocaleRouter();
  useEffect(() => {
    router.replace("/promo/team?tab=commissions");
  }, [router]);
  return null;
}
