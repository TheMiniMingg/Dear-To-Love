use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "UPPERCASE")]
#[ts(export)]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
    Skipped,
}

/// One health-check result. Diagnostics report only checks that were
/// actually performed; nothing is inferred.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DiagnosticCheck {
    pub id: String,
    pub label: String,
    pub status: CheckStatus,
    pub summary: String,
    pub remediation: Option<String>,
    pub duration_ms: u32,
    pub checked_at: String,
}
