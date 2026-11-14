# Kết quả kiểm chứng

Ngày 14/11/2026. Máy phát triển Windows, Intel Core i3-1215U, RAM 8 GB, ONNX CPU 1 luồng, OpenCL tắt. Đây không phải cấu hình server của đơn vị; chưa có thông tin server và số camera đồng thời. Không có số đo GPU.

## Phần mềm

- **67 test Python đạt**, gồm bộ regression cũ và runtime mới: vào/ra, giữ giờ đầu, retry sau restart, concurrent intents, lỗi ảnh/DB, pending hết hạn, timezone, consent, quyền kiosk/admin, profile model và CSV import. 2 cảnh báo thư viện: legacy `pkg_resources` và Starlette TestClient/httpx.
- **27 kiểm tra PostgreSQL đạt** qua PGlite: migration chạy lại được, reserve/complete, object ảnh bắt buộc, idempotency, cooldown, giữ model cũ và quyền anon. PGlite dùng một kết nối; không chứng minh khóa đồng thời giữa nhiều session Supabase thật.
- **6 test trình duyệt đạt** trên Edge với fake camera/API: UI desktop/mobile 1440–320 px, bàn phím, consent, chụp nhiều ảnh, dừng camera, vào/ra, không tự checkout, phân quyền, cập nhật mặt cũ, mất phản hồi và khôi phục sau reload.
- Một lượt nối **UI thật → API thật → ONNX/PAD thật → SQLite/ảnh thật → biên nhận** cũng đạt, dùng danh tính tổng hợp và video camera giả từ ảnh developer public trong DB riêng. Không mock API/model, không đụng dữ liệu nhân viên; vẫn không là kiểm chứng camera vật lý hoặc liveness ngoài thực tế. Script tùy chọn: `frontend/scripts/smoke-real.mjs`.
- Cài lại bản xuất sạch không có dlib/Torch/DeepFace: **31 test mặc định đạt**. 36 test prototype bổ sung chỉ chạy khi cài extra `legacy`.
- Frontend TypeScript/build và lint đạt; Carbon hiện phát cảnh báo deprecation Sass khi build. Không có lỗi build từ các cảnh báo đó.
- Native SCRFD decode/landmark và embedding đối chiếu InsightFace SDK 2.1 trên 3 ảnh public: bbox/landmark lệch <0.001 px, cosine embedding >0.999999, crop căn chỉnh lệch pixel tối đa 1. Hai context crop PAD đối chiếu nguồn MiniVision/DeepFace trùng pixel trên 6 ảnh.

Chi tiết chạy mới nhất còn được ghi trong GitHub Actions của repository. CI Linux kiểm tra cài môi trường mặc định, SQL, UI, ONNX HTTP smoke và build container; chỉ coi là đạt khi workflow thực sự xanh.

## API thật, không thay model hoặc kho ảnh/DB bằng mock

Script `backend/scripts/benchmark_runtime.py` khởi động Uvicorn trên localhost, dùng ONNX thật, SQLite WAL, JPEG minh chứng được fsync và lưu riêng. Gallery **200 người ×5 template**: một hồ sơ từ ảnh developer public, các hồ sơ còn lại tổng hợp. Đồng hồ test tăng ngày để mỗi lượt tạo record/ảnh mới, không vô tình đo toàn bộ ở nhánh trả biên nhận trùng. Dữ liệu tạm bị dọn sau benchmark, không đụng DB đang sử dụng.

| Đường xử lý | Mẫu | P50 | P95 | Lớn nhất |
|---|---:|---:|---:|---:|
| Nhận diện + PAD + match + HTTP localhost + ảnh + SQLite + phản hồi | 600 | 64.16 ms | 103.00 ms | 304.86 ms |
| Gửi lại UUID đã xác nhận, trả nguyên biên nhận | 600 | 5.49 ms | 7.84 ms | 9.74 ms |

