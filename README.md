# Varakorn portfolio

The homepage opens as an XP-style desktop. Click a shortcut to open its window, drag the title bar to move it, or drag the bottom corner to resize. Reopen a minimized window from its shortcut.

On phones the launcher becomes a silver Varakorn SP. The D-pad moves the selection, A opens it, B goes back, Start returns home, and Select opens Help. Inside an article, up and down scroll and left and right select links. The screen also supports direct touch. The speaker button remembers the visitor's sound preference.

## Local development

```bash
npm install
npm run dev
npm run build
npm run preview
```

Copy the applicable settings from `.env.example` into a local `.env` for the account, guestbook and chat APIs. AI Chat uses the existing sign-in and conversation history.

## Editing and verification

Edit portfolio data in `src/js/data.js`, chapter and policy text in their HTML files, and app navigation, layout and controls in `src/retro/`. Wallpaper and application icons live in `public/retro/`. Existing URLs serve readable HTML and open their content inside the appropriate app.

With the dev server running, use `npm run check:retro` for window and handheld interactions and screenshots, and `npm run check:seo` for static content and deep links. Set `PORTFOLIO_PREVIEW_URL` to test a port other than 5173. The browser checks use a local Microsoft Edge installation.

## Deploy (Cloudflare)

See [the deployment guide](docs/cloudflare.md). The site and all six APIs run on one
Cloudflare Worker. Supabase remains the database, sign in and avatar storage provider;
Gemini remains the chat provider.

```bash
npm run check:cloudflare
npm run dev:cloudflare
npm run deploy:cloudflare
```
