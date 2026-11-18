export default function LoadingProfile() {
  return (
    <div
      role="status"
      aria-label="Chargement du profil"
      className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none"
    >
      <div className="aspect-[3.5/1] rounded-3xl bg-muted" />
      <div className="relative -mt-14 ml-7 size-28 rounded-full border-8 border-background bg-muted" />
      <div className="mt-6 h-9 w-52 rounded-lg bg-muted" />
      <div className="mt-4 h-4 w-32 rounded bg-muted" />
      <div className="mt-8 h-16 max-w-lg rounded-xl bg-muted" />
    </div>
  );
}
