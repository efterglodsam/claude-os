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
npm run dev     # http://localhost:5173
```

WASD/pilar = gå, mus = titta (klicka i scenen först), **E** = interagera, Esc = släpp musen.
Knapparna uppe till höger öppnar samma paneler utan att gå dit.

## Status

Agenterna och siffrorna är **simulerade** (`tick` i `src/store.ts`). Allt sparas i webbläsarens localStorage.
Nästa steg för riktig drift: ersätt `tick` med anrop mot riktiga tjänster (t.ex. Claude-agenter som hittar/klipper video,
YouTube/TikTok-statistik, Printful/Shopify-ordrar) via en liten backend.

## Struktur

- `src/store.ts` – tillstånd (businesses, agenter, jobb) + simuleringen
- `src/templates.ts` – mallar för Clipping/POD/egen
- `src/scene/` – react-three-fiber: våning, skrivbord, whiteboard, spelare
- `src/ui/` – HUD och paneler (Kanban, statistik, agent, hiss, ny business)
