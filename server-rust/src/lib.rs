pub mod db;
pub mod routes;
pub mod security;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

pub type ApiResult<T> = Result<T, ApiError>;
#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);
impl ApiError {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self(
            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            message.into(),
        )
    }
    pub fn internal(error: impl std::fmt::Display) -> Self {
        eprintln!("{error}");
        Self::new(500, "Something went wrong. Please try again.")
    }
}
impl From<rusqlite::Error> for ApiError {
    fn from(error: rusqlite::Error) -> Self {
        Self::internal(error)
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": self.1}))).into_response()
    }
}
pub fn text(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn parse_quiz(mut q: Value) -> Value {
    q["settings"] = serde_json::from_str(text(&q["settings"])).unwrap_or(json!({}));
    if let Some(object) = q.as_object_mut() {
        object.remove("questions");
    }
    q
}
pub fn owner(user: &Value, quiz: &Value) -> bool {
    !user.is_null() && !quiz.is_null() && user["id"] == quiz["owner"]
}
pub fn readable(user: &Value, q: &Value) -> bool {
    !q.is_null()
        && q["status"] != "deleted"
        && ((q["status"] == "published" && q["visibility"] != "private") || owner(user, q))
}
pub fn questions(db: &db::Db, id: &Value) -> ApiResult<Vec<Value>> {
    db.all(
        "SELECT * FROM questions WHERE quiz_id=? AND active=1 ORDER BY position",
        &[id.clone()],
    )?
    .into_iter()
    .map(decode_question)
    .collect()
}
pub fn decode_question(mut q: Value) -> ApiResult<Value> {
    q["options"] = serde_json::from_str(text(&q["options"])).map_err(ApiError::internal)?;
    q["accepted"] = serde_json::from_str(text(&q["accepted"])).map_err(ApiError::internal)?;
    q["correctOption"] = if !q["correct_option"].is_null() {
        q["correct_option"].clone()
    } else {
        q["options"]
            .as_array()
            .and_then(|options| options.iter().position(|v| v == &q["accepted"][0]))
            .map(|i| json!(i))
            .unwrap_or(Value::Null)
    };
    Ok(q)
}
pub fn attempt_questions(db: &db::Db, attempt: &Value) -> ApiResult<Vec<Value>> {
    let ids: Vec<Value> =
        serde_json::from_str(text(&attempt["question_order"])).map_err(ApiError::internal)?;
    ids.into_iter()
        .map(|id| decode_question(db.get("SELECT * FROM questions WHERE id=?", &[id])?))
        .collect()
}
pub fn grade(q: &Value, answer: &str) -> Option<f64> {
    let accepted = q["accepted"].as_array()?;
    if q["type"] == "short" && accepted.is_empty() {
        return None;
    }
    let normalize = |s: &str| {
        s.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    };
    Some(
        if accepted
            .iter()
            .any(|a| normalize(text(a)) == normalize(answer))
        {
            q["points"].as_f64().unwrap_or(0.0)
        } else {
            0.0
        },
    )
}
