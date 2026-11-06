# Migration fixtures

`data_vN.sql` holds fictional data written against schema version `N`.
`tests/migration_fixtures.rs` builds a database at version `N`, loads the
file, then opens it with the current app (running every newer migration) and
checks that the data survived and the schema contract holds.

When you add migration `M`, add `data_vM.sql` too. Never edit or delete an
existing fixture: they guard real users' upgrade paths.
