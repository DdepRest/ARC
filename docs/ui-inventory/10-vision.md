# Инвентаризация пространства: VISION (КАМЕРА) (10-vision.md)

> **Пространство:** `vision`  
> **Лейбл:** `КАМЕРА`  
> **Файл реализации:** `src/renderer/features/vision/components/VisionTabView.vue`

---

## 1. Секция: Оптический видеопоток (Optical Feed Canvas)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `vision.camera.enable` | Vision → Camera → Enable Button | ВКЛЮЧИТЬ КАМЕРУ | button | Запрос доступа к веб-камере через `navigator.mediaDevices.getUserMedia` и запуск видеопотока | `VisionTabView.vue:29` | - | daily |
| `vision.camera.disable` | Vision → Camera → Disable Button | ОТКЛЮЧИТЬ | button | Остановка видеопотока камеры и освобождение видеоустройства | `VisionTabView.vue:36` | - | daily |

---

## 2. Секция: Статус когнитивного распознавания

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `vision.status.recognition_info` | Vision → Status → Diagnostic Info | Распознавание не подключено (фаза 2) | readonly-info | Честная индикация состояния детекции объектов (согласно принципу честности данных) | `VisionTabView.vue:48` | - | setup-once |
