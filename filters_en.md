# Netstat Cat Filtering Guide

Netstat Cat provides a versatile filtering system to help you find specific network endpoints efficiently. You can use simple text search, wildcards, numeric ranges, or advanced semantic queries.

## 1. Simple Search
If the input does not follow the semantic query syntax (explained below), the application falls back to a broad text search.

### Text & Wildcards
- **Simple Match:** Type any text (e.g., `chrome`) to find connections where the process name, PID, or addresses contain that text.
- **Wildcards:** Use `*` for pattern matching.
  - `chrom*` - Matches anything starting with "chrom".
  - `*node*` - Matches anything containing "node".
  - `*.exe` - Matches anything ending with ".exe".

### Numeric Ranges
You can search for a range of Ports or PIDs using the `-` operator.
- `80-443` - Finds any connection with a local or remote port between 80 and 443.
- `1000-2000` - Finds processes with PIDs between 1000 and 2000.

---

## 2. Semantic Queries (Advanced)
Semantic queries allow you to build complex logical expressions using specific fields and operators.

### Syntax
`field operator value`

### Supported Fields
| Field | Aliases | Description |
| :--- | :--- | :--- |
| `pid` | - | Process ID |
| `process` | `name`, `processname` | Name of the process |
| `lport` | `localport` | Local port number |
| `rport` | `remoteport` | Remote port number |
| `laddr` | `local`, `localaddress` | Local IP address |
| `raddr` | `remote`, `remoteaddress` | Remote IP address |
| `state` | - | Connection state (e.g., LISTEN, ESTABLISHED) |
| `proto` | `protocol` | protocol (tcp, tcp6, udp, udp6) |

### Operators
- **Comparison:** `=`, `!=`, `>`, `<`, `>=`, `<=`, `:` (alias for `=`)
- **Logical:** `&&` (AND), `||` (OR), `!` (NOT)
- **Grouping:** `(` and `)`

### Examples
- **Find specific process and port:**
  `process=chrome && lport=443`
- **Find all connections except LISTEN state:**
  `!state=LISTEN`
- **Find connections in a PID list:**
  `pid=1234 || pid=5678`
- **Find high-port IPv6 TCP connections:**
  `lport > 1024 && proto=tcp6`
- **Complex grouping:**
  `(process=node || process=python) && !state=LISTEN`

---

## 3. UI Filter Buttons
The buttons below the search bar provide quick access to common filters:
- **Protocol:** Toggle between ALL, TCP, and UDP.
- **IP Version:** Filter for IPv4 or IPv6.
- **Connection State:** Quickly filter for `LISTEN`, `ESTABLISHED`, or other states (like CLOSE_WAIT).
