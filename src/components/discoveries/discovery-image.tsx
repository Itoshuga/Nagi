"use client";

import Image from "next/image";
import { useState } from "react";
import { Aperture } from "lucide-react";
import type { Photograph } from "@/types/content";

export function DiscoveryImage({ photograph, title, priority = false, sizes = "(max-width: 760px) 92vw, 45vw" }: { photograph?: Photograph; title: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="discovery-image">
      {photograph && !failed ? <Image src={photograph.src} alt={photograph.alt} fill sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} style={{ objectPosition: photograph.position }} onError={() => setFailed(true)} /> :
        <div className="photograph-placeholder" role="img" aria-label={`${title} — photographie non disponible`}><Aperture size={35} strokeWidth={.7} aria-hidden="true" /><span>Le regard se prépare</span><small>Photographie à venir</small></div>}
    </div>
  );
}