Đây là lượt đo lại sau khi hoàn tất hợp đồng response API. Lượt 600 mẫu trước đó có P50 66.26 ms, P95 104.92 ms và một lượt chậm **1.48 giây**; giữ cả báo cáo trước tại `benchmarks/runtime-cpu-600-prior.json`, không loại ngoại lệ để tuyên bố SLA. Model warm-up khoảng 433 ms trong lượt mới (không gồm tải model, cài package hoặc cold boot toàn tiến trình). Mỗi lượt đo tạo đúng **601 ảnh** cho 600 lượt riêng và một lượt trong đợt burst; retry không tạo ảnh trùng.

Burst 4 client/40 yêu cầu: **24 HTTP 200, 16 HTTP 429**, không có 5xx, P95 toàn bộ yêu cầu khoảng 144 ms. 429 là backpressure, **không phải 40 lượt chấm công thành công**. Chưa thể suy ra đủ phục vụ bao nhiêu camera liên tục trên server thật. Mẫu khoảng một phút cũng không thay thế chạy bền nhiều giờ/ngày.

Mạng WAN, camera/browser capture, HTTPS, Supabase DB/Storage thật không nằm trong số đo 64/103 ms trên. Phản hồi tại người dùng còn cộng các phần này. Không so trực tiếp số đó với thời gian AI đơn thuần của bản cũ.

## Nghiên cứu trước triển khai

Trên cùng máy, microbenchmark 60 ảnh lặp từ 3 ảnh mẫu, gallery 200 vector tổng hợp:

| Pipeline AI | P50 | Ghi chú |
|---|---:|---|
| dlib + DeepFace/PyTorch cũ | 517.9 ms | Có phát hiện/tiền xử lý lặp |
| YuNet + SFace + MiniFASNet ONNX | 43.7 ms | Ứng viên đã đo |
| buffalo_sc + MiniFASNet ONNX | khoảng 30 ms | Chọn cho CPU trong bản này |
| buffalo_l @320 / @640 | khoảng 563 / 766 ms | Không chọn mặc định CPU máy thử |

Đây là thời gian tính toán AI, không phải tiền API; không gồm mạng/DB/ảnh. Lựa chọn buffalo_sc dựa trên tốc độ/cách tích hợp ở máy thử, **không khẳng định độ chính xác sinh trắc học cao nhất**.

## Chống giả mạo và độ chính xác: giới hạn thực tế

Hai mẫu `image_F1.jpg`, `image_F2.jpg` của [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/tree/master/images/sample) bị từ chối 403; mẫu `image_T1.jpg` được chấp nhận. Chỉ là smoke test đúng đường model.

Ba ảnh chân dung developer public thông thường cũng có điểm live cao và được chấp nhận. Điều này cho thấy **không thể coi PAD RGB này là bảo đảm chặn mọi ảnh/video**. Không suy diễn smoke test thành tỷ lệ chống replay, FAR/FRR hay nhận đúng nhân viên. Chưa có mẫu thật của 200 người và chưa đo ở camera triển khai.

Để nghiệm thu, cần test nhận đúng/nhầm/người lạ, nhiều điều kiện và ảnh in/video trên thiết bị thật theo [OPERATIONS.md](OPERATIONS.md). Nếu yêu cầu chống gian lận cao mà RGB PAD không đạt, phải đánh giá phần cứng IR/depth hoặc xác thực bổ sung. Chưa có cam kết tuyệt đối hoặc chứng nhận sinh trắc học.

## Chưa được xác minh trong môi trường triển khai

- Supabase/Storage thật, timeout WAN và triển khai hosting của đơn vị.
- GPU, nhiều camera chạy liên tục, khả năng chịu tải server thật.
- Độ chính xác trên nhân viên và hiệu quả chống ảnh/video ngoài bộ mẫu nhỏ.
- Chạy bền nhiều giờ/ngày, backup/restore trên dữ liệu vận hành thực tế.

Không có thay đổi nào được đẩy lên repository gốc. Repository public mới dùng lịch sử sạch, không kèm dữ liệu khuôn mặt/nhân viên hoặc model weights.
