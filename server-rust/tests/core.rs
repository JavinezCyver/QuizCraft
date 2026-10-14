use quizcraft_server::{db::Db, grade, routes::dispatch, security};
use serde_json::json;

#[test]
fn existing_node_scrypt_passwords_still_work() {
    let stored="fixture-salt:803da42035ff36cd49fbd767b71a7949fb96e177437a7117428416056d73a178c0a871a36311390363635989eaf331d79fd72554b5850d688df5f47f5a10add3";
    assert!(security::verify("legacy-password", stored));
    assert!(!security::verify("wrong", stored));
    assert!(!security::verify("anything", "malformed"));
}

#[test]
fn grading_normalizes_text_and_preserves_manual_review() {
    assert_eq!(
        grade(
            &json!({"type":"blank","accepted":["New York"],"points":10}),
            "  NEW   york "
        ),
        Some(10.0)
    );
    assert_eq!(
        grade(
            &json!({"type":"boolean","accepted":["True"],"points":10}),
            "False"
        ),
        Some(0.0)
    );
    assert_eq!(
        grade(
            &json!({"type":"short","accepted":[],"points":10}),
            "Anything"
        ),
        None
    );
}

#[test]
fn origin_validation_allows_proxy_host_but_rejects_arbitrary_origins() {
    assert!(security::allowed_origin(
        "https://quiz.example",
        "internal:3001",
        "https://quiz.example/",
        true
    ));
    assert!(security::allowed_origin(
        "http://localhost:5174",
        "localhost:5174",
        "",
        false
    ));
    assert!(!security::allowed_origin(
        "https://attacker.example",
        "localhost:5174",
        "",
        false
    ));
    assert!(!security::allowed_origin(
        "http://localhost:5174/",
        "localhost:5174",
        "",
        false
    ));
    assert!(security::allowed_origin(
        "https://quiz.example",
        "internal:3001",
        "https://quiz.example",
        true
    ));
}

#[test]
fn fresh_database_has_no_examples_and_requires_auth_for_library() {
    let db = Db::open(":memory:").unwrap();
    assert_eq!(
        dispatch(&db, "GET", "/api/quizzes", &json!({}), "")
            .unwrap()
            .data,
        json!([])
    );
    assert_eq!(
        dispatch(&db, "GET", "/api/library", &json!({}), "")
            .err()
            .unwrap()
            .0
            .as_u16(),
        401
    );
}

#[test]
fn failed_transaction_rolls_back_every_write() {
    let db = Db::open(":memory:").unwrap();
    let result=db.transaction(|| {
        db.run("INSERT INTO users(id,email,password,name) VALUES('one','one@example.test','hash','One')",&[])?;
        db.run("INSERT INTO users(id,email,password,name) VALUES('two','one@example.test','hash','Two')",&[])?;
        Ok(())
    });
    assert!(result.is_err());
    assert_eq!(db.get("SELECT COUNT(*) n FROM users", &[]).unwrap()["n"], 0);
}
