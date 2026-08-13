"use client";

import LegalDocView from "../../components/LegalDocView";
import { getTermsDoc } from "../../lib/legal";

export default function TermsPage() {
  return <LegalDocView kind="terms" getDoc={getTermsDoc} />;
}
