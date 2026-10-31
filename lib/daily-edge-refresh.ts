export function isDailyEdgeRefreshAuthorized(authorizationHeader: string | null, configuredSecret: string | undefined) {
  return Boolean(configuredSecret && authorizationHeader === `Bearer ${configuredSecret}`);
}
