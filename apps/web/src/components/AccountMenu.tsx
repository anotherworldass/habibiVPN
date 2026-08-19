"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "../lib/copy";
import { clearToken } from "../lib/auth";
import Link from "./LocaleLink";
import { useLocale } from "./LocaleProvider";
import { useLocaleRouter } from "./useLocaleRouter";

export default function AccountMenu({ loggedIn }: { loggedIn: boolean }) {
  const locale = useLocale();
  const copy = t(locale);
  const router = useLocaleRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function logout() {
    clearToken();
    setOpen(false);
    router.push("/login");
  }

  if (!loggedIn) {
    return (
      <div className="account-auth-links">
        <Link href="/login" className="account-auth-link">
          {copy.login.submit}
        </Link>
        <Link href="/register" className="account-auth-link account-auth-link--primary">
          {copy.register.title}
        </Link>
      </div>
    );
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-label={copy.nav.menuAria}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <DefaultAvatar />
      </button>
      {open && (
        <div className="account-menu-panel" role="menu">
          <Link
            href="/account"
            className="account-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {copy.nav.userCenter}
          </Link>
          <button
            type="button"
            className="account-menu-item account-menu-item--danger"
            role="menuitem"
            onClick={logout}
          >
            {copy.account.logout}
          </button>
        </div>
      )}
    </div>
  );
}

function DefaultAvatar() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="currentColor" className="account-menu-avatar-bg" />
      <circle cx="16" cy="12.5" r="5" fill="#fff" />
      <path
        d="M6.5 27.2c1.9-5.2 5.2-7.7 9.5-7.7s7.6 2.5 9.5 7.7"
        fill="#fff"
      />
    </svg>
  );
}
