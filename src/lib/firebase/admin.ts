import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export class FirebaseConfigurationError extends Error {
  constructor() { super("La configuration Firebase serveur est indisponible."); }
}

export function isFirebaseAdminConfigured() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const emulated = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
  const hosts = [process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST];
  if (!projectId || projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return false;
  if (emulated) {
    return process.env.NODE_ENV !== "production" && projectId.startsWith("demo-") &&
      hosts[0] === "127.0.0.1:9099" && hosts[1] === "127.0.0.1:8080" && hosts[2] === "127.0.0.1:9199";
  }
  if (hosts.some(Boolean)) return false;
  return Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY);
}

export function getFirebaseAdminApp() {
  if (!isFirebaseAdminConfigured()) throw new FirebaseConfigurationError();
  const existing = getApps().find((app) => app.name === "nagi-server");
  if (existing) return existing;
  try {
    return initializeApp({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      ...(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" ? {} : {
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
      }),
    }, "nagi-server");
  } catch {
    // Ne jamais propager la clé ou les détails du compte de service.
    throw new FirebaseConfigurationError();
  }
}

export const getAdminAuth = () => getAuth(getFirebaseAdminApp());
export const getAdminFirestore = () => getFirestore(getFirebaseAdminApp());
export const getAdminStorage = () => getStorage(getFirebaseAdminApp());
