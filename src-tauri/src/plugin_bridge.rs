use serde_json::Value;

pub fn validate_plugin_capability(_plugin_id: &str, _capability: &str) -> bool {
    true
}

pub fn handle_plugin_request(_plugin_id: &str, _action: &str, _payload: Value) -> Result<Value, String> {
    Ok(Value::Null)
}
