# A.R.C. v1.0.12 — Release Candidate Notes & Distribution Bundle (S4-06)

- **Версия:** `1.0.12` (Release Candidate — инженерный харденинг Sprint 0–3 + подготовка Sprint 4 завершены в Linux; ожидает финальный Windows QA sign-off перед публикацией)
- **Автор / Владелец:** `DdepRest`
- **Репозиторий:** `https://github.com/DdepRest/ARC`
- **Статус цифровой подписи Windows:** **`UNSIGNED`** *(до подключения сертификата подписи кода; статус проверяется честно через `Get-AuthenticodeSignature` в `scripts/verify-win-artifacts.ps1` и фиксируется в `ARTIFACT_VERIFICATION.json`)*
- **Лицензионная политика комплекта:** **Non-Commercial / Open-Source Release** *(исходный код A.R.C. распространяется под MIT, но комплектные веса Silero TTS `v5_6_ru.pt` лицензированы под **CC BY-NC-SA 4.0 — Non-Commercial Use Only**; подробности в `THIRD_PARTY_NOTICES.md` и `sbom-cyclonedx.json`)*

---

## 1. Ключевые изменения Release Hardening (Sprint 0–3)

### Безопасность и целостность данных
- **Secret Vault (`S1-01`):** fail-closed запись в DPAPI (`secrets.json` v2) со staging `.tmp`, `fsyncSync`, чтением и расшифровкой до `renameSync`; legacy-файл не удаляется до подтверждённой миграции.
- **Файловая песочница и Shell (`S1-02`, `S1-03`, `S1-04`):** `path-guard.ts` блокирует symlink/junction/reparse escapes (`lstatSync` + `realpathSync` + `O_NOFOLLOW`); `ShellService` переведён на точный allowlist + `spawn(..., { shell: false })`, таймаут 30 с и `AbortSignal`; `ApprovalService` проверяет доверенный sender и срок жизни запроса.
- **Electron Boundary (`S3-03`):** `sandbox: true`, `webSecurity: true`, `webviewTag: false`, `contextIsolation: true`, `nodeIntegration: false`, каноническая проверка `file://` корня `out/renderer`, суженный CSP + `frame-ancestors 'none'`, отключение DevTools в production без `--debug`/`ARC_ALLOW_DEVTOOLS=1`.
- **SQLite миграции и честное хранилище (`S3-01`, `S3-02`):** версионированные миграции `v1`–`v8` (`PRAGMA user_version` + `schema_migrations` с SHA-256), верифицированный pre-migration бэкап `VACUUM INTO`, перевод в read-only `DB_SAFE_MODE` при сбое/drift без тихого удаления данных; `JSONDatabase` честно маркируется и не маскируется под SQLite.
- **Fail-closed ZIP экспорт и честный сброс (`S3-07`, `S3-08`):** ошибка redaction никогда не включает сырые ключи провайдеров в архив (используется безопасный redacted placeholder + `ZIP_ARCHIVE_LIMITS` и `CRC-32`); сброс разделён на «Сброс параметров UI» и «Сброс данных приложения (Вариант A)» с явным сохранением Secret Vault, логов, бэкапов, словарей TTS и моделей по умолчанию.
- **Задачи (`S1-05`) и Мастер первого запуска (`S3-06`):** задачи не помечаются `SYNCED` до SQLite ACK и сохраняют dirty-очередь; First Run Wizard дожидается критического сохранения с single-flight блокировкой и возможностью повтора.

