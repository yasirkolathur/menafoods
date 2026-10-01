export async function bootstrap(ctx) {
  const [profile, permissions, summary, versions] = await Promise.all([
    ctx.auth.getProfile(),
    ctx.auth.getPermissions(),
    ctx.cache.getDashboardSummary(ctx.user.id),
    ctx.cache.getVersions()
  ]);

  return {
    ok: true,
    user: profile,
    permissions,
    dashboard_summary: summary,
    cache_versions: versions
  };
}
