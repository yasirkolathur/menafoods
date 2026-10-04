export async function bootstrap(ctx) {
  if (!ctx?.user?.id || !ctx?.auth || !ctx?.cache) {
    const error = new Error("authenticated_context_required");
    error.status = 401;
    throw error;
  }

  const [profile, permissions, summary, versions] = await Promise.all([
    ctx.auth.getProfile(),
    ctx.auth.getPermissions(),
    ctx.cache.getDashboardSummary(ctx.user.id),
    ctx.cache.getVersions()
  ]);

  if (!profile || !Array.isArray(permissions)) {
    const error = new Error("invalid_bootstrap_response");
    error.status = 502;
    throw error;
  }

  return {
    ok: true,
    user: profile,
    permissions,
    dashboard_summary: summary ?? {},
    cache_versions: versions ?? {}
  };
}
