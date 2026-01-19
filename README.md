# Telegram Bot Setup

1.  **Move this Folder**: Drag and drop the `EXPORT_TO_DESKTOP` folder to your Desktop (you can rename it to `TelegramBot`).
2.  **Open Terminal**: Open a terminal/command prompt inside this new folder.
3.  **Install Dependencies**: Run:
    ```bash
    npm install
    ```
4.  **Configure Environment**:
    -   Rename `.env.example` to `.env`.
    -   Open `.env` in a text editor (Notepad, VS Code).
    -   Fill in your `BOT_TOKEN` (from BotFather).
    -   Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from Supabase Dashboard).
5.  **Run Bot**:
    ```bash
    node bot.js
    ```
