//! Schema contract checks run at startup and from Diagnostics.
//! SQLite foreign keys cannot express ancestry or same-story membership,
//! so those invariants are verified here.

use std::collections::{HashMap, HashSet};

use sqlx::SqlitePool;

use super::Database;
use crate::errors::AppResult;

/// Columns the usage ledger code depends on.
const LEDGER_COLUMNS: &[(&str, &[&str])] = &[
    (
        "api_requests",
        &[
            "id",
            "generation_run_id",
            "provider_profile_id",
            "provider_label",
            "model_id",
            "billing",
            "session_id",
            "route_id",
            "purpose",
            "status",
            "usage_source",
            "input_tokens",
            "cached_input_tokens",
            "output_tokens",
            "cost_micro_usd",
            "reserved_micro_usd",
            "rate_snapshot_json",
            "error_code",
            "started_at",
            "finished_at",
        ],
    ),
    (
        "api_rate_cards",
        &[
            "id",
            "provider_profile_id",
            "model_id",
            "currency",
            "input_usd_per_million",
            "output_usd_per_million",
            "cached_input_usd_per_million",
            "effective_at",
        ],
    ),
];

/// Returns a list of human-readable violations; empty means healthy.
pub async fn verify(db: &Database) -> AppResult<Vec<String>> {
    let mut problems = Vec::new();
    let pool = db.reader();

    for (name, p) in [("reader", db.reader()), ("writer", db.writer())] {
        let fk: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(p)
            .await?;
        if fk != 1 {
            problems.push(format!("foreign keys are off on the {name} connection"));
        }
    }

    let fk_rows: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
        .fetch_all(pool)
        .await?;
    if !fk_rows.is_empty() {
        problems.push(format!("{} rows violate foreign keys", fk_rows.len()));
    }

    problems.extend(ledger_schema_problems(pool).await?);

    let cross_story_heads: Vec<(String,)> = sqlx::query_as(
        "SELECT r.id FROM routes r JOIN events e ON e.id = r.head_event_id WHERE e.story_id <> r.story_id",
    )
    .fetch_all(pool)
    .await?;
    for (id,) in cross_story_heads {
        problems.push(format!("route {id} head belongs to another story"));
    }

    let cross_story_parents: Vec<(String,)> = sqlx::query_as(
        "SELECT e.id FROM events e JOIN events p ON p.id = e.parent_event_id WHERE p.story_id <> e.story_id",
    )
    .fetch_all(pool)
    .await?;
    for (id,) in cross_story_parents {
        problems.push(format!("event {id} has a parent in another story"));
    }

    let cross_story_origin: Vec<(String,)> = sqlx::query_as(
        "SELECT e.id FROM events e JOIN routes r ON r.id = e.origin_route_id WHERE r.story_id <> e.story_id",
    )
    .fetch_all(pool)
    .await?;
    for (id,) in cross_story_origin {
        problems.push(format!("event {id} originates on a route of another story"));
    }

    let main_counts: Vec<(String, i64)> = sqlx::query_as(
        "SELECT s.id, (SELECT COUNT(*) FROM routes r WHERE r.story_id = s.id AND r.is_main = 1) \
         FROM stories s",
    )
    .fetch_all(pool)
    .await?;
    for (id, n) in main_counts {
        if n != 1 {
            problems.push(format!("story {id} has {n} main routes (expected 1)"));
        }
    }

    // Ancestry: no cycles; saves point at ancestors of their route head.
    let edges: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT id, parent_event_id FROM events")
            .fetch_all(pool)
            .await?;
    let parents: HashMap<String, Option<String>> = edges.into_iter().collect();
    problems.extend(cycle_problems(&parents));

    let saves: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT s.id, s.event_id, r.head_event_id FROM saves s JOIN routes r ON r.id = s.route_id",
    )
    .fetch_all(pool)
    .await?;
    for (save_id, event_id, head) in saves {
        let ok = head.is_some_and(|h| is_ancestor_in(&parents, &event_id, &h));
        if !ok {
            problems.push(format!(
                "save {save_id} does not point into its route history"
            ));
        }
    }

    Ok(problems)
}

async fn ledger_schema_problems(pool: &SqlitePool) -> AppResult<Vec<String>> {
    let mut problems = Vec::new();
    for (table, columns) in LEDGER_COLUMNS {
        let present: Vec<(String,)> = sqlx::query_as("SELECT name FROM pragma_table_info(?)")
            .bind(table)
            .fetch_all(pool)
            .await?;
        let present: HashSet<String> = present.into_iter().map(|(n,)| n).collect();
        for col in *columns {
            if !present.contains(*col) {
                problems.push(format!(
                    "usage ledger table {table} is missing column {col}"
                ));
            }
        }
    }
    Ok(problems)
}

fn cycle_problems(parents: &HashMap<String, Option<String>>) -> Vec<String> {
    // Iterative walk with a "known acyclic" memo: O(n) overall.
    let mut safe: HashSet<&str> = HashSet::new();
    let mut problems = Vec::new();
    for start in parents.keys() {
        let mut path: Vec<&str> = Vec::new();
        let mut on_path: HashSet<&str> = HashSet::new();
        let mut cur: Option<&str> = Some(start.as_str());
        while let Some(id) = cur {
            if safe.contains(id) {
                break;
            }
            if !on_path.insert(id) {
                problems.push(format!("event {id} is part of a parent cycle"));
                break;
            }
            path.push(id);
            cur = parents.get(id).and_then(|p| p.as_deref());
        }
        safe.extend(path);
        if problems.len() > 20 {
            break;
        }
    }
    problems
}

fn is_ancestor_in(parents: &HashMap<String, Option<String>>, candidate: &str, head: &str) -> bool {
    let mut cur = Some(head);
    let mut steps = 0usize;
    while let Some(id) = cur {
        if id == candidate {
            return true;
        }
        steps += 1;
        if steps > parents.len() {
            return false; // cycle guard
        }
        cur = parents.get(id).and_then(|p| p.as_deref());
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::stories;
    use crate::db::test_support::test_db;
    use crate::domain::story::CreateStoryInput;
    use crate::domain::story_state::fixtures::lighthouse;

    #[tokio::test]
    async fn fresh_and_populated_databases_pass() {
        let t = test_db().await;
        assert!(verify(&t.db).await.unwrap().is_empty());
        stories::create_story(
            &t.db,
            CreateStoryInput {
                title: "Lamp".into(),
                description: String::new(),
                base_state: lighthouse(),
                first_chapter_title: "Chapter 1".into(),
                chapter_outlines: vec![],
            },
        )
        .await
        .unwrap();
        assert_eq!(verify(&t.db).await.unwrap(), Vec::<String>::new());
    }

    #[test]
    fn detects_cycles() {
        let mut p = HashMap::new();
        p.insert("a".to_string(), Some("b".to_string()));
        p.insert("b".to_string(), Some("a".to_string()));
        p.insert("c".to_string(), None);
        assert!(!cycle_problems(&p).is_empty());
        p.insert("b".to_string(), Some("c".to_string()));
        assert!(cycle_problems(&p).is_empty());
        assert!(is_ancestor_in(&p, "c", "a"));
        assert!(!is_ancestor_in(&p, "a", "c"));
    }
}
