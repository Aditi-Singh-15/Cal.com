export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  defaultHostEmail: process.env.DEFAULT_HOST_EMAIL ?? "host@calclone.local",
  defaultHostPassword: process.env.DEFAULT_HOST_PASSWORD ?? "password123",
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
};
