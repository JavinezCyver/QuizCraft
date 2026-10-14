use axum::{
    body::Bytes,
    extract::{ConnectInfo, DefaultBodyLimit, State},
    http::{HeaderMap, HeaderValue, Method, Uri},
    response::{IntoResponse, Response},
    routing::any,
    Json, Router,
};
use quizcraft_server::{db::Db, now, routes, security, ApiError, ApiResult};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tower_http::{
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Db>>,
    rates: Arc<Mutex<HashMap<std::net::IpAddr, (u32, i64)>>>,
    origin: String,
    production: bool,
}

async fn handle(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    bytes: Bytes,
) -> ApiResult<Response> {
    let origin = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let host = headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if method != Method::GET
        && !security::allowed_origin(origin, host, &state.origin, state.production)
    {
        return Err(ApiError::new(403, "Origin not allowed."));
    }
    if uri.path().starts_with("/api/auth/") {
        let mut rates = state.rates.lock().map_err(ApiError::internal)?;
        rates.retain(|_, (_, until)| *until > now());
        let bucket = rates.entry(peer.ip()).or_insert((0, now() + 900000));
        bucket.0 += 1;
        if bucket.0 > 60 {
            return Err(ApiError::new(
                429,
                "Too many requests. Try again in 15 minutes.",
            ));
        }
    }
    let cookie = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = cookie
        .split(';')
        .find_map(|part| part.trim().strip_prefix("qc="))
        .unwrap_or("")
        .to_string();
    let body: Value = if bytes.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&bytes).map_err(|_| ApiError::new(400, "Invalid JSON request."))?
    };
    let path = uri.path().to_string();
    let reply = tokio::task::spawn_blocking(move || {
        let db = state.db.lock().map_err(ApiError::internal)?;
        routes::dispatch(&db, method.as_str(), &path, &body, &token)
    })
    .await
    .map_err(ApiError::internal)??;
    let mut response = Json(reply.data).into_response();
    response
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-store"));
    if let Some(cookie) = reply.cookie {
        response.headers_mut().insert(
            "set-cookie",
            HeaderValue::from_str(&cookie).map_err(ApiError::internal)?,
        );
    }
    Ok(response)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/quizcraft.sqlite".into());
    let db = Db::open(&path).map_err(|e| e.1)?;
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).is_some_and(|s| s == "migrate") {
        println!("SQLite schema and migrations are up to date.");
        return Ok(());
    }
    if args.get(1).is_some_and(|s| s == "admin") {
        let email = args
            .iter()
            .position(|s| s == "--email")
            .and_then(|i| args.get(i + 1))
            .cloned()
            .or_else(|| std::env::var("ADMIN_EMAIL").ok())
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        if email.is_empty() {
            return Err("Usage: quizcraft-server admin --email you@example.com".into());
        }
        let changed = db
            .run("UPDATE users SET admin=1 WHERE email=?", &[json!(email)])
            .map_err(|e| e.1)?;
        if changed == 0 {
            return Err("Register this account before granting administrator access.".into());
        }
        println!("Administrator role granted. Reload the app.");
        return Ok(());
    }
    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        rates: Arc::new(Mutex::new(HashMap::new())),
        origin: std::env::var("APP_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into()),
        production: std::env::var("NODE_ENV").as_deref() == Ok("production"),
    };
    let app = Router::new()
        .route("/api/{*path}", any(handle))
        .with_state(state)
        .fallback_service(ServeDir::new("dist").fallback(ServeFile::new("dist/index.html")))
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(SetResponseHeaderLayer::if_not_present(
            "x-content-type-options".parse().unwrap(),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            "referrer-policy".parse().unwrap(),
            HeaderValue::from_static("same-origin"),
        ));
    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    println!("QuizCraft Rust API: http://localhost:{port}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}
