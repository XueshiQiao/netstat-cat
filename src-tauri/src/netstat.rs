use std::collections::HashMap;
use std::net::IpAddr;

use netstat2::{
    get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState,
};
use sysinfo::{ProcessesToUpdate, System};

use crate::process_info::{AddressPort, ProcessInfo};

fn tcp_state_to_string(state: &TcpState) -> &'static str {
    match state {
        TcpState::Closed => "CLOSED",
        TcpState::Listen => "LISTEN",
        TcpState::SynSent => "SYN_SENT",
        TcpState::SynReceived => "SYN_RECEIVED",
        TcpState::Established => "ESTABLISHED",
        TcpState::FinWait1 => "FIN_WAIT_1",
        TcpState::FinWait2 => "FIN_WAIT_2",
        TcpState::CloseWait => "CLOSE_WAIT",
        TcpState::Closing => "CLOSING",
        TcpState::LastAck => "LAST_ACK",
        TcpState::TimeWait => "TIME_WAIT",
        TcpState::DeleteTcb => "DELETE_TCB",
        TcpState::Unknown => "UNKNOWN",
    }
}

fn is_wildcard(addr: &IpAddr) -> bool {
    match addr {
        IpAddr::V4(v4) => v4.is_unspecified(),
        IpAddr::V6(v6) => v6.is_unspecified(),
    }
}

fn normalize_address(addr: &IpAddr) -> Option<String> {
    if is_wildcard(addr) {
        None
    } else {
        Some(addr.to_string())
    }
}

fn is_ipv6(addr: &IpAddr) -> bool {
    matches!(addr, IpAddr::V6(_))
}

pub fn fetch_process_info_list() -> Result<Vec<ProcessInfo>, String> {
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets =
        get_sockets_info(af_flags, proto_flags).map_err(|e| format!("Failed to get sockets: {e}"))?;

    // Build PID → process name map using sysinfo
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let mut pid_name_map: HashMap<u32, String> = HashMap::new();
    for (pid, process) in sys.processes() {
        pid_name_map.insert(pid.as_u32(), process.name().to_string_lossy().to_string());
    }

    let mut results = Vec::new();

    for socket in sockets {
        let pids = &socket.associated_pids;
        let pid = pids.first().copied().unwrap_or(0);
        let process_name = pid_name_map
            .get(&pid)
            .cloned()
            .unwrap_or_default();

        match socket.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => {
                let v6 = is_ipv6(&tcp.local_addr);
                let protocol = if v6 { "tcp6" } else { "tcp" }.to_string();

                results.push(ProcessInfo {
                    protocol,
                    local: AddressPort {
                        address: normalize_address(&tcp.local_addr),
                        port: Some(tcp.local_port),
                    },
                    remote: AddressPort {
                        address: normalize_address(&tcp.remote_addr),
                        port: Some(tcp.remote_port),
                    },
                    state: tcp_state_to_string(&tcp.state).to_string(),
                    pid,
                    process_name,
                });
            }
            ProtocolSocketInfo::Udp(udp) => {
                let v6 = is_ipv6(&udp.local_addr);
                let protocol = if v6 { "udp6" } else { "udp" }.to_string();

                results.push(ProcessInfo {
                    protocol,
                    local: AddressPort {
                        address: normalize_address(&udp.local_addr),
                        port: Some(udp.local_port),
                    },
                    remote: AddressPort {
                        address: None,
                        port: None,
                    },
                    state: String::new(),
                    pid,
                    process_name,
                });
            }
        }
    }

    Ok(results)
}
