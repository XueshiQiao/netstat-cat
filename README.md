# Netstat Cat

> A powerful network monitoring tool with real-time connection tracking and advanced filtering capabilities

<div align="center">
  
[English] **[[中文](README_CN.md)]**

</div>

## Overview

Netstat Cat is a lightweight desktop application built with **Tauri v2** and **Rust**, providing a user-friendly interface for monitoring network connections on macOS and Windows. It serves as a graphical replacement for the command-line `netstat` tool, making it easier to monitor network activity and identify which applications are using specific ports.

## Key Features

- **Security & Privacy** - Pure local operation with no network connections or data transmission
- **Real-time Network Monitoring** - Live display of active TCP/UDP connections
- **Process Identification** - Shows which processes own each network connection
- **Advanced Filtering System** - Search by process name, PID, port ranges, or semantic queries like `process=chrome && lport>1000` [See filtering guide](filters_en.md)
- **Virtualized Table Performance** - Efficiently handles large numbers of connections using React Virtuoso
- **Lazy Process Resolution** - Only fetches full executable paths when hovering over processes
- **LRU Caching** - Intelligent caching for process paths to avoid repeated system calls

- **Modern UI** - Frameless window with dark/light theme toggle
- **Auto-refresh Mode** - Configurable live monitoring (2-second intervals)

## Screenshots

<img src="screenshots/00-light.png" alt="Light Theme" width="600"/>
_Light theme interface_

<img src="screenshots/01-dark.png" alt="Dark Theme" width="600"/>
_Dark theme interface_

<img src="screenshots/03-query.png" alt="Query Feature" width="600"/>
_Advanced query filtering_

<img src="screenshots/04-filter.png" alt="Filter Options" width="600"/>
_Connection filtering options_

## Quick Start

### Prerequisites

- macOS 10.15+ or Windows 10+
- Node.js 20+
- npm
- Rust (install via [rustup](https://rustup.rs/))

### Installation

```bash
# Clone the repository
git clone https://github.com/XueshiQiao/netstat-cat.git
cd netstat-cat

# Install dependencies
npm install
```

### Development

```bash
# Start Tauri development server (compiles Rust backend + starts Vite)
npm run tauri:dev

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

### Building

```bash
# Build for current platform
npm run tauri:build
```

## Usage Guide

### Basic Monitoring

1. Launch the application to see all active network connections
2. Use the filter buttons to quickly narrow by protocol, IP version, or connection state
3. Enable auto-refresh for live monitoring

### Advanced Filtering

- **Simple Search**: Type process names, PIDs, or ports (e.g., `chrome`, `8080`)
- **Wildcards**: Use `*` for pattern matching (e.g., `*.exe`)
- **Port Ranges**: Use ranges like `80-443`
- **Semantic Queries**: Use advanced syntax like `process=chrome && lport>1000`

See [filters_en.md](filters_en.md) for complete filtering documentation.

## Technical Architecture

### Frontend Stack

- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **React Virtuoso** for virtualized scrolling
- **Vite** for frontend bundling

### Backend (Rust)

- **Tauri v2** for native desktop integration (uses OS webview, ~5MB binary)
- **netstat2** crate for cross-platform socket enumeration
- **sysinfo** crate for PID-to-process name resolution
- **Tauri IPC** for communication between frontend and Rust backend

### Performance Features

- Lazy loading of process paths
- Virtualized table rendering
- Efficient caching strategies
- Optimized system calls

## Development

### IDE Setup

Recommended: [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### Project Structure

```
netstat-cat/
├── src/                  # React frontend
│   ├── App.tsx           # Main UI component
│   ├── main.tsx          # Entry point
│   ├── assets/           # CSS and images
│   └── utils/            # Query parser, process cache
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── lib.rs        # Tauri app setup & command registration
│   │   ├── netstat.rs    # Network socket fetching logic
│   │   └── process_info.rs  # Data structures
│   ├── Cargo.toml
│   └── tauri.conf.json   # Tauri configuration
├── index.html
├── vite.config.ts
└── resources/            # Icons and entitlements
```

### Scripts

- `npm run tauri:dev` - Start Tauri development mode
- `npm run tauri:build` - Build for production
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Related Documentation

- [Filtering Guide (English)](filters_en.md)
- [过滤指南 (中文)](filters_cn.md)
