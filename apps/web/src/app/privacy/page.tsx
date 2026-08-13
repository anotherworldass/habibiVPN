"use client";

import LegalDocView from "../../components/LegalDocView";
import { getPrivacyDoc } from "../../lib/legal";

export default function PrivacyPage() {
  return <LegalDocView kind="privacy" getDoc={getPrivacyDoc} />;
}
