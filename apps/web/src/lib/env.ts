import 'server-only';
import {
  parseEnv,
  publicEnvSchema,
  serviceEnvSchema,
  discordConnectionEnvSchema,
} from '@nagi/shared';
export function publicEnv() {
  return parseEnv(publicEnvSchema, process.env);
}
export function serverEnv() {
  return { ...publicEnv(), ...parseEnv(serviceEnvSchema, process.env) };
}
export function discordEnv() {
  return { ...serverEnv(), ...parseEnv(discordConnectionEnvSchema, process.env) };
}
