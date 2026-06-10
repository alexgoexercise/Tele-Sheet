use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tracing::{error, warn};

#[derive(Clone)]
struct AppState {
    client_id: i32,
    updates: broadcast::Sender<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tele_sheet_server=info,tower_http=info".into()),
        )
        .init();

    dotenvy::dotenv().ok();

    let api_id: i32 = std::env::var("TELEGRAM_API_ID")
        .expect("TELEGRAM_API_ID is required (from https://my.telegram.org)")
        .parse()
        .expect("TELEGRAM_API_ID must be an integer");
    let api_hash =
        std::env::var("TELEGRAM_API_HASH").expect("TELEGRAM_API_HASH is required (from https://my.telegram.org)");

    let data_dir: PathBuf = std::env::var("TDLIB_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("tdlib_data"));
    std::fs::create_dir_all(&data_dir).expect("create TDLIB_DATA_DIR");

    let db = data_dir.join("db");
    let files = data_dir.join("files");
    std::fs::create_dir_all(&db).ok();
    std::fs::create_dir_all(&files).ok();

    let (updates_tx, _rx) = broadcast::channel::<String>(256);
    let updates_tx_thread = updates_tx.clone();

    let client_id = tdlib_rs::create_client();

    std::thread::spawn(move || loop {
        if let Some((update, _cid)) = tdlib_rs::receive() {
            match serde_json::to_string(&update) {
                Ok(s) => {
                    let _ = updates_tx_thread.send(s);
                }
                Err(e) => warn!(?e, "serialize tdlib update"),
            }
        }
    });

    tdlib_rs::functions::set_tdlib_parameters(
        false,
        db.to_string_lossy().into_owned(),
        files.to_string_lossy().into_owned(),
        String::new(),
        true,
        true,
        true,
        false,
        api_id,
        api_hash,
        "en".to_string(),
        "TeleSheet".to_string(),
        std::env::consts::OS.to_string(),
        env!("CARGO_PKG_VERSION").to_string(),
        client_id,
    )
    .await
    .expect("set_tdlib_parameters");

    let state = Arc::new(AppState {
        client_id,
        updates: updates_tx,
    });

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ws", get(ws_upgrade))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port: u16 = std::env::var("TELEGRAM_BRIDGE_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8765);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));

    tracing::info!("TDLib bridge listening on http://{addr} (WebSocket /ws)");
    axum::serve(listener, app).await.expect("server");
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_connected(socket, state))
}

async fn ws_connected(socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.updates.subscribe();
    let client_id = state.client_id;
    let (mut ws_tx, mut ws_rx) = socket.split();

    let send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(text) => {
                    if ws_tx.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            let Message::Text(text) = msg else {
                continue;
            };
            handle_ws_command(&text, client_id).await;
        }
    });

    _ = tokio::join!(send_task, recv_task);
}

#[derive(Debug, Deserialize)]
struct WsCommand {
    method: String,
    #[serde(default)]
    phone_number: Option<String>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    password: Option<String>,
}

async fn handle_ws_command(text: &str, client_id: i32) {
    let cmd: WsCommand = match serde_json::from_str(text) {
        Ok(c) => c,
        Err(e) => {
            warn!(?e, "invalid ws json");
            return;
        }
    };

    let res = match cmd.method.as_str() {
        "setAuthenticationPhoneNumber" => {
            let Some(phone) = cmd.phone_number.filter(|s| !s.is_empty()) else {
                warn!("setAuthenticationPhoneNumber missing phone_number");
                return;
            };
            tdlib_rs::functions::set_authentication_phone_number(phone, None, client_id).await
        }
        "checkAuthenticationCode" => {
            let Some(code) = cmd.code.filter(|s| !s.is_empty()) else {
                warn!("checkAuthenticationCode missing code");
                return;
            };
            tdlib_rs::functions::check_authentication_code(code, client_id).await
        }
        "checkAuthenticationPassword" => {
            let Some(pw) = cmd.password.filter(|s| !s.is_empty()) else {
                warn!("checkAuthenticationPassword missing password");
                return;
            };
            tdlib_rs::functions::check_authentication_password(pw, client_id).await
        }
        other => {
            warn!(other, "unknown ws method");
            return;
        }
    };

    if let Err(e) = res {
        error!(?e, "tdlib function error");
    }
}
