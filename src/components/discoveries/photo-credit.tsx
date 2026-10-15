import type { Photograph } from "@/types/content";

export function PhotoCredit({ photograph }: { photograph?: Photograph }) {
  const credit = photograph?.credit ?? (photograph?.author && photograph.sourceUrl ? { author: photograph.author, sourceUrl: photograph.sourceUrl } : undefined);
  if (!credit) return null;
  return <span className="photo-attribution">Photo : <a href={credit.sourceUrl}>{credit.title ? `${credit.title} — ` : ""}{credit.author}</a>{credit.license && <> · {credit.licenseUrl ? <a href={credit.licenseUrl}>{credit.license}</a> : credit.license}</>}</span>;
}
