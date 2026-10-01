# Clipfarm

Ett 3D-kontor (inspirerat av [cubefarm](https://github.com/leonvanzyl/cubefarm)) där du styr din clipping-verksamhet – och andra businesses som POD – genom att gå runt i kontoret.

- **En våning per business** (Clipping, POD, egna). Hissen tar dig mellan våningarna.
- **Skrivbord = AI-agenter.** Varje agent har en roll (ett steg i flödet), en skärm med aktuellt jobb och en framstegsmätare.
- **Whiteboard = Kanban.** Lägg till jobb, tryck ▶ Starta så plockar agenterna upp dem steg för steg.
- **Statistik-skärm.** Klara jobb, visningar/ordrar och intäkt per business.
- **Nya businesses** via "+ Ny business": mallar för Clipping och POD, eller egen mall med egna steg.

## Kör

```bash
cd clipfarm
npm install
cp .env.example .env     # fyll i ANTHROPIC_API_KEY m.m.
npm run server           # backend (agenterna) på :8787
npm run dev              # 3D-kontoret på http://localhost:5173
```

Förutsättningar för riktiga klipp: `ffmpeg` och `yt-dlp` i PATH (`pip install yt-dlp`). `whisper` är valfritt (används om en video saknar undertexter).
WASD/pilar = gå, mus = titta (klicka i scenen först), **E** = interagera, Esc = släpp musen.

## Så jobbar agenterna (Clipping-våningen är "live")

1. Klistra in en länk till ett helt avsnitt i Kanban och tryck ▶ Starta.
2. **Scout** – laddar ner video + undertexter (yt-dlp), skickar transkriptet och communityts regler till Claude som väljer de bästa klippen.
3. **Editor** – ffmpeg klipper ut dem, gör 9:16 och bränner in undertexter.
4. **QA** – Claude granskar varje klipp mot reglerna; underkända klipp sorteras bort.
5. **Publicerad** – godkända klipp postas i din Discord (webhook/bot) och ligger i `data/clips/`. Kortet i Kanban länkar till klippen.

Misslyckade jobb visas med felmeddelande och ↻ Försök igen. Bakom varje steg finns riktig arbetslogik – ingen simulering på Clipping-våningen.

### Regler från Discord-communityt

Agenterna **måste** ha reglerna: öppna Statistik → "Regler", klistra in dem från communityts regelkanal och spara. Jobb kan inte startas innan regler finns.
Äger/administrerar du servern kan en bot hämta dem automatiskt (`DISCORD_BOT_TOKEN` + `DISCORD_RULES_CHANNEL_ID`, Message Content Intent på) via knappen "Hämta från Discord-kanal".
Är du bara medlem i communityt: klistra in manuellt (använd aldrig ditt eget användarkonto/token för automation – det bryter mot Discords villkor).
Längdgränser som reglerna anger sätter du även i `.env` (`MIN_/MAX_CLIP_SECONDS`) – de valideras hårt i koden, inte bara av Claude.

### Statistik

Statistik-panelen och skärmen i kontoret hämtar live-siffror från YouTube (API-nyckel), TikTok (access token, kräver godkänd app), Instagram (Graph API, business/creator-konto) och Discord (bot). Plattformar som inte är konfigurerade visar vad som saknas.

## Status och begränsningar (ärligt)

- Testat här: hela flödet Scout→Editor→QA→publicering med riktig ffmpeg och en lokal testvideo, i `CLAUDE_MOCK=1`-läge, samt UI:t mot backend. **Inte testat mot riktiga tjänster**: Claude-anrop, yt-dlp-nedladdning, Discord, YouTube/TikTok/Instagram – det kräver dina nycklar. Räkna med justeringar första gången.
- Kostnad: Scout skickar hela transkriptet till Claude (ett 2–3 h-avsnitt ≈ 30–60k tokens in). Byt modell med `CLAUDE_MODEL` om du vill sänka kostnaden.
- Klippen skickas **inte** automatiskt in till Julian Doreys program – de postas i din Discord och sparas lokalt. Kontrollera communityts regler för hur inskick ska gå till.
- POD-våningen (och egna businesses) är fortfarande **simulerade**; riktiga POD-agenter (design, mockups, listning) är nästa steg.
- 9:16 görs med en enkel mittbeskärning – bra för en talare, mindre bra när flera personer sitter i bredbild.

## Struktur

- `server/` – backend: `pipeline.ts` (agentflödet), `claude.ts`, `media.ts` (yt-dlp/ffmpeg), `discord.ts`, `stats.ts`, `rules.ts`
- `src/store.ts` – tillstånd; live-businessen speglar backendens jobb, övriga simuleras
- `src/templates.ts` – mallar för Clipping/POD/egen
- `src/scene/` – react-three-fiber: våning, skrivbord, whiteboard, spelare
- `src/ui/` – HUD och paneler (Kanban, statistik, regler, agent, hiss, ny business)
