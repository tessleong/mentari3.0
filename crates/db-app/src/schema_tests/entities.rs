use super::*;

#[tokio::test]
async fn calendar_roundtrip() {
    let db = test_db().await;

    upsert_calendar(
        db.pool(),
        UpsertCalendar {
            id: "cal1",
            tracking_id_calendar: "tracking-cal-1",
            name: "Work",
            enabled: true,
            provider: "google",
            source: "team",
            color: "#123456",
            connection_id: "conn-1",
        },
    )
    .await
    .unwrap();

    let row = get_calendar(db.pool(), "cal1").await.unwrap().unwrap();
    assert_eq!(row.name, "Work");
    assert!(row.enabled);

    let rows = list_calendars(db.pool()).await.unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, "cal1");
}

#[tokio::test]
async fn event_roundtrip() {
    let db = test_db().await;

    upsert_event(
        db.pool(),
        UpsertEvent {
            id: "evt1",
            tracking_id_event: "tracking-evt-1",
            calendar_id: "cal1",
            title: "Standup",
            started_at: "2026-04-15T09:00:00Z",
            ended_at: "2026-04-15T09:30:00Z",
            location: "",
            meeting_link: "https://meet.example/1",
            description: "Daily sync",
            note: "",
            recurrence_series_id: "series-1",
            has_recurrence_rules: true,
            is_all_day: false,
            provider: "google",
            participants_json: Some("[{\"email\":\"a@example.com\"}]"),
        },
    )
    .await
    .unwrap();

    let row = get_event(db.pool(), "evt1").await.unwrap().unwrap();
    assert_eq!(row.title, "Standup");
    assert_eq!(row.calendar_id, "cal1");

    let rows = list_events(db.pool()).await.unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, "evt1");
}

#[tokio::test]
async fn template_roundtrip() {
    let db = test_db().await;

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "Standup",
            description: "Daily sync",
            pinned: true,
            pin_order: Some(2),
            category: Some("meetings"),
            targets_json: Some("[\"engineering\"]"),
            sections_json: "[{\"title\":\"Notes\",\"description\":\"...\"}]",
        },
    )
    .await
    .unwrap();

    let row = get_template(db.pool(), "template-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.title, "Standup");
    assert_eq!(row.targets_json.as_deref(), Some("[\"engineering\"]"));
    assert_eq!(
        row.sections_json,
        "[{\"title\":\"Notes\",\"description\":\"...\"}]"
    );
}

#[tokio::test]
async fn migrations_seed_default_templates_without_overwriting_existing_rows() {
    let db = Db::connect_memory_plain().await.unwrap();
    anlg_db_migrate::migrate(
        &db,
        anlg_db_migrate::DbSchema {
            steps: &APP_MIGRATION_STEPS[..1],
            validate_cloudsync_table: cloudsync_alter_guard_required,
        },
    )
    .await
    .unwrap();

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "default-doctors-visit",
            title: "Custom Visit",
            description: "Keep user edit",
            pinned: true,
            pin_order: Some(1),
            category: Some("Custom"),
            targets_json: Some("[\"Team\"]"),
            sections_json: "[{\"title\":\"Custom\",\"description\":\"Keep\"}]",
        },
    )
    .await
    .unwrap();

    anlg_db_migrate::migrate(&db, schema()).await.unwrap();

    let rows = list_templates(db.pool()).await.unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(
        rows.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
        vec!["default-doctors-visit"]
    );

    let custom_row = get_template(db.pool(), "default-doctors-visit")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(custom_row.title, "Custom Visit");
    assert_eq!(custom_row.description, "Keep user edit");
}

