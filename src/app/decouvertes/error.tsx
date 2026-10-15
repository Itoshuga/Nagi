"use client";
import { UnavailableMessage } from "@/components/destinations/unavailable-message";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <><UnavailableMessage /><div className="section-shell"><button className="button button-secondary" onClick={retry}>Réessayer</button></div></>;
}
