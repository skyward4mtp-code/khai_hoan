# Cake Tracker Khải Hoàn - v12

Web tracking donate cho quỹ Skyward.

## Chạy local

```bat
npm install
npm start
```

Mở:

```text
http://localhost:3000
```

## Các thay đổi chính v12

- Chỉ tính giao dịch cộng tiền / nhận tiền.
- Giao dịch chuyển đi dạng `Chuyển tiền`, `Tới ...`, số tiền âm sẽ bị loại khỏi tổng, progress, top donor, bảng giao dịch và Excel sau lần quét lại.
- Nhạc YouTube tự phát nền khi vào web, âm lượng nhỏ.
- Có biểu tượng loa ở góc phải dưới để tắt/bật nhạc.
- Đầu trang có nút `Lấy file Excel` tải file `data/transactions.xlsx`.

## Chỗ sửa cấu hình

Mở `server.js`, tìm `TRACKING_CONFIG`.

### Sửa link sao kê Cake

```js
encodedId: '318535339',
```

### Sửa link YouTube phát nền

```js
musicYoutubeUrl: 'https://www.youtube.com/watch?v=THAY_VIDEO_ID_CUA_BAN',
```

Có thể dùng dạng:

```js
musicYoutubeUrl: 'https://youtu.be/VIDEO_ID',
```

### Sửa âm lượng nhạc

Mở `public/app.js`, tìm:

```js
const MUSIC_VOLUME = 12;
```

Giá trị từ `0` đến `100`. Để nhạc nền nhỏ nên dùng khoảng `8` đến `15`.

## Lưu ý về autoplay

Trình duyệt có thể chặn autoplay có tiếng trong một số trường hợp. Code đã tự gọi phát nền âm lượng nhỏ; nếu trình duyệt chặn, người dùng chỉ cần bấm biểu tượng loa một lần để bật nhạc.

## File Excel

File Excel nằm ở:

```text
data/transactions.xlsx
```

Nút `Lấy file Excel` sẽ tải file này về.
