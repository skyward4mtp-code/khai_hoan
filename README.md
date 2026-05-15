# Cake Tracker - v15 Flag Donate Mobile

Bản v15:

- Dùng đúng ảnh `public/assets/khai-hoan-title.png` làm tiêu đề hero, không render chữ đè lên ảnh.
- Nền đen, ưu tiên hiển thị đẹp trên điện thoại.
- Phần `FLAG DONATE` có 2 mốc chia đôi màn hình trên mobile:
  - Donate tăng thêm 50M → Skyward tặng Sky LED Trung Quốc.
  - Donate tăng thêm 100M → Skyward tặng Sky LED Mỹ.
- Giữ các chức năng: tracking sao kê Cake, chỉ tính giao dịch nhận tiền, Excel local, QR donate, nhạc nền YouTube.

## Chạy local

```bash
npm install
npm start
```

Mở:

```text
http://localhost:3000
```

## Cấu hình

Sửa trực tiếp trong `server.js`, mục `TRACKING_CONFIG`:

```js
encodedId: '318535339',
startAt: '2026-05-15T00:00:00+07:00',
targetAmount: 220000000,
initialFundAmount: 70000000,
giftFormUrl: 'https://forms.gle/...',
musicYoutubeUrl: 'https://www.youtube.com/watch?v=...',
```

Mốc Flag Donate:

```js
internalFundMilestones: [
  {
    amount: 50000000,
    title: 'LED Trung Quốc',
    description: 'Đạt mốc donate tăng thêm 50M → Skyward tặng Sky LED Trung Quốc.',
  },
  {
    amount: 100000000,
    title: 'LED Mỹ',
    description: 'Đạt mốc donate tăng thêm 100M → Skyward tặng Sky LED Mỹ.',
  },
]
```


## v16
- Polish lại typography phần FLAG DONATE.
- Giữ layout chia đôi trên mobile nhưng giảm cỡ chữ, chống tràn chữ và nhìn gọn hơn.
