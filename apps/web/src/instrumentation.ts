export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build')
    return;
  const { discordEnv } = await import('./lib/env');
  discordEnv(); // Invalid/missing variables stop startup with actionable, redacted messages.
  const { ensureBackendStartup } = await import('./lib/startup');
  try {
    await ensureBackendStartup();
  } catch (error) {
    // An external outage must not prevent the public site from being served.
    // Authenticated requests retry this persistent startup request before proceeding.
    const { describeError } = await import('@nagi/shared');
    console.error(
      JSON.stringify({
        service: 'nagi-web',
        event: 'startup.failed',
        ...describeError(error, process.env),
        retry: 'Nouvelle tentative à la prochaine requête authentifiée.',
      }),
    );
  }
}
