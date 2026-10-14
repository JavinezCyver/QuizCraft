use crate::{ApiError, ApiResult};
use rusqlite::{types::Value as SqlValue, Connection};
use serde_json::{Map, Value};

pub struct Db(pub Connection);

impl Db {
    pub fn open(path: &str) -> ApiResult<Self> {
        if path != ":memory:" {
            if let Some(parent) = std::path::Path::new(path)
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
            {
                std::fs::create_dir_all(parent).map_err(ApiError::internal)?;
            }
        }
        let db = Self(Connection::open(path)?);
        db.0.busy_timeout(std::time::Duration::from_secs(10))?;
        db.0.execute_batch(include_str!("../migrations/schema.sql"))?;
        if !db
            .all("PRAGMA table_info(questions)", &[])?
            .iter()
            .any(|c| c["name"] == "correct_option")
        {
            db.0.execute_batch("ALTER TABLE questions ADD COLUMN correct_option INTEGER;")?;
        }
        db.0.execute_batch("UPDATE attempts SET preview=1,public=0 WHERE preview=0 AND (json_extract(quiz_snapshot,'$.status')='draft' OR EXISTS(SELECT 1 FROM quizzes q WHERE q.id=attempts.quiz_id AND q.status='deleted' AND q.owner=attempts.user_id));")?;
        Ok(db)
    }
    pub fn all(&self, sql: &str, args: &[Value]) -> ApiResult<Vec<Value>> {
        let mut statement = self.0.prepare(sql)?;
        let names: Vec<String> = statement
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        let params: Vec<SqlValue> = args.iter().map(sql_value).collect();
        let rows = statement.query_map(rusqlite::params_from_iter(params), |row| {
            let mut object = Map::new();
            for (index, name) in names.iter().enumerate() {
                let value: SqlValue = row.get(index)?;
                object.insert(
                    name.clone(),
                    match value {
                        SqlValue::Null => Value::Null,
                        SqlValue::Integer(n) => n.into(),
                        SqlValue::Real(n) => serde_json::json!(n),
                        SqlValue::Text(s) => s.into(),
                        SqlValue::Blob(b) => hex::encode(b).into(),
                    },
                );
            }
            Ok(Value::Object(object))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
    pub fn get(&self, sql: &str, args: &[Value]) -> ApiResult<Value> {
        Ok(self
            .all(sql, args)?
            .into_iter()
            .next()
            .unwrap_or(Value::Null))
    }
    pub fn run(&self, sql: &str, args: &[Value]) -> ApiResult<usize> {
        let params: Vec<SqlValue> = args.iter().map(sql_value).collect();
        Ok(self.0.execute(sql, rusqlite::params_from_iter(params))?)
    }
    pub fn transaction<T>(&self, action: impl FnOnce() -> ApiResult<T>) -> ApiResult<T> {
        self.0.execute_batch("BEGIN IMMEDIATE")?;
        match action() {
            Ok(value) => {
                if let Err(error) = self.0.execute_batch("COMMIT") {
                    let _ = self.0.execute_batch("ROLLBACK");
                    return Err(error.into());
                }
                Ok(value)
            }
            Err(error) => {
                let _ = self.0.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }
}

fn sql_value(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => n
            .as_i64()
            .map(SqlValue::Integer)
            .unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}
