# SoundScribe

**SoundScribe** is an AI-powered knowledge ecosystem that reconstructs audio into a dynamic, interactive learning environment. It transforms passive listening into deep, visual, and conversational understanding for students and professionals.

## 🚀 Key Features

*   **Multi-Source Input**: Import audio via **YouTube Link** (using `yt-dlp`) or direct MP3 uploads.
*   **Visual Knowledge Graph**: Automatically abstracts complex discussions into an **Interactive Knowledge Graph**. Unlike basic mind maps, this engine charts multi-dimensional semantic relationships with functional descriptions for every node.
*   **Dual-Context AI Chatbot**: A tethered assistant linked to both the **Knowledge Graph** and the **Transcript**. It provides hyper-accurate, context-aware answers by cross-referencing visual entities with exact moments in the audio.
*   **Active Recall Tools**: Instantly generates **Interactive Flashcards**, Quizzes, and summaries for effective revision.
*   **Precision Navigation**: A word-level synced transcript powered by **Whisper Turbo** allows users to jump to any moment in the recording by clicking the text.

## 🧠 The AI Brain

*   **LLM Analysis**: Powered by **Llama 3.3 70B Versatile** for advanced semantic extraction and structural mapping.
*   **Transcription**: Uses **Whisper Large v3 Turbo** for near-instant, word-accurate text generation.
*   **Infrastructure**: Fully integrated with **Supabase** for PostgreSQL data management, authentication, and high-performance Object Storage.

## 🛠️ Tech Stack

*   **Frontend**: React (Vite), Tailwind CSS, React Flow (Graphs), Framer Motion (Animations).
*   **Backend**: Node.js, Express, TypeScript, Drizzle ORM.
*   **Utilities**: `yt-dlp`, `ffmpeg`, `tsx`.

## 📦 Getting Started

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Dylan42415/SoundScribe.git
    cd SoundScribe
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up environment variables**:
    Create a `.env` file based on `.env.example` and fill in your Supabase and API credentials.

4.  **Run migrations**:
    ```bash
    npm run db:push
    ```

5.  **Start development server**:
    ```bash
    npm run dev
    ```
