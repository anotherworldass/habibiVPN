"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { localePath } from "../lib/locale";
import { useLocale } from "./LocaleProvider";

type Props = ComponentProps<typeof NextLink>;

export default function Link({ href, ...props }: Props) {
  const locale = useLocale();
  const resolved = typeof href === "string" ? localePath(href, locale) : href;
  return <NextLink href={resolved} {...props} />;
}
