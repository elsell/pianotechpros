export default ({ config }: { config: Record<string, unknown> }) => ({
  ...config,
  extra: {
    ...((config.extra as Record<string, unknown> | undefined) ?? {}),
    application: {
      environment: process.env.PIANOTECHPROS_APP_ENV ?? 'development',
      apiURL: process.env.PIANOTECHPROS_API_URL ?? 'http://localhost:8080',
      oidcIssuer: process.env.PIANOTECHPROS_OIDC_ISSUER ?? 'http://localhost:5556/dex',
      oidcClientId: process.env.PIANOTECHPROS_MOBILE_OIDC_CLIENT_ID ?? 'pianotechpros-mobile',
    },
  },
});
