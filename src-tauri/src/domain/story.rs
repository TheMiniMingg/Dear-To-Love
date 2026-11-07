use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::provider::StorytellerChoice;
use super::story_state::StoryStateV1;
use super::visuals::VisualSlot;

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

/// Choices made while creating a story that are not part of its state:
/// the story's pictures, its own images and who writes its replies.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StorySetup {
    /// Story-default pictures. Portraits name the story's character ids.
    pub pictures: Vec<(VisualSlot, String)>,
    /// Images added for this story only.
    pub own_images: Vec<String>,
    /// `None`: the story follows the app's storyteller.
    pub storyteller: Option<StorytellerChoice>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, TS)]
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
    /// The story's cover picture, when one is chosen.
    pub cover_asset_id: Option<String>,
    /// A reply is being written on one of its routes right now (it keeps
    /// going while the player is in another story).
    pub writing: bool,
    /// The story's genres as it was made; they pick its look.
    pub genres: Vec<String>,
    /// The chapter the last played route is in.
    pub chapter: Option<i32>,
    /// Actions taken on the last played route.
    pub turns: i32,
    /// The newest reply on the last played route (its story text), for a
    /// line of it in the library.
    pub last_reply: Option<String>,
}
