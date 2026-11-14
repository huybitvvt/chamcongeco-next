# Attendly UI

React 19 + TypeScript + Vite + IBM Carbon, Inter local. Không nhúng API key vào mã nguồn hoặc biến VITE.

```bash
bun install --frozen-lockfile
bun run dev --host 127.0.0.1
```

Backend phải chạy ở `127.0.0.1:8000`; Vite proxy `/api`. Với Docker, Nginx phục vụ cùng origin và chuyển API đến container nội bộ.

```bash
bun run lint
bun run test:unit
bun run build
bunx playwright install chromium
# Với dev server đang chạy:
node --test --test-concurrency=1 tests/*.mjs
node scripts/smoke-enrollment-worker.mjs
```

Windows dùng Edge: `$env:PLAYWRIGHT_CHANNEL='msedge'`. Test dùng camera/API giả; không đánh giá nhận diện sinh trắc học. [Hướng dẫn đầy đủ](../README.md).

Auto enrollment mặc định tự chọn 5 góc, không yêu cầu bấm chụp từng ảnh. MediaPipe chạy trong worker, được nạp khi bắt đầu; chỉ 5 ảnh cuối được gửi lên backend khi xác nhận lưu. `bun run dev`/`build` gọi script chuẩn bị tài nguyên cùng origin, pin SHA-256. Không commit `public/vision/` hoặc ảnh camera. [Chi tiết](../docs/AUTO_ENROLLMENT.md).
