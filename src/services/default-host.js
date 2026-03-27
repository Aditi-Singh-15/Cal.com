import { config } from "../config.js";

export async function getDefaultHost(prisma) {
  return prisma.user.findUnique({
    where: { email: config.defaultHostEmail },
  });
}
