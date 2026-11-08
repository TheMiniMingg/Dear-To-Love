fn main() {
    // sqlx::migrate! embeds the migrations, so a new one must rebuild.
    println!("cargo:rerun-if-changed=migrations");
    tauri_build::build()
}
