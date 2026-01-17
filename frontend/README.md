# Zentoria Personal Edition - Frontend

Modern Next.js 14 frontend for the Zentoria Personal AI Control Plane.

## Features

- **Dashboard** - System health, metrics, and quick actions
- **AI Chat** - Real-time streaming chat with file attachments
- **File Browser** - Grid/list view, drag-and-drop upload, preview
- **Workflows** - n8n workflow monitoring and control
- **API Keys** - Create and manage API access tokens
- **Settings** - Configure AI, storage, and preferences
- **Logs** - Real-time system log viewer

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Real-time**: Socket.io Client

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://10.10.40.101:4000
NEXT_PUBLIC_WS_URL=ws://10.10.40.101:4000
NEXT_PUBLIC_APP_NAME=Zentoria Personal
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard
│   ├── chat/              # AI Chat interface
│   ├── files/             # File browser
│   ├── workflows/         # Workflow monitoring
│   ├── keys/              # API key management
│   ├── settings/          # System settings
│   └── logs/              # Log viewer
├── components/
│   ├── ui/                # Reusable UI components
│   ├── layout/            # App shell, sidebar, header
│   └── providers/         # Context providers
├── lib/
│   ├── api-client.ts      # API client with axios
│   └── utils.ts           # Utility functions
├── stores/                # Zustand state stores
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions
```

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# Or build manually
docker build -t zentoria-frontend .
docker run -p 3000:3000 zentoria-frontend
```

## Development

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build for production
npm run build
```

## API Integration

The frontend connects to the backend API at `http://10.10.40.101:4000`.

Key endpoints:
- `/api/health` - System health
- `/api/chat/*` - Chat operations
- `/api/files/*` - File operations
- `/api/workflows/*` - Workflow management
- `/api/keys/*` - API key management
- `/api/settings` - System settings
- `/api/logs` - Log entries

## Design System

Based on the Zentoria Design System:
- **Primary Color**: Orange (#f97316)
- **Dark Mode**: Default theme
- **Typography**: Inter + JetBrains Mono
- **Components**: shadcn/ui style

## License

Proprietary - Zentoria Personal Edition
