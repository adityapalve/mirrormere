# Photo Map Visualization (Cloud-Backed)

A cloud-ready photo map that ingests images from object storage, extracts EXIF/GPS metadata, and renders them on a Mapbox + deck.gl globe.

## Architecture

```
photo-map/
├── app/
│   ├── api/photos/           # Metadata + asset delivery
│   ├── api/icloud/           # iCloud sync routes
│   └── components/PhotoMap.tsx
├── lib/                      # DB + storage + sync helpers
└── icloud-worker/            # Fly.io worker service
```

## Setup

### 1) Upload photos to object storage

- Put originals in the `photos/` prefix (configurable).
- (Optional) Put thumbnails in a separate prefix (set `THUMBNAIL_PREFIX`) with matching filenames.

### 2) Configure environment variables

Required:
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `TURSO_DATABASE_URL`
- `PHOTO_BUCKET`
- `WORKER_BASE_URL`
- `WORKER_JWT_SECRET`
- `CREDENTIALS_KEY` (base64 32-byte key)

Optional (recommended for cloud deployments):
- `TURSO_AUTH_TOKEN`
- `S3_ENDPOINT` (for R2/Backblaze)
- `S3_REGION` (defaults to `auto`)
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
- `PHOTO_PREFIX` (defaults to `photos/`)
- `THUMBNAIL_PREFIX` (set only if you upload thumbnails)
- `PUBLIC_ASSET_BASE_URL` (CDN/base URL for public assets)
- `PHOTO_SOURCE_ID` / `PHOTO_SOURCE_LABEL`

Generate `CREDENTIALS_KEY` with `openssl rand -base64 32`.

### 3) Run the app

```bash
npm run dev
```

Open http://localhost:3000 and click **Sync now** to ingest photos.

## Sync Workflow

- Sync now calls the iCloud worker, which pulls photos into object storage.
- `/api/icloud/sync` then indexes EXIF/GPS metadata into SQLite (Turso/libSQL).
- `/api/photos` returns photo metadata plus URLs.
  - If `PUBLIC_ASSET_BASE_URL` is set, URLs point directly to your CDN.
  - Otherwise, `/api/photos/:id` streams from object storage.

## iCloud worker

The UI stores your Apple ID + app-specific password (encrypted) and uses the Fly.io worker to pull photos directly into object storage.

## Worker environment (Fly.io)

Set these on the Fly app:
- `PHOTO_BUCKET`
- `S3_ENDPOINT` / `S3_REGION`
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
- `PHOTO_PREFIX`
- `WORKER_JWT_SECRET` (must match the Next.js app)

## Map Customization

Mapbox style is set in `app/components/PhotoMap.tsx` via `mapStyle`.

## Troubleshooting

- **Missing Mapbox token**: set `NEXT_PUBLIC_MAPBOX_TOKEN`.
- **Sync errors**: confirm `PHOTO_BUCKET` + S3 credentials are valid.
- **No photos**: ensure EXIF GPS data exists and `photos/` prefix matches.
