import "client-only";
import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getFirebasePublicConfig } from "./config";

let services: ReturnType<typeof initializeServices> | undefined;

function initializeServices() {
  const config = getFirebasePublicConfig();
  if (!config) throw new Error("firebase/configuration-missing");
  const emulated = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
  if (emulated && (process.env.NODE_ENV === "production" || !config.projectId?.startsWith("demo-"))) {
    throw new Error("firebase/unsafe-emulator-configuration");
  }
  const existing = getApps().find((app) => app.name === "nagi-browser");
  const app = existing ?? initializeApp(config, "nagi-browser");
  const auth = existing ? getAuth(app) : initializeAuth(app, { persistence: inMemoryPersistence });
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  if (emulated && !existing) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  return { auth, firestore, storage };
}

export function getFirebaseClient() {
  services ??= initializeServices();
  return services;
}
