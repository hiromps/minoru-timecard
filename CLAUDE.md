# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Japanese timecard management system with individual work time settings. It's designed for internal company use with security features including IP restrictions.

### Tech Stack
- **Frontend**: React 18 + TypeScript + CSS3
- **Backend**: Node.js + Express + TypeScript + SQLite3
- **Database**: SQLite (timecard.db in backend directory)

## Commands

### Development
```bash
# Install dependencies
npm install                    # Frontend dependencies
cd backend && npm install      # Backend dependencies

# Start development servers
cd backend && npm run dev      # Backend (port 3001)
npm start                      # Frontend (port 3000)
```

### Production
```bash
# Build
npm run build                  # Frontend build
cd backend && npm run build    # Backend build (TypeScript compilation)

# Start production
cd backend && npm start        # Backend production server
```

### Testing
```bash
npm test                       # Frontend tests with Jest/React Testing Library
```

## Architecture

### Security Architecture
- **IP Restriction**: Controlled via `backend/config/allowed-ips.json` using CIDR notation
- **Admin Authentication**: Password-based with session management
- **Network Isolation**: Designed for internal corporate network use only

### Database Schema
Two main tables:
- `employees`: Employee data with individual work schedules
- `time_records`: Clock-in/out records with automatic status determination

### Component Structure
- `TimeClock.tsx`: Main time-clock interface for employees
- `AdminLogin.tsx`: Admin authentication
- `AdminDashboard.tsx`: Admin interface for records management
- `EmployeeManagement.tsx`: Employee CRUD operations

### API Architecture
RESTful API with three main route groups:
- `/api/employees`: Employee management
- `/api/time-records`: Time tracking (clock-in/out, records)
- `/api/admin`: Admin authentication

### Status Logic
Automatic status determination based on individual employee schedules:
- Normal: Within scheduled hours
- Late: Clock-in after individual start time
- Early departure: Clock-out before individual end time  
- Overtime: Work duration exceeding 8 hours

## Security Configuration

### IP Access Control
- Main config: `backend/config/allowed-ips.json`
- Admin-specific IPs via `ADMIN_ALLOWED_IPS` env var
- Current setup allows 192.168.24.0/24 network range

### Admin Password
- Located in `backend/src/middleware/auth.ts`
- Default: "admin123" (should be changed in production)

### Network Setup
- Reference `NETWORK_SETUP.md` for current IP configuration
- Windows firewall rules needed for ports 3000/3001
- See `SECURITY_GUIDE.md` for comprehensive security setup

## Database Management

### Database File
- Located: `backend/timecard.db`
- Auto-created on first run
- Contains employees and time_records tables

### Data Export
- Excel (.xlsx) and CSV export functionality
- Japanese text encoding support for CSV

## Important Files

- `SECURITY_GUIDE.md`: Complete security implementation guide
- `NETWORK_SETUP.md`: Current network configuration details  
- `README_USAGE.md`: End-user operation manual
- `backend/config/allowed-ips.json`: IP access control configuration
- `backend/src/middleware/ipRestriction.ts`: IP filtering logic
- `backend/src/middleware/auth.ts`: Admin authentication logic

## Development Notes

### TypeScript
- Both frontend and backend use TypeScript
- Separate tsconfig.json files for each part

### CORS Configuration
- Configured for localhost:3000 in development
- Production origin should be set via CORS_ORIGIN env var

### Session Management
- 8-hour timeout
- IP-bound sessions
- Single session per employee ID

This is a security-focused internal system - maintain IP restrictions and authentication mechanisms when making changes.