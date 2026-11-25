# @iot/cuetrack-pay — Customer Pay & Play portal

Phones scan the table QR → `/p/<tableRef>` → pay via M-Pesa → release balls.
API calls go to `/papi/*`, rewritten to `${BACKEND_URL:-http://localhost:8081}/api/v1/public/*`.

```bash
# dev (port 3004)
npm run dev --workspace=@iot/cuetrack-pay
# build
npx turbo run build --filter=@iot/cuetrack-pay
# start
BACKEND_URL=http://localhost:8081 npm run start --workspace=@iot/cuetrack-pay
```
