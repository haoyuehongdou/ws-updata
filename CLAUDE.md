# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WhatsApp群发和记账系统 (WhatsApp Broadcasting and Billing System) - an Electron-based desktop application that integrates WhatsApp messaging capabilities with group management and billing features. The system uses Baileys library to connect with WhatsApp Web and provides a web-based UI for managing broadcasts, groups, and billing.

## Architecture

### Three-Tier Structure

The project consists of three main components that work together:

1. **Backend** (`/backend`) - Express.js REST API server
   - Runs as a separate Node.js process spawned by Electron
   - Handles WhatsApp connection via Baileys library
   - Manages data persistence in local JSON files and remote Supabase database
   - Serves on port 9001 by default

2. **Frontend** (`/frontend`) - React SPA with Ant Design
   - Built with Vite
   - Uses React Router with HashRouter (required for Electron file:// protocol)
   - Communicates with backend via HTTP API calls

3. **Electron** (`/electron`) - Desktop application wrapper
   - Spawns backend process on startup
   - Loads frontend from built static files (production) or dev server (development)
   - Handles app lifecycle, updates, and IPC communication

### Data Flow Architecture

- **Development Mode**: Frontend dev server (localhost:9000) → Backend server (localhost:9001) → Local data files + Supabase
- **Production Mode**: Electron loads static files → Backend process → User data directory + Supabase
- **WhatsApp Integration**: Backend uses Baileys multi-file auth state stored in `/data/auth`

### Data Directory Structure

The `/data` directory contains all runtime data and is organized as:
- `auth/` - WhatsApp authentication session files (Baileys multi-file auth state)
- `bills/` - Billing records as JSON files
- `config/` - Application configuration (admins.json, commands.json)
- `groups/` - Group data and categories (categories.json)
- `logs/` - Application logs
- `qr/` - Temporary QR code images for WhatsApp login
- `settings/` - User settings

In production (packaged Electron), the data directory is copied to the user's app data folder (`AppData/Roaming/whatsapp-system/data` on Windows).

## Common Development Commands

### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Start backend server (development mode with nodemon)
npm run dev

# Start backend server (production mode)
npm start

# Build backend for Electron (bundles with @vercel/ncc)
npm run build

# Alternative build with esbuild
npm run build:esbuild
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Start development server (Vite on port 9000)
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Preview production build
npm run preview
```

### Electron Development & Building

```bash
cd electron

# Install dependencies
npm install

# Start Electron app in development mode
npm start

# Prepare build (cleans data directory, creates structure)
npm run prepare

# Verify build prerequisites
npm run verify

# Build backend and frontend, then package Electron app
npm run build

# Build for Windows specifically
npm run build:win

# Clean build artifacts
npm run clean
```

## Build Process

The Electron build follows a specific sequence:

1. **Backend Build**: Bundles backend with @vercel/ncc to `/electron/build-output/ncc-backend/index.js` (single-file executable)
2. **Frontend Build**: Vite builds to `/frontend/dist` (static HTML/JS/CSS)
3. **Prepare**: Runs `prepare-build.js` to clean and setup `/data` directory structure
4. **Verify**: Runs `verify-build.js` to ensure build artifacts exist
5. **Package**: electron-builder packages everything into installer

The packaged app includes:
- `main.js` from electron directory
- Backend bundle in `resources/backend/`
- Frontend static files in `resources/app/`
- Data directory structure in `resources/data/` (copied to user data on first run)

## Key Technical Details

### WhatsApp Connection

The system uses `@whiskeysockets/baileys` library for WhatsApp Web connection. Authentication state is persisted using multi-file auth state in `/data/auth`. The backend automatically attempts to reconnect on startup if valid auth state exists.

### Database Configuration

Dual database approach:
- **Local**: JSON files in `/data` directory for fast access and offline capability
- **Remote**: Supabase PostgreSQL for data backup and multi-device sync

Configuration is loaded from `/backend/config/index.js` which delegates to `supabase.js` (or `supabase.prod.js` in production).

### Proxy Support

The backend supports HTTP/HTTPS/SOCKS5 proxies configured in `/data/system.json`. Proxy settings are applied at both Electron and backend levels using `proxy-agent` and `https-proxy-agent` libraries.

### Environment-Specific Behavior

The backend detects its runtime environment:
- `ELECTRON_MODE=true` - Running inside Electron (production or dev)
- `NODE_ENV=production` - Production build
- Command-line argument for data directory path (passed by Electron main process)

Data directory resolution priority:
1. Command-line argument (e.g., `node index.js /path/to/data`)
2. `DATA_DIR` environment variable
3. Electron user data path (in packaged mode)
4. Relative path `../data` (development mode)

### Session Persistence

WhatsApp sessions are designed to persist across app restarts. The backend does NOT disconnect on graceful shutdown - instead, Baileys automatically saves authentication state on `creds.update` events.

## Frontend Routing

Uses HashRouter due to Electron's file:// protocol requirements. Main routes:
- `/login` - Authentication
- `/main` - Dashboard
- `/broadcast` - Message broadcasting
- `/groups` - Group management
- `/categories` - Group categories
- `/bills` - Billing management
- `/admins` - Admin user management
- `/settings` - System settings
- `/whatsapp` - WhatsApp connection status
- `/update` - Application updates

## Authentication

JWT-based authentication with tokens stored in localStorage. The backend validates tokens using jsonwebtoken library. Initial admin accounts are configured in `/data/config/admins.json`.

## Update Mechanism

The app includes a built-in update system:
- Frontend checks for updates via `/api/update/check`
- Downloads installers via backend proxy (`/api/update/download`)
- Electron main process handles installer execution via IPC
- Uses GitHub releases (haoyuehongdou/ws-updata repository)

## Testing Notes

- No test suite is currently configured (package.json shows `"test": "echo \"Error: no test specified\" && exit 1"`)
- Manual testing requires running backend, frontend dev server, and Electron simultaneously
- WhatsApp connection testing requires a valid phone number and QR code scanning

## Development Tips

1. When working with WhatsApp connection, always check `/data/auth` for session files and `/data/qr` for login QR codes
2. Backend logs are written to `/backend/logs` (development) or user data logs folder (production)
3. The backend includes automatic QR code cleanup every 10 minutes
4. Changes to backend require rebuild (`npm run build:backend`) before Electron packaging
5. The ncc bundler may require special handling for native modules - check `.nccignore` file
6. ASAR packaging excludes `sharp` and `@whiskeysockets/baileys` modules (defined in electron package.json asarUnpack)
