# SoundScribe - AI-Powered Audio Learning Assistant

## Overview

SoundScribe is an AI-powered learning application that transforms audio recordings into actionable study materials. Users can record lectures or upload audio files (MP3, WAV, M4A), which are then automatically transcribed and processed to generate summaries, mind maps, and study guides. The application includes accessibility features like dyslexia-friendly fonts and high contrast mode, along with a coin-based usage system.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom educational color palette (soft blues, greens, warm accents)
- **Animations**: Framer Motion for page transitions and UI animations

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for validation
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Authentication**: Replit Auth with Passport.js, session-based using connect-pg-simple

### Data Storage
- **Primary Database**: PostgreSQL for user data, recordings metadata, and session storage
- **Object Storage**: Google Cloud Storage via Replit's object storage integration for audio files
- **Schema Location**: `shared/schema.ts` contains all table definitions

### Audio Processing Pipeline
- **Recording**: Browser-based audio recording using custom `useVoiceRecorder` hook
- **Upload**: Presigned URL flow using Uppy for file uploads to object storage
- **YouTube Import**: `POST /api/recordings/youtube` uses `@distube/ytdl-core` + ffmpeg to download audio, upload server-side to object storage, and create a recording that enters the same processing pipeline
- **Transcription**: OpenAI Whisper API for speech-to-text
- **AI Analysis**: OpenAI GPT models generate summaries, mind maps, and study guides
- **Status Tracking**: Recordings move through pending → processing → completed/failed states

### Knowledge Graph View Modes
- **Learner-friendly** (default): simplified everyday verbs for edge labels, plain-language node names
- **Semantic strict**: technical predicate vocabulary (`defines`, `invokes`, `decomposes_into`, etc.) — original labels before simplification pass
- Both versions stored in the DB (`knowledgeGraph` = learner, `rawKnowledgeGraph` = semantic)
- Toggle appears in the graph toolbar only when both datasets are available (recordings processed after the feature was added)

### Key Design Patterns
- **Shared Types**: Schema and route definitions in `shared/` directory are used by both client and server
- **Integration Modules**: Replit integrations (auth, chat, audio, image, object storage) are modular and located in `server/replit_integrations/`
- **Type-Safe API**: Zod schemas validate both request inputs and response outputs

## External Dependencies

### AI Services
- **OpenAI API**: Used for Whisper transcription, GPT chat completions, text-to-speech, and image generation
- **Configuration**: API key and base URL provided via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables

### Cloud Storage
- **Google Cloud Storage**: Audio files stored via Replit's object storage sidecar service at `http://127.0.0.1:1106`
- **Upload Flow**: Presigned URLs requested from backend, client uploads directly to storage

### Database
- **PostgreSQL**: Connection via `DATABASE_URL` environment variable
- **Session Store**: Sessions table for Replit Auth persistence
- **Migrations**: Managed via Drizzle Kit with config in `drizzle.config.ts`

### Authentication
- **Replit Auth**: OpenID Connect integration with Replit's identity provider
- **Session Secret**: Configured via `SESSION_SECRET` environment variable

### Frontend Libraries
- **Uppy**: File upload handling with AWS S3-compatible presigned URL flow
- **Recharts**: Data visualization for study time and usage statistics
- **date-fns**: Date formatting and manipulation