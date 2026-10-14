import "server-only";
import { cache } from "react";
import { requireAdmin } from "../auth/session";
import { getAdminFirestore } from "../firebase/admin";
import { readManagedGeography } from "./store";

export const getAdminGeography = cache(async () => {
  await requireAdmin();
  return readManagedGeography(getAdminFirestore());
});
