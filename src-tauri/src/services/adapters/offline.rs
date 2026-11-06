//! The built-in offline storyteller as an adapter: the reply text is
//! computed up front (deterministically) and streamed word by word so the
//! reader behaves exactly as it does with a live model.

use std::time::Duration;

use tokio_util::sync::CancellationToken;

use super::{Completion, GenerateError};
use crate::domain::provider::NormalizedUsage;
use crate::errors::{AppError, ErrorCode};

pub struct Offline {
    pub text: String,
    /// Pause between words; zero in tests.
    pub delay: Duration,
}

impl Offline {
    pub async fn generate(
        &self,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        for piece in self.text.split_inclusive(' ') {
            if cancel.is_cancelled() {
                return Err(cancelled());
            }
            if !self.delay.is_zero() {
                tokio::select! {
                    _ = cancel.cancelled() => return Err(cancelled()),
                    _ = tokio::time::sleep(self.delay) => {}
                }
            }
            on_delta(piece);
        }
        Ok(Completion {
            text: self.text.clone(),
            finish_reason: "stop".into(),
            usage: NormalizedUsage::default(),
        })
    }
}

fn cancelled() -> GenerateError {
    // Nothing is billed offline.
    GenerateError::not_sent(AppError::new(
        ErrorCode::Cancelled,
        "the reply was cancelled",
    ))
}