#[tokio::test]
async fn doctors_visit_migration_deletes_only_untouched_business_templates() {
    let db = Db::connect_memory_plain().await.unwrap();
    // Apply through the original 17-template seed, before the business
    // templates are removed, so there is something to customize.
    anlg_db_migrate::migrate(
        &db,
        anlg_db_migrate::DbSchema {
            steps: &APP_MIGRATION_STEPS[..3],
            validate_cloudsync_table: cloudsync_alter_guard_required,
        },
    )
    .await
    .unwrap();

    // Same other fields as the pristine seed row (see
    // 20260524000000_default_templates.sql), only the title changed, so the
    // doctors-visit migration's exact-match delete condition should skip it.
    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "default-daily-standup",
            title: "Renamed Standup",
            description: "For quick daily syncs to share progress and blockers",
            pinned: false,
            pin_order: None,
            category: Some("Engineering"),
            targets_json: Some(
                "[\"Software Engineer\",\"Engineering Manager\",\"Scrum Master\"]",
            ),
            sections_json: "[{\"title\":\"Yesterday's Accomplishments\",\"description\":\"What did you complete yesterday?\"},{\"title\":\"Today's Plan\",\"description\":\"What are you working on today?\"},{\"title\":\"Blockers\",\"description\":\"Any obstacles or help needed?\"},{\"title\":\"Team Updates\",\"description\":\"Important announcements or information\"}]",
        },
    )
    .await
    .unwrap();

    anlg_db_migrate::migrate(&db, schema()).await.unwrap();

    // Customized row survives: it no longer matches the pristine seed values
    // the deletion is conditioned on.
    let renamed = get_template(db.pool(), "default-daily-standup")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(renamed.title, "Renamed Standup");

    // Untouched business templates are gone.
    assert!(
        get_template(db.pool(), "default-board-meeting")
            .await
            .unwrap()
            .is_none()
    );

    // The new default is seeded.
    let doctors_visit = get_template(db.pool(), "default-doctors-visit")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(doctors_visit.title, "Doctor's Visit");
}

#[tokio::test]
async fn list_templates_returns_all_ordered_by_id() {
    let db = test_db_without_default_templates().await;

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-2",
            title: "Two",
            description: "",
            pinned: false,
            pin_order: None,
            category: None,
            targets_json: None,
            sections_json: "[]",
        },
    )
    .await
    .unwrap();

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "One",
            description: "",
            pinned: false,
            pin_order: None,
            category: None,
            targets_json: None,
            sections_json: "[]",
        },
    )
    .await
    .unwrap();

    let rows = list_templates(db.pool()).await.unwrap();
    let ids: Vec<&str> = rows.iter().map(|row| row.id.as_str()).collect();

    assert_eq!(ids, vec!["template-1", "template-2"]);
}

#[tokio::test]
async fn template_upsert_replaces_existing_row_by_id() {
    let db = test_db_without_default_templates().await;

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "First",
            description: "A",
            pinned: false,
            pin_order: None,
            category: None,
            targets_json: None,
            sections_json: "[]",
        },
    )
    .await
    .unwrap();

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "Second",
            description: "B",
            pinned: true,
            pin_order: Some(5),
            category: Some("sales"),
            targets_json: Some("[\"exec\"]"),
            sections_json: "[{\"title\":\"Summary\",\"description\":\"Updated\"}]",
        },
    )
    .await
    .unwrap();

    let row = get_template(db.pool(), "template-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.title, "Second");
    assert_eq!(row.description, "B");
    assert!(row.pinned);
    assert_eq!(row.pin_order, Some(5));
    assert_eq!(row.category.as_deref(), Some("sales"));
    assert_eq!(row.targets_json.as_deref(), Some("[\"exec\"]"));
    assert_eq!(
        row.sections_json,
        "[{\"title\":\"Summary\",\"description\":\"Updated\"}]"
    );
    assert_eq!(list_templates(db.pool()).await.unwrap().len(), 1);
}

#[tokio::test]
async fn template_delete_removes_row() {
    let db = test_db().await;

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "Delete Me",
            description: "",
            pinned: false,
            pin_order: None,
            category: None,
            targets_json: None,
            sections_json: "[]",
        },
    )
    .await
    .unwrap();

    delete_template(db.pool(), "template-1").await.unwrap();

    assert!(
        get_template(db.pool(), "template-1")
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn template_insert_if_missing_preserves_existing_row() {
    let db = test_db().await;

    upsert_template(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "Original",
            description: "A",
            pinned: false,
            pin_order: None,
            category: None,
            targets_json: None,
            sections_json: "[]",
        },
    )
    .await
    .unwrap();

    let inserted = insert_template_if_missing(
        db.pool(),
        UpsertTemplate {
            id: "template-1",
            title: "Replacement",
            description: "B",
            pinned: true,
            pin_order: Some(4),
            category: Some("meetings"),
            targets_json: Some("[\"exec\"]"),
            sections_json: "[{\"title\":\"Summary\",\"description\":\"Updated\"}]",
        },
    )
    .await
    .unwrap();

    assert!(!inserted);

    let row = get_template(db.pool(), "template-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.title, "Original");
    assert_eq!(row.description, "A");
    assert!(!row.pinned);
    assert_eq!(row.pin_order, None);
    assert_eq!(row.category, None);
    assert_eq!(row.targets_json, None);
    assert_eq!(row.sections_json, "[]");
}