### Голос, модели, приватность и честные состояния
- **Словари TTS и Python runtime (`S2-01`, `S2-02`):** `Voice/dicts` вынесены в `extraResources`, read-only bundled SQLite + пользовательский overlay в `userData`; готовность Python проверяется реальным импортом модулей.
- **Контроль загрузок и Supply Chain (`S2-03`, `S2-04`, `S2-06`, `S2-07`):** реальная отмена HTTP/потоков через `AbortController` + `.staging/*.part`, строгий SHA-256 и закреплённые ревизии в `model-supply-chain.manifest.ts`, per-hop HTTPS/SSRF allowlist, отключение скрытых автозагрузок при запуске, единая state machine статусов моделей.
- **Приватность TTS и безопасный SAPI (`S2-05`, `S3-09`):** облачный Edge TTS выключен по умолчанию (`allowCloudTtsFallback = false`, явный opt-in); PowerShell/SAPI передаёт путь temp-файла строго через `env.ARC_TTS_TEXT_FILE` и `shell: false` с адаптивным таймаутом.
- **Честные статусы, устойчивость и идентичность сборки (`S3-04`, `S3-05`, `S3-10`, `S3-11`, `S3-12`, `§12.2`/`§12.6`):** единый реестр 14 capabilities в `ModulesView`, честная маркировка локального шаблона декомпозиции, реальный `BUILD_COMMIT` без `'9048f71'`, строгий TypeScript-контур `tsconfig.strict.json` (Phase A + Phase B) и проверщик границ Vue/TS/IPC, shell-free создание `venv` для путей с пробелами/кириллицей, чистая деградация без Python/FFmpeg, обработка горячего отключения аудиоустройств (`devicechange`/`track.onended`), восстановление после сна ОС и обрыва сети, фирменная иконка A.R.C. (`build/icon.ico`/`icon.png`), метаданные `DdepRest` и CycloneDX 1.5 SBOM.

---

## 2. Состав релизного комплекта (Release Candidate Bundle)

1. `ARC-Setup-1.0.12-x64.exe` — NSIS-установщик Windows x64 (`perMachine: false`, `deleteAppDataOnUninstall: false`) + `.blockmap`.
2. `ARC-Portable-1.0.12-x64.exe` — портативная сборка Windows x64.
3. `SHA256SUMS.txt` — контрольные суммы SHA-256 для NSIS и Portable.
4. `sbom-cyclonedx.json` — машиночитаемый CycloneDX 1.5 SBOM (npm + Python Silero + ML-модели + шрифты/иконки).
5. `ARTIFACT_VERIFICATION.json` — отчёт проверки PE-заголовков, `FileVersionInfo` и честного статуса Authenticode.
6. `THIRD_PARTY_NOTICES.md` — атрибуция лицензий и уведомление Silero `CC BY-NC-SA 4.0`.

---

## 3. Известные ограничения и нерешённые риски (Known Issues)

- **Windows Code Signing (`UNSIGNED`):** артефакты не имеют коммерческого EV/OV Authenticode-сертификата; Windows SmartScreen может показать предупреждение при первом запуске. Для проверки целостности сверяйте `SHA256SUMS.txt`.
- **Некоммерческое ограничение Silero TTS:** встроенный вес `v5_6_ru.pt` распространяется по `CC BY-NC-SA 4.0`. Коммерческое использование дистрибутива с этим файлом запрещено без отдельной лицензии Silero.
- **Натурное Windows QA (`NOT RUN` в Linux-контейнере):** до снятия флага RC и публикации стабильного GitHub Release необходимо пройти протокол `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` (S4-01..S4-04) на физических/виртуальных машинах Windows 10 и 11.
- **Читаемость логотипа на 3D-ядре:** известный зафиксированный долг в замороженной защищённой зоне 3D Реактора (не регрессия).

---

## 4. Поддержка и сбор диагностики

При возникновении ошибки:
1. Откройте **Настройки → Система → Диагностика и логи** и нажмите **Экспорт диагностики** (`system:export-diagnostics`).
2. Экспортируемый JSON-отчёт автоматически маскирует API-ключи, токены и пути домашнего каталога, не содержит секретов Vault и включает `app.version`, `app.commit`, `storage.dbStatus` и состояние подсистем.
3. Создайте issue в `https://github.com/DdepRest/ARC/issues`, приложив экспортированный отчёт, версию Windows (например, `winver`) и шаги воспроизведения.

---

## 5. Финальный чек-лист перед публикацией GitHub Release

- [x] `npm run gate` (`lint`, `lint:strict`, `check-boundaries`, `check-visual-constitution`, `test`, `build`, `check-sizes`) зелёный в Linux.
- [x] CycloneDX 1.5 SBOM генерируется детерминированно (`npm run generate:sbom`).
- [ ] Пройден `windows-latest` CI с `verify-win-artifacts.ps1 -SelfTest` и `verify-win-artifacts.ps1`.
- [ ] Закрыт `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` (S4-01 2–4ч soak, S4-02 upgrade/uninstall, S4-03 Clean OS, S4-04 UX matrix).
- [ ] Получено явное подтверждение владельца на запуск `.github/workflows/release.yml` (tag `v1.0.12` или `workflow_dispatch`).
