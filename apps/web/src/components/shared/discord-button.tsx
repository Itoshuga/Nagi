import { Button } from '@nagi/ui';
import { signIn } from '@/features/auth/actions';
export function DiscordButton({
  next = '/app',
  size = 'lg',
  className,
}: {
  next?: string;
  size?: 'lg' | 'default';
  className?: string;
}) {
  return (
    <form action={signIn}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size={size} className={className}>
        <svg aria-hidden="true" width="19" height="17" viewBox="0 0 24 20" fill="currentColor">
          <path d="M20.3 1.8A19.7 19.7 0 0 0 15.5.3l-.6 1.3a18.1 18.1 0 0 0-5.8 0L8.5.3a19.9 19.9 0 0 0-4.8 1.5C.7 6.2-.1 10.5.3 14.8a19.6 19.6 0 0 0 5.9 3l1.2-1.9-1.9-.9.5-.4a14.4 14.4 0 0 0 12 0l.5.4-1.9.9 1.2 1.9a19.5 19.5 0 0 0 5.9-3c.5-5-.9-9.3-3.4-13ZM8 12.3c-1.2 0-2.1-1.1-2.1-2.4S6.8 7.5 8 7.5s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
        </svg>
        Connexion avec Discord
      </Button>
    </form>
  );
}
