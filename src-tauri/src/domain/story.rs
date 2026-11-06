use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::story_state::StoryStateV1;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CreateStoryInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub base_state: StoryStateV1,
    pub first_chapter_title: String,
    /// Optional authored chapter plans, in order.
    #[serde(default)]
    pub chapter_outlines: Vec<ChapterOutlineInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChapterOutlineInput {
    pub title: String,
    #[serde(default)]
    pub outline: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoryCreated {
    pub story_id: String,
    pub main_route_id: String,
    pub head_event_id: String,
    pub route_version: i32,
}

#[derive(Debug, Clone, Serialize, TS, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorySummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
    pub route_count: i32,
    pub main_route_id: String,
    /// Most recently played visible route; the Library opens this one.
    pub last_route_id: String,
}
