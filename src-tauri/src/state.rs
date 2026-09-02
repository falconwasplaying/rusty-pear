use std::sync::{Arc, Mutex};
use serde_json::Value;

#[derive(Default)]
pub struct AppState {
    pub config: Arc<Mutex<Value>>,
    pub is_maximized: Arc<Mutex<bool>>,
}
