# A.R.C. v1.0.12 RC — Windows Real Release QA Protocol (Sprint 4: S4-01..S4-04)

> **Статус выполнения:** **`NOT RUN`** (протокол и автоматизированные харнесы подготовлены в Linux; закрытие в статус `VERIFIED` допускается **только** после фактического прогона на целевых машинах Windows 10/11 с приложением логов, JSON-снимков и скриншотов).

---

## 0. Предпосылки и фиксация артефакта

Перед началом QA зафиксируйте проверяемый билд командой:
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-preflight.ps1 -Mode preflight -ArtifactPath dist\ARC-Setup-1.0.12-x64.exe
```

| Поле | Значение (заполнить при прогоне) |
|---|---|
| Тестируемая версия | `1.0.12` |
| Commit SHA (из `DiagnosticsSection` / CI) | `TBD` |
| `ARC-Setup-1.0.12-x64.exe` SHA-256 | `TBD` |
| `ARC-Portable-1.0.12-x64.exe` SHA-256 | `TBD` |
| Authenticode статус (`verify-win-artifacts.ps1`) | `UNSIGNED` (до подключения сертификата) |
| Low-end hardware baseline (CPU / RAM / GPU) | `TBD` |

---

## 1. S4-01 — Реальный 2–4-часовой Multi-Process Soak Test на Windows

Запуск харнеса:
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-soak-harness.ps1 `
  -ExecutablePath "$env:LOCALAPPDATA\Programs\A.R.C.\A.R.C..exe" `
  -DurationMinutes 120 -IntervalSeconds 15 -GracefulStopAtEnd
```

Для разметки сценариев записывайте имя активного этапа в `qa-artifacts/soak/run-<id>/scenario-marker.txt`:

| # | Сценарий (`scenario-marker.txt`) | Ожидаемый критерий | Статус | Фактические заметки / Evidence |
|---|---|---|---|---|
| 1 | `idle_30m` | Стабильное плато RAM, низкий CPU в idle, 0 крашей | `NOT RUN` | |
| 2 | `chat_stream_cancel` | Повторная отмена стриминга мгновенно прерывает генерацию без зависаний | `NOT RUN` | |
| 3 | `stt_mic_30m` | 30 мин активного микрофона без утечки памяти/дескрипторов и падений воркера | `NOT RUN` | |
| 4 | `tts_repeat_playback` | Повторный синтез Silero/SAPI без утечки `temp_speech_*.wav` и залипания `isBusy` | `NOT RUN` | |
| 5 | `concurrency_chat_stt_tts` | Совместная работа Chat + STT + TTS без блокировок и гонок | `NOT RUN` | |
| 6 | `eco_minimized_background` | Свёрнутый Eco mode снижает нагрузку CPU/GPU (idle CPU p95 ≤ 12%) | `NOT RUN` | |
| 7 | `workspace_modals_reopen` | Повторное открытие настроек/модалей не растит память и не ломает 3D Реактор | `NOT RUN` | |
| 8 | `provider_outage_recovery` | Карантин провайдера → фолбэк → восстановление без ложных `ready` | `NOT RUN` | |
| 9 | `network_loss_download` | Потеря сети / отмена загрузки оставляет 0 `.part`/`.staging` в финальном каталоге | `NOT RUN` | |
| 10 | `sleep_resume_lock_unlock` | Выход из сна/блокировки экрана восстанавливает планировщик, STT/TTS и UI | `NOT RUN` | |
| 11 | `shutdown_active_tasks` | Закрытие при активных STT/TTS/download оставляет **0 orphan** процессов Python/STT | `NOT RUN` | |

После окончания прогона проверить `soak-analysis.json` (`verdict: "PASS"`, `orphanCount === 0`, `fatalErrors === 0`, реальные `p50`/`p95` и post-warmup slope).

---

## 2. S4-02 — Upgrade, Data Preservation & Uninstall QA

1. Снять снимок `userData` на предыдущей версии: `windows-qa-preflight.ps1 -Mode snapshot-before`.
2. Выполнить установку Release Candidate поверх существующей версии, запустить и корректно закрыть A.R.C.
3. Снять снимок после обновления: `windows-qa-preflight.ps1 -Mode snapshot-after`.
4. Проверить деинсталляцию (NSIS Uninstall) и убедиться, что `userData` сохраняется (`deleteAppDataOnUninstall: false`).

| Проверка | Критерий | Статус | Evidence |
|---|---|---|---|
| SQLite DB (`arc.db`) + `PRAGMA user_version` | Миграция на v8 без потери чатов/задач/памяти, pre-migration backup создан | `NOT RUN` | |
| WAL/SHM при shutdown/restart | Корректный checkpoint и повторное открытие без `SQLITE_CORRUPT` | `NOT RUN` | |
| Provider configs + DPAPI Secret Vault (`secrets.json`) | Ключи расшифровываются после обновления, legacy удалён только после верификации | `NOT RUN` | |
| Макросы, задачи, память, модели, настройки | Все сущности и пользовательские преференсы сохранены | `NOT RUN` | |
| Backup & Restore (ZIP export) | Экспорт без секретов (`apiKey: ""`), восстановление из бэкапа проверено | `NOT RUN` | |
| NSIS Uninstall | Удаляет приложение и ярлыки, **не удаляет** `userData` по умолчанию | `NOT RUN` | |

---

## 3. S4-03 — Clean OS Matrix (NSIS & Portable)

| # | Конфигурация среды | NSIS | Portable | OS Build / Hardware / SHA / Логи |
|---|---|---|---|---|
| 1 | Чистая Windows 10 x64 | `NOT RUN` | `NOT RUN` | |
| 2 | Чистая Windows 11 x64 | `NOT RUN` | `NOT RUN` | |
| 3 | Обычная учётная запись (без прав администратора, `asInvoker`) | `NOT RUN` | `NOT RUN` | |
| 4 | Профиль пользователя с кириллицей и пробелами (`C:\Users\Тест Пользователь`) + SAPI TTS | `NOT RUN` | `NOT RUN` | |
| 5 | Система без установленного Python | `NOT RUN` | `NOT RUN` | |
| 6 | Система без FFmpeg | `NOT RUN` | `NOT RUN` | |
| 7 | Система без ранее скачанных моделей (проверка отсутствия неожиданных загрузок) | `NOT RUN` | `NOT RUN` | |
| 8 | Offline / медленная сеть (проверка локального режима и блокировки облачного Edge TTS) | `NOT RUN` | `NOT RUN` | |

---

## 4. S4-04 — UX & Accessibility Matrix (без редизайна)

| Разрешение / Масштаб | Первый экран / Primary Actions | Overflow / Scroll Traps / Clipping | Focus Trap & `Esc` | Keyboard / Tab / Reduced Motion | Контраст / Honest States / Provider Draft | Статус | Скриншот |
|---|---|---|---|---|---|---|---|
| `1920×1080`, `100%` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | |
| `1366×768`, `100%` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | |
| `1366×768`, `125%` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | |
| `1280×720`, `100%` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | |

*(Примечание: `390×844` не проверяется как обязательный релизный критерий, поскольку A.R.C. — десктопное приложение Windows.)*
