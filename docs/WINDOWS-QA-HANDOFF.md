# A.R.C. v1.0.12 RC — Пошаговый пакет передачи для Windows QA (Handoff Runbook)

> **Назначение:** самодостаточная инструкция для владельца проекта по закрытию оставшихся релизных ворот на реальной Windows 10/11 и в GitHub Actions (`S0-04`, `S0-05`, `S4-01`..`S4-06`).  
> **Связанные документы:** `docs/WINDOWS-RELEASE-QA-PROTOCOL.md`, `docs/release-status-registry.json`, `docs/release-notes-v1.0.12-rc.md`, `ARC_RELEASE_HARDENING_TZ.md`.

---

## Шаг 1. Проверка GitHub Actions CI и Branch Protection (`S0-04`, `S3-10`, `S3-12`)

1. Откройте последний прогон workflow **`CI Gate`** (`.github/workflows/ci.yml`) на ветке `main` после пуша актуального коммита.
2. Убедитесь, что обе джобы зелёные:
   - `Lint, Architecture, Test & Build Validation` (`ubuntu-latest`);
   - `Package Windows x64 (NSIS & Portable)` (`windows-latest`), включая `verify-win-artifacts.ps1 -SelfTest`, `windows-soak-harness.ps1 -SelfTest`, `verify-win-artifacts.ps1` и `npm run generate:sbom`.
3. Убедитесь, что обычный push в `main` **не создал** GitHub Release.
4. Скачайте единый workflow-артефакт `arc-windows-x64-<sha>` и распакуйте его в локальную папку, например `C:\ARC-QA\dist\`:
   - `ARC-Setup-1.0.12-x64.exe` + `.blockmap`;
   - `ARC-Portable-1.0.12-x64.exe`;
   - `SHA256SUMS.txt`;
   - `ARTIFACT_VERIFICATION.json`;
   - `sbom-cyclonedx.json`.
5. В настройках репозитория GitHub (**Settings → Branches → Branch protection rules → `main`**) включите обязательные status checks: `Lint, Architecture, Test & Build Validation` и `Package Windows x64 (NSIS & Portable)`.

**Критерий шага 1:** ссылка на зелёный GitHub Actions run + распакованные 6 файлов артефактов + `signing_status: "UNSIGNED"` (ожидаемо до подключения сертификата) в `ARTIFACT_VERIFICATION.json`.

---

## Шаг 2. Preflight-фиксация машины и сверка SHA-256 (`S0-05`, `S4-03`)

В PowerShell из корня репозитория (или с путями к скриптам) выполните:

```powershell
# 1. Проверка SHA-256 скачанных EXE против SHA256SUMS.txt
Get-Content C:\ARC-QA\dist\SHA256SUMS.txt
Get-FileHash C:\ARC-QA\dist\ARC-Setup-1.0.12-x64.exe -Algorithm SHA256
Get-FileHash C:\ARC-QA\dist\ARC-Portable-1.0.12-x64.exe -Algorithm SHA256

# 2. Сбор паспорта тестовой Windows-машины (OS build, CPU/RAM/GPU, non-admin, Python/FFmpeg, профиль)
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-preflight.ps1 `
  -Mode preflight `
  -ArtifactPath C:\ARC-QA\dist\ARC-Setup-1.0.12-x64.exe `
  -OutputDir C:\ARC-QA\evidence\preflight
```

**Критерий шага 2:** SHA-256 обоих EXE совпадают с `SHA256SUMS.txt`; создан файл `qa-preflight-*.json`.

---

## Шаг 3. Чистая установка и проверка матрицы окружений (`S0-05`, `S4-03`, `§12.2`)

Проверьте **отдельно** `ARC-Setup-1.0.12-x64.exe` (NSIS) и `ARC-Portable-1.0.12-x64.exe` (Portable) на чистой Windows 10 и Windows 11 x64 (обычная учётная запись без прав администратора, `asInvoker`):

