use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressPort {
    pub address: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub protocol: String,
    pub local: AddressPort,
    pub remote: AddressPort,
    pub state: String,
    pub pid: u32,
    pub process_name: String,
}
