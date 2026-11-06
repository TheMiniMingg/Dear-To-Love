//! Provider API keys live in the OS credential store (Keychain, Windows
//! Credential Manager, Secret Service). The database only stores an opaque
//! reference. Secrets never appear in logs, exports or support reports.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::errors::{AppError, AppResult, ErrorCode};

pub const KEYRING_SERVICE: &str = "io.github.theminimingg.deartolove";

pub trait SecretStore: Send + Sync {
    fn set(&self, secret_ref: &str, secret: &str) -> AppResult<()>;
    fn get(&self, secret_ref: &str) -> AppResult<Option<String>>;
    fn delete(&self, secret_ref: &str) -> AppResult<()>;
}

/// Reference format stored in `provider_profiles.secret_ref`.
pub fn provider_secret_ref(profile_id: &str) -> String {
    format!("provider/{profile_id}")
}

pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, secret_ref: &str) -> AppResult<keyring::Entry> {
        keyring::Entry::new(&self.service, secret_ref).map_err(unavailable)
    }
}

fn unavailable(err: keyring::Error) -> AppError {
    // Never include the secret itself; keyring errors do not contain it.
    AppError::new(
        ErrorCode::SecretStoreUnavailable,
        format!("the system credential store is unavailable: {err}"),
    )
}

impl SecretStore for KeyringStore {
    fn set(&self, secret_ref: &str, secret: &str) -> AppResult<()> {
        self.entry(secret_ref)?
            .set_password(secret)
            .map_err(unavailable)
    }

    fn get(&self, secret_ref: &str) -> AppResult<Option<String>> {
        match self.entry(secret_ref)?.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(unavailable(e)),
        }
    }

    fn delete(&self, secret_ref: &str) -> AppResult<()> {
        match self.entry(secret_ref)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(unavailable(e)),
        }
    }
}

/// In-memory store for tests and for running without a credential service.
#[derive(Default)]
pub struct MemoryStore {
    items: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemoryStore {
    fn set(&self, secret_ref: &str, secret: &str) -> AppResult<()> {
        self.items
            .lock()
            .expect("secret store lock")
            .insert(secret_ref.to_string(), secret.to_string());
        Ok(())
    }

    fn get(&self, secret_ref: &str) -> AppResult<Option<String>> {
        Ok(self
            .items
            .lock()
            .expect("secret store lock")
            .get(secret_ref)
            .cloned())
    }

    fn delete(&self, secret_ref: &str) -> AppResult<()> {
        self.items
            .lock()
            .expect("secret store lock")
            .remove(secret_ref);
        Ok(())
    }
}

/// Round-trip a throwaway value to prove the store works.
pub fn probe(store: &dyn SecretStore) -> AppResult<()> {
    let r = "diagnostics/probe";
    store.set(r, "probe-value")?;
    let back = store.get(r)?;
    store.delete(r)?;
    if back.as_deref() == Some("probe-value") {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::SecretStoreUnavailable,
            "the credential store did not return the stored value",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trip_and_delete_is_idempotent() {
        let s = MemoryStore::default();
        assert_eq!(s.get("x").unwrap(), None);
        s.set("x", "secret").unwrap();
        assert_eq!(s.get("x").unwrap().as_deref(), Some("secret"));
        s.delete("x").unwrap();
        s.delete("x").unwrap();
        assert_eq!(s.get("x").unwrap(), None);
        probe(&s).unwrap();
    }

    #[test]
    fn secret_refs_are_opaque() {
        assert_eq!(provider_secret_ref("abc"), "provider/abc");
    }
}
