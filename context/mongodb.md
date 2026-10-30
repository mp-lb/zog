## MongoDB

This project uses MongoDB. Reuse its existing connection and collection/schema helpers. Application configuration supplies the connection URL and database name; shared packages should not independently load runtime environment files.

This is a MongoDB library, not a deployed database-backed app. Follow its existing test fixtures and connection configuration; do not add a database service merely because the library depends on MongoDB. Maintenance/reset tasks are destructive: verify the resolved target is the intended disposable local database and follow the project's data policy before running them. Close clients during script/test cleanup.

Setup and updates: `fm read extensions/mongodb/README.md --store mp-lb/fssstack`.

Installed dependency owners: `packages/zog`. Consult their existing configuration and the matching `zap.yaml` services/tasks before changes.
