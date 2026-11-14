# Đăng ký tự thu 5 góc

Mặc định đăng ký bằng camera sẽ tự chọn **thẳng → trái nhẹ → phải nhẹ → ngẩng nhẹ → cúi nhẹ**. Chọn đúng nhân viên khi cập nhật hồ sơ để giữ mã và lịch sử chấm công.

## Sử dụng

1. Điền họ tên và xác nhận nhân viên đồng ý lưu dữ liệu khuôn mặt.
2. Bấm **Bắt đầu thu 5 góc**, cho phép camera nếu trình duyệt yêu cầu. Lần đầu có thể phải tải bộ hướng dẫn; trạng thái tải được hiển thị.
3. Nhìn thẳng, quay nhẹ theo hướng dẫn. Mỗi góc cần giữ ổn định khoảng nửa giây; không phải bấm Chụp ảnh. Mặt mờ/tối, quá xa/gần, bị cắt, nhắm mắt hoặc nhiều người sẽ được nhắc chỉnh lại.
4. Đủ 5 góc thì camera tự dừng. Kiểm tra các thumbnail, bấm **Chụp lại** ở đúng góc cần thay hoặc **Thu lại 5 góc** để bắt đầu lại. Bấm **Lưu nhân viên** sau khi xem lại.
5. Nếu backend từ chối một ảnh, ô góc tương ứng được đánh dấu. Chụp lại góc đó trước khi lưu; không cần thu lại toàn bộ. Đổi người giữa các ảnh sẽ bị backend từ chối khi vector không nhất quán.

**Dừng thu** giữ các ảnh đã chọn để tiếp tục. Chuyển màn hình/ẩn tab sẽ dừng camera và worker. Đổi sang **Tải ảnh lên** bỏ bộ ảnh chưa lưu và cho chọn 1–5 JPG/PNG có sẵn; dùng khi thiết bị không hỗ trợ tracker hoặc camera bị từ chối.

## Cách hoạt động

- MediaPipe Tasks Face Landmarker 1.2.3 chạy CPU trong module Web Worker, tối đa 2 mặt để phát hiện người thứ hai. Bật transformation matrix, tắt blendshapes. Browser phân tích ảnh thu nhỏ tối đa 640 px, giữ bản gốc tối đa 1280 px để chọn ảnh.
- Một frame đang xử lý; timestamp video mới và giới hạn nhịp gửi khoảng 9 frame/giây, thích ứng theo thời gian xử lý. Không xếp hàng dài; không chọn 5 ảnh bằng timer cố định.
- Chỉ chọn mẫu khi pose và chất lượng đạt liên tục 550 ms, ít nhất 4 frame; khoảng đứt lớn/rung sẽ reset. Ảnh nét nhất trong cửa sổ được giữ. JPEG lấy từ **đúng frame đã được đánh giá**, không từ khung mới sau khi worker trả kết quả.
- Preview được mirror để dễ nhìn; ảnh phân tích/embedding giữ nguyên chiều gốc. Nhãn trái/phải theo người đứng trước camera. Mẫu thẳng được dùng làm mốc tương đối cho các góc tiếp theo.
- Worker không gửi hình lên dịch vụ ngoài. Chỉ khi quản trị xác nhận lưu, app gửi 5 JPEG qua API có xác thực. Backend kiểm tra consent, đúng bộ pose, số mặt, chất lượng, cùng người và trùng hồ sơ trước khi lưu cả bộ.

Các ngưỡng ban đầu nằm trong `frontend/src/enrollment/{pose,quality}.ts`. Cần nghiệm thu trên camera/ánh sáng thật trước khi chỉnh; không hạ ngưỡng chỉ để thu đủ ảnh nhanh. Khoảng pose được chọn nhẹ, không yêu cầu xoay đầu 90°. Những người không thể thực hiện tư thế có thể dùng ảnh có sẵn với quản trị hỗ trợ.

## Tài nguyên và đóng gói

`bun run prepare:vision` chuẩn bị tài nguyên (dev/build tự gọi):

- `public/vision/face-landmarker-64184e229b263107.task`, 3,758,596 byte, SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- `public/vision/tasks-vision-1.2.3/vision_wasm_module_internal.{js,wasm}`, copy từ SDK đã pin và kiểm tra checksum. Binary WASM khoảng 14 MiB chưa nén.

Lần chuẩn bị đầu cần Internet; cache đã xác minh có thể dùng lại offline. Tài nguyên không đưa lên Git; Docker build chuẩn bị chúng trong image. Nginx gzip/cache tài nguyên có phiên bản. Không nạp model vào browser ở mỗi lượt chấm công.

Module worker cần `FilesetResolver.forVisionTasks(path, true)`. Vite có middleware chỉ phục vụ ba tài nguyên đã pin trước source transforms, vì import động WASM loader từ `public` với `?import` sẽ bị Vite từ chối. Production phục vụ static bằng Nginx.

CSP cho phép `script-src 'self' 'wasm-unsafe-eval'` và `worker-src 'self'`; không mở JavaScript `unsafe-eval`, không cho phép CDN tùy ý. Tất cả tài nguyên model đến từ cùng origin.

## Hợp đồng API

POST `/api/employees` và PUT `/api/employees/{id}/face` giữ trường `name`, `consent`, nhiều trường file `image`. Luồng guided bổ sung:

```text
capture_mode=guided
pose_labels=["front","left","right","up","down"]
```

Guided bắt buộc đủ 5 ảnh theo thứ tự. Upload vẫn nhận 1–5 ảnh. Lỗi liên quan ảnh có `image_index` (0–4) để chụp lại đúng ô. Metadata pose từ browser chỉ hỗ trợ chất lượng; backend không coi nhãn client gửi là chứng thực an ninh. Không cần migration database mới.

## Kiểm chứng và giới hạn

Unit test kiểm tra pose toán học, chất lượng và điều kiện giữ ổn định. Browser test dùng fake camera/pose để kiểm tra tự thu đủ 5 góc, retake, không gửi hồ sơ khi chưa xác nhận, không queue frame và dọn tài nguyên khi hủy/đổi màn hình. Smoke riêng dùng **MediaPipe thật** qua UI để kiểm tra worker, tải tài nguyên cùng origin và inference.

CI kiểm tra cả Vite và image production/Nginx với CSP thật. Các kiểm tra này không thay thế thử 5 góc bằng webcam vật lý, Safari/iOS, ánh sáng/kính và người thật.

**Thu đủ góc không chứng minh người thật hoặc chống replay.** Endpoint đăng ký vẫn hỗ trợ ảnh quản trị tải lên và dùng kiểm tra chất lượng/danh tính; không tuyên bố có enrollment liveness. MiniFASNet tiếp tục bảo vệ luồng chấm công theo giới hạn đã ghi trong `VERIFICATION.md`.
