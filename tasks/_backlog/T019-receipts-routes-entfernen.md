# T019 — Alte /receipts-Routen entfernen

> **Owner:** Steve
> **Priorität:** P2
> **Dependencies:** T014 stable (mind. 1 Monat in Production)

## Ziel

Migration von alten /receipts-Seiten (Pre-Reboot) zu neuen /belege-Seiten abgeschlossen. Alte Routen entfernen.

## Akzeptanz-Kriterien

- [ ] `webapp/src/pages/UploadPage.tsx`, `ReceiptsPage.tsx`, `ReceiptDetailPage.tsx` entfernt
- [ ] `webapp/src/api/receipts.ts` entfernt (oder als deprecated markiert)
- [ ] Routen aus `App.tsx` entfernt
- [ ] Navigation in Layout: nur noch `/belege`
- [ ] Bookmark-Redirect: `/receipts/*` → `/belege/*`
- [ ] alle Tests aktualisiert

## Hintergrund

T014 hat die neuen /belege-Seiten (BelegeListPage, BelegeUploadPage, BelegeDetailPage) implementiert.
Die alten /receipts-Seiten coexistieren noch im Repo — nach Stabilisierung in Production entfernen.
