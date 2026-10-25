# Online HVSC catalogue

SIDtune can browse and stream the whole High Voltage SID Collection from a static file host, so users open the site and just play.
Without a catalogue URL the app still works exactly as before (import your own folder).

## Read this before putting the data on the internet

HVSC's own `DOCUMENTS/Disclaimer.txt` says every tune is copyrighted and that use "for any purpose other than private enjoyment" is
subject to copyright law and may need the rights holders' permission. HVSC's maintainers state they cannot grant licences themselves.
A public site that serves the files to anyone is that kind of use. **Do not make the pack files publicly reachable until you have
permission** (the disclaimer names Chris Abbott as the first point of contact). Until then, keep the host private (see "Keeping it
private") or use it only with `npm run dev`. The index and STIL alone carry no audio, but they are HVSC's data too.

## How it works

`tools/build-hvsc.mjs` turns an unpacked `C64Music` folder into four kinds of static file:

| File | Purpose |
| --- | --- |
| `manifest.json` | Tiny; the app re-fetches it on every start to spot a new HVSC release |
| `index.<hash>.json` | One row per tune: title, composer, year, subtunes, song lengths, location in a pack (about 9 MB, 2 MB compressed) |
| `stil.<hash>.txt` | HVSC's STIL notes |
| `pack-<release>-NNN.bin` | The `.sid` files concatenated into ~90 MB parts |

The app downloads the index once (cached in IndexedDB), so search is instant and offline-capable. A tune is fetched with an HTTP
`Range` request for just its bytes (about 5 KB) when you play it, then cached locally. The next tune in the queue is prefetched.

## Build

```bash
node tools/build-hvsc.mjs /path/to/C64Music        # writes ./hvsc-build (needs Node >= 22.18)
npm run dev                                       # serves ./hvsc-build at /hvsc automatically
```

## Host on Cloudflare R2

1. Create an R2 bucket (for example `sidtune-hvsc`) and attach a custom domain such as `hvsc.example.com` under **Settings → Custom
   domains**. (The `r2.dev` URL is rate-limited and meant for testing.)
2. Create an R2 API token, then upload with [rclone](https://developers.cloudflare.com/r2/examples/rclone/):

   ```bash
   rclone copy hvsc-build r2:sidtune-hvsc --header-upload "Cache-Control: public, max-age=31536000, immutable" --progress
   rclone copyto hvsc-build/manifest.json r2:sidtune-hvsc/manifest.json --header-upload "Cache-Control: no-cache"
   ```

   File names contain a hash or release number, so they can be cached forever. Only `manifest.json` must be revalidated.
3. Add a CORS policy to the bucket (**Settings → CORS policy**):

   ```json
   [
     {
       "AllowedOrigins": ["https://your-site.pages.dev", "http://localhost:5173"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["Range"],
       "ExposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```
4. In the Cloudflare Pages project add the build variable `VITE_HVSC_URL=https://hvsc.example.com` and redeploy. (The value is baked in
   at build time.)

## New HVSC releases

Unpack the new release, rerun `node tools/build-hvsc.mjs`, and upload again. Pack names include the release number, so old and new can
sit side by side; the new `manifest.json` switches everyone over, and open apps pick it up on their next start.

## Keeping it private while you test

Cloudflare Access (Zero Trust) can put a login in front of the bucket's custom domain, or you can leave `VITE_HVSC_URL` unset on the
production site and run the catalogue only locally with `npm run dev`.