1. **Установка NSIS:** убедитесь, что установщик не требует UAC elevation по умолчанию, создаёт фирменные иконки/ярлыки A.R.C. и запускается без crash loop.
2. **Запуск Portable:** запустите из отдельной папки с пробелами и кириллицей (например, `C:\Users\Тест Пользователь\ARC Тест\`), убедитесь в загрузке `better-sqlite3` без неожиданного `DB_SAFE_MODE`.
3. **Первый запуск без моделей, Python и FFmpeg:**
   - убедитесь, что окно становится интерактивным сразу без скрытой фоновой загрузки моделей или создания `venv`/`pip install`;
   - в Мастере первого запуска проверьте точные размеры компонентов, отмену загрузки без частичных файлов в финальном каталоге и возможность нажать «Позже» / «Продолжить без голоса»;
   - в **Настройки → Система → Диагностика и логи** сверьте `app.version` (`1.0.12`) и `app.commit` с коротким SHA вашего GitHub Actions run, нажмите **Экспорт диагностики** и сохраните JSON в `C:\ARC-QA\evidence\diagnostics\`.
4. **Приватность TTS и SAPI:**
   - убедитесь, что `Разрешить облачный резерв (Edge TTS)` выключен по умолчанию;
   - в локальном / офлайн-режиме проверьте озвучку через Windows SAPI на профиле с кириллицей и пробелами.
5. **Безопасность и целостность данных (`S1-01`..`S1-05`):**
   - сохраните тестовый API-ключ → перезапустите A.R.C. → убедитесь, что ключ расшифровывается через DPAPI и `secrets.json` не содержит plaintext;
   - создайте/отредактируйте задачу → перезапустите A.R.C. → убедитесь, что изменения сохранены в SQLite;
   - проверьте в **Настройки → Модули**, что `Agent Swarm`, `MCP`, `Architecture`, `Sandbox` отображаются строго как «Запланировано в v1.1».

---

## Шаг 4. Upgrade, сохранность данных и деинсталляция (`S4-02`)

На машине с уже настроенной предыдущей версией A.R.C. (с задачами, чатами, ключами DPAPI и макросами):

```powershell
# 1. Снимок userData ДО обновления
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-preflight.ps1 `
  -Mode snapshot-before `
  -OutputDir C:\ARC-QA\evidence\upgrade
```

2. Установите `ARC-Setup-1.0.12-x64.exe` поверх текущей версии, запустите A.R.C., проверьте наличие всех задач, диалогов, ключей провайдеров и миграцию БД (`v8`), затем штатно закройте приложение.

```powershell
# 2. Снимок userData ПОСЛЕ обновления
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-preflight.ps1 `
  -Mode snapshot-after `
  -OutputDir C:\ARC-QA\evidence\upgrade

# 3. Автоматическая сверка сохранности критичных активов (выдаст verdict: PASS или FAIL)
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-preflight.ps1 `
  -Mode compare-snapshots `
  -Scenario upgrade `
  -BeforeSnapshotPath C:\ARC-QA\evidence\upgrade\qa-snapshot-before-<ts>.json `
  -AfterSnapshotPath C:\ARC-QA\evidence\upgrade\qa-snapshot-after-<ts>.json `
  -OutputDir C:\ARC-QA\evidence\upgrade
```

3. Выполните стандартную деинсталляцию A.R.C. через «Приложения и возможности» и повторите `snapshot-after` + `compare-snapshots -Scenario uninstall`:
   - убедитесь, что приложение и ярлыки удалены, а `%APPDATA%\a.r.c.` (`arc.db`, `secrets.json`, `tts-policy.json`, `config/ai-providers.json`, `macros`, `models`) **полностью сохранены** (`verdict: "PASS"`).

---

## Шаг 5. Реальный Multi-Process Soak (2–4 часа) и UX-матрица (`S4-01`, `S4-04`)

### 5.1. Запуск 2-часового soak-прогона

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-soak-harness.ps1 `
  -ExecutablePath "$env:LOCALAPPDATA\Programs\A.R.C.\A.R.C..exe" `
  -DurationMinutes 120 `
  -IntervalSeconds 15 `
  -OutputDir C:\ARC-QA\evidence\soak `
  -GracefulStopAtEnd
```

Во время прогона переключайте маркер текущего сценария командой:

```powershell
Set-Content -Path C:\ARC-QA\evidence\soak\run-<id>\scenario-marker.txt -Value "idle_30m"
```

Последовательно пройдите все 11 сценариев из `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` (§1):  
`idle_30m`, `chat_stream_cancel`, `stt_mic_30m`, `tts_repeat_playback`, `concurrency_chat_stt_tts`, `eco_minimized_background`, `workspace_modals_reopen`, `provider_outage_recovery`, `network_loss_download`, `sleep_resume_lock_unlock`, `shutdown_active_tasks`.

**Критерий шага 5.1:** итоговый `soak-analysis.json` имеет `verdict: "PASS"`, `orphanCount === 0`, `fatalErrors === 0`, стабильное плато RAM после warmup и зафиксированные `p50`/`p95`.

### 5.2. UX-матрица (`S4-04`)
Снимите скриншоты главных экранов (Core, Settings → Интеллект Master–Detail, Модули, ApprovalDialog) и сохраните в `C:\ARC-QA\evidence\screenshots\` для 4 режимов:
- `1920×1080 @ 100%`;
- `1366×768 @ 100%`;
- `1366×768 @ 125%`;
- `1280×720 @ 100%`.

Проверьте отсутствие клиппинга основных кнопок, работу `Tab`/`Shift+Tab`/`Esc` и возврата фокуса в `ApprovalDialog`, а также переключение черновика провайдера с предупреждением о несохранённых изменениях.

---

## Шаг 6. Сбор доказательств и финальный Release Sign-Off (`S4-06`)

Соберите папку `C:\ARC-QA\evidence\` со следующим содержимым:

| # | Артефакт доказательства | Закрываемые задачи |
|---|---|---|
| 1 | Ссылка на зелёный GitHub Actions `CI Gate` run + `SHA256SUMS.txt` + `ARTIFACT_VERIFICATION.json` | `S0-04`, `S3-10`, `S3-12` |
| 2 | `preflight/qa-preflight-*.json` (Win10 и Win11) + `diagnostics/arc-diagnostics-*.json` | `S0-05`, `S4-03`, `S3-01`..`S3-09` |
| 3 | `upgrade/qa-diff-upgrade-*.json` и `upgrade/qa-diff-uninstall-*.json` (`verdict: "PASS"`) | `S4-02`, `S1-01`, `S1-05` |
| 4 | `soak/run-<id>/soak-analysis.json` (`verdict: "PASS"`, `orphanCount: 0`) | `S4-01`, `§11`, `§12.6` |
| 5 | `screenshots/` для 4 разрешений + заполненная таблица в `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` | `S4-04`, `§9` |
| 6 | Подтверждение включения GitHub Branch Protection на `main` | `Audit §11` |

Перед передачей доказательств запустите автоматический fail-closed валидатор папки `C:\ARC-QA\evidence\`:

```powershell
# Через PowerShell-обёртку (проверяет все 7 ворот: CI/SHA-256, Clean OS Win10/11, диагностика, upgrade/uninstall diff, 2h soak, 4 скриншота)
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-preflight.ps1 `
  -Mode verify-bundle `
  -EvidenceDir C:\ARC-QA\evidence `
  -ExpectedCommit <short-or-full-sha>
```

Либо напрямую через Node.js:

```powershell
npm run verify:qa-bundle -- --evidence-dir C:\ARC-QA\evidence --expected-commit <short-or-full-sha> --output C:\ARC-QA\evidence\qa-bundle-verdict.json
```

*(Если получена подпись Authenticode, добавьте `-RequireSigned` / `--require-signed`.)*

**Критерий валидатора:** `verdict: "RELEASE_READY"` (exit code `0`) и все 7 проверок (`ciArtifacts`, `cleanOsPreflight`, `diagnosticsProvenance`, `upgradePreservation`, `uninstallPreservation`, `multiProcessSoak`, `uxScreenshots`) в статусе `PASS`. При `BLOCKED` (exit code `1`) валидатор перечислит недостающие артефакты или проваленные пороги.

После получения `verdict: "RELEASE_READY"` и передачи `C:\ARC-QA\evidence\` (включая `qa-bundle-verdict.json`):
1. В `docs/release-status-registry.json`, `ARC_RELEASE_HARDENING_TZ.md` и `ARC_RELEASE_READINESS_AUDIT.md` задачи переводятся в `VERIFIED`, а чекбоксы `[ ]` закрываются в `[x]` с точными ссылками и хэшами.
2. Запускается публикация релиза **вручную** через GitHub Actions → **`Release Publish`** (`.github/workflows/release.yml`, `workflow_dispatch` с `draft: true` или пуш тега `v1.0.12`).
