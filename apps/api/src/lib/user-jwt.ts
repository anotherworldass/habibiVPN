import { SignJWT, jwtVerify } from "jose";
import { env } from "../config.js";

export type UserJwtPayload = {
  sub: string;
  email?: string | null;
};

function secretKey() {
  return new TextEncoder().encode(env.JWT_USER_SECRET);
}

export async function signUserToken(payload: UserJwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifyUserToken(token: string): Promise<UserJwtPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (!payload.sub) throw new Error("invalid_token");
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
  };
}
