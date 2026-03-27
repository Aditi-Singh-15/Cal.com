export const config = {
  port: Number(process.env.PORT ?? 3000),
  defaultHostEmail: process.env.DEFAULT_HOST_EMAIL ?? "host@calclone.local",
};
