"use client";

import { useEffect } from "react";
import { useLocaleRouter } from "../../../components/useLocaleRouter";

/** Legacy path — merged into /promo/team?tab=commissions */
export default function PromoCommissionsRedirectPage() {
  const router = useLocaleRouter();
  useEffect(() => {
    router.replace("/promo/team?tab=commissions");
  }, [router]);
  return null;
}
