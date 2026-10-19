# Production secrets

ArcNet reads the standard encrypted Forum source declared in [`.arcnet/arcnet.yaml`](../../../.arcnet/arcnet.yaml). Its committed ciphertext is under `.arcnet/secrets/`; the per-repository decryption key is stored in GitHub as `ARCNET_STANDARD_SECRETS_KEY`.

Run `arcnet secrets sync` after updating the Forum source, then commit the refreshed snapshot. The generated validation workflow checks that CI can decrypt it. The `deploy` and `publish` consumers in `arcnet.yaml` specify which values each job receives.

The encrypted `docs/env.local.enc` file is only for local development through the `zap` secrets tasks. It is not a production deployment source.
