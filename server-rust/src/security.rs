use crate::{db::Db, now, text, ApiError, ApiResult};
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub fn secret() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}
pub fn hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
pub fn password_hash(password: &str) -> ApiResult<String> {
    let salt = secret();
    Ok(format!(
        "{}:{}",
        salt,
        hex::encode(derive(password, &salt)?)
    ))
}
fn derive(password: &str, salt: &str) -> ApiResult<[u8; 64]> {
    let mut output = [0; 64];
    let params = scrypt::Params::new(14, 8, 1, 64).map_err(ApiError::internal)?;
    scrypt::scrypt(password.as_bytes(), salt.as_bytes(), &params, &mut output)
        .map_err(ApiError::internal)?;
    Ok(output)
}
pub fn verify(password: &str, stored: &str) -> bool {
    let Some((salt, key)) = stored.split_once(':') else {
        return false;
    };
    let Ok(expected) = hex::decode(key) else {
        return false;
    };
    let Ok(actual) = derive(password, salt) else {
        return false;
    };
    bool::from(actual.as_slice().ct_eq(expected.as_slice()))
}
pub fn public_user(user: &Value) -> Value {
    if user.is_null() {
        Value::Null
    } else {
        json!({"id":user["id"],"name":user["name"],"email":user["email"],"avatar":user["avatar"],"admin":user["admin"].as_i64().unwrap_or(0)!=0})
    }
}
pub fn session_user(db: &Db, token: &str) -> ApiResult<Value> {
    db.get(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        &[json!(hash(token)), json!(now())],
    )
}
pub fn session(db: &Db, id: &Value) -> ApiResult<String> {
    let token = secret();
    db.run(
        "INSERT INTO sessions VALUES(?,?,?)",
        &[json!(hash(&token)), id.clone(), json!(now() + 604800000)],
    )?;
    let secure = if std::env::var("NODE_ENV").as_deref() == Ok("production") {
        "; Secure"
    } else {
        ""
    };
    Ok(format!(
        "qc={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800{secure}"
    ))
}
pub fn allowed_origin(origin: &str, host: &str, app_origin: &str, production: bool) -> bool {
    if origin.is_empty() {
        return true;
    }
    let Ok(url) = url::Url::parse(origin) else {
        return false;
    };
    if !["http", "https"].contains(&url.scheme()) || url.origin().ascii_serialization() != origin {
        return false;
    }
    let request_origin = url::Url::parse(&format!("http://{host}"))
        .map(|url| url.origin().ascii_serialization())
        .unwrap_or_default();
    let configured_origin = url::Url::parse(app_origin)
        .map(|url| url.origin().ascii_serialization())
        .unwrap_or_default();
    origin == request_origin
        || origin == configured_origin
        || (!production && ["http://localhost:5173", "http://127.0.0.1:5173"].contains(&origin))
}
pub fn auth(user: &Value) -> ApiResult<&Value> {
    if user.is_null() {
        Err(ApiError::new(401, "Please sign in to continue."))
    } else {
        Ok(&user["id"])
    }
}
pub fn admin(user: &Value) -> ApiResult<()> {
    auth(user)?;
    if user["admin"].as_i64().unwrap_or(0) != 0 {
        Ok(())
    } else {
        Err(ApiError::new(403, "Administrator access required."))
    }
}
pub fn email(value: &Value) -> String {
    text(value).trim().to_lowercase()
}
