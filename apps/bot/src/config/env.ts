import { botEnvSchema, parseEnv } from '@nagi/shared';
export function getBotEnv() {
  return parseEnv(botEnvSchema, process.env);
}
