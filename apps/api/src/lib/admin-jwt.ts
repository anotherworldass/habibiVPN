import { SignJWT, jwtVerify } from "jose";
import { env } from "../config.js";

export type AdminJwtPayload = {
  sub: string;
  username: string;
  role: string;
};

function secretKey() {
  return new TextEncoder().encode(env.JWT_ADMIN_SECRET);
}

export async function signAdminToken(payload: AdminJwtPayload): Promise<string> {
  return new SignJWT({
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey());
}

export async function verifyAdminToken(token: string): Promise<AdminJwtPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (!payload.sub || typeof payload.username !== "string") {
    throw new Error("invalid_token");
  }
  return {
    sub: payload.sub,
    username: payload.username,
    role: typeof payload.role === "string" ? payload.role : "support",
  };
}
