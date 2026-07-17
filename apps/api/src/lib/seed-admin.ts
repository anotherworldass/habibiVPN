import { prisma } from "./prisma.js";
import { hashPassword } from "./password.js";
import { env } from "../config.js";

/** Ensure a bootstrap admin exists (dev / first boot). */
export async function seedAdminIfNeeded(): Promise<void> {
  const username = env.ADMIN_BOOTSTRAP_USERNAME;
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) return;

  const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD);
  await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      role: "superadmin",
    },
  });
  console.info(
    `[seed] created admin user "${username}" (change ADMIN_BOOTSTRAP_PASSWORD in production)`,
  );
}
