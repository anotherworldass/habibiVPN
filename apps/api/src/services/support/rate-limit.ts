import { redisIncrWithTtl } from "../../lib/redis.js";

const SEND_PER_MIN = 20;
const SEND_PER_IP_MIN = 60;

export async function assertSupportSendAllowed(input: {
  projectId: string;
  guestId: string;
  ip: string | null;
}) {
  try {
    const guestKey = `support:send:guest:${input.projectId}:${input.guestId}`;
    const n = await redisIncrWithTtl(guestKey, 60);
    if (n > SEND_PER_MIN) {
      throw Object.assign(new Error("support.rate_limited"), { statusCode: 429 });
    }
    if (input.ip) {
      const ipKey = `support:send:ip:${input.projectId}:${input.ip}`;
      const ipN = await redisIncrWithTtl(ipKey, 60);
      if (ipN > SEND_PER_IP_MIN) {
        throw Object.assign(new Error("support.rate_limited"), { statusCode: 429 });
      }
    }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 429) throw err;
    // Redis down — allow
  }
}
