import { BrowserWindow, shell } from 'electron';
import { skillsStore } from '../../ipc/skills.ipc';
import { SystemMediaController } from '../media/system-media';
import { vkWebSocketServer } from '../media/vk-websocket-server';
import { normalizeRussianNumbers, normalizeMediaPhonetics } from '../../../shared/utils/ru-number-parser';
import { stripTrailingUrlPunctuation } from '../../../shared/utils/url-normalizer';

export class MediaClassifier {
  public static lastMediaInteractionAt = 0;

  private static markMediaActive() {
    this.lastMediaInteractionAt = Date.now();
  }

  private static updateLastStatusVolume(volume: number) {
    const prev = vkWebSocketServer.lastStatus;
    vkWebSocketServer.lastStatus = {
      ...(prev || {}),
      title: prev?.title ?? '',
      playing: prev?.playing ?? true,
      closed: prev?.closed ?? false,
      volume
    };
    return vkWebSocketServer.lastStatus;
  }

  static classify(lower: string, settings?: any): string | null {
    const mediaSkill = skillsStore.get('media');
    
    if (mediaSkill && mediaSkill.enabled) {
      const withDigits = normalizeRussianNumbers(lower);
      let cleanLower = withDigits
        .replace(/--\s*app/g, '')
        .replace(/[^а-яёa-z0-9%\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Speech recognition noise & phonetics normalization for music/VK
      cleanLower = normalizeMediaPhonetics(cleanLower);

      const isNonMediaTarget = /(?:фокус|спринт|отдых|перерыв|таймер|оптическ|виден|камер|вебк|настройк|задач|цел|чат|файл|памят|консол|транскрип|команд|макрос|скрипт|сценари|канбан|истори|эйзенхауэр|калькулятор|блокнот|пейнт|браузер|проводник|paint|notepad|calculator|explorer|chrome|сайт|ютуб|youtube|гитхаб|github|гугл|google|яндекс|yandex|телеграм|telegram|экран|монитор|скриншот|снимок)/i.test(cleanLower);
      const isSystemMutePhrase = /(?:выключи|включи|убери|без)\s+(?:звук|громкость)/i.test(cleanLower) && !/музык|вк|vk|трек|плеер/i.test(cleanLower);
      if (isSystemMutePhrase) {
        return null;
      }

      const isRecentMediaContext = (Date.now() - this.lastMediaInteractionAt) < 10 * 60 * 1000;
      const hasVkClients = typeof vkWebSocketServer.hasClients === 'function' ? vkWebSocketServer.hasClients() : false;
      const mentionsMusic = /музык|трек|песн|плеер|вк|vk|вконтакте|аудио/i.test(cleanLower) || cleanLower.endsWith(' в') || cleanLower.endsWith(' вк');
      const isSystemVolumeExplicit = /системн[а-я]+\s+(?:громкост|звук)|(?:громкост|звук)\s+(?:систем|компьютер|виндовс|windows)/i.test(cleanLower);

      const isShuffle = /вперемеш|перемеш|рандом|случайн/i.test(cleanLower);
      const isRepeat = /повтор|зацикл/i.test(cleanLower) && !/ответ|сказал|раз/i.test(cleanLower);
      const isSave = /сохрани|добавь.*в музык|лайк|нравит/i.test(cleanLower);
      const isRemove = /удали.*трек|убери.*трек|дизлайк|удали.*из\s+музык/i.test(cleanLower);
      
      const isTrackInfo = /что (?:сейчас )?(?:играет|за трек|за песня)|кто поет|название трека/i.test(cleanLower);
      const isRewindFwd = /(?:перемотай|прокрути|мотай|чуть|шагни) (?:вперед|дальше)|вперед на/i.test(cleanLower) && !/назад/i.test(cleanLower);
      const isRewindBack = /(?:перемотай|прокрути|мотай|чуть|шагни) (?:назад|верни)|назад на/i.test(cleanLower);
      
      const explicitVolumeMatch = cleanLower.match(/(?:установи|поставь|поставить|сделай|сделать|выстави|давай|верни)?\s*(?:громкость|звук)\s*(?:музыки|вк|вконтакте|плеера)?\s*(?:на\s*)?(\d{1,3})\s*(?:%|процент[а-я]*)?/i);
      const shortPercentVolumeMatch = !isNonMediaTarget
        ? cleanLower.match(/^(?:установи|поставь|поставить|сделай|сделать|выстави|давай|верни|а\s+теперь)?\s*(?:музыку\s+|вк\s+|громкость\s+|звук\s+)?(?:на\s*)?(\d{1,3})\s*(?:%|процент[а-я]+)$/i)
        : null;
      const contextualBareNumberMatch = (!isNonMediaTarget && (hasVkClients || isRecentMediaContext || mentionsMusic))
        ? cleanLower.match(/^(?:установи|поставь|поставить|сделай|сделать|выстави|давай|верни|а\s+теперь)\s+(?:музыку\s+|вк\s+)?(?:на\s+)?(\d{1,3})$/i)
        : null;

      const volumeMatch = !isSystemVolumeExplicit
        ? (explicitVolumeMatch || shortPercentVolumeMatch || contextualBareNumberMatch)
        : null;
      
      const isNext = !isNonMediaTarget && /(?:следующ|вперед|переключ|друго|дальш|скип|пропусти|не то|давай дальше)/i.test(cleanLower) && !/назад|предыдущ|перемотай|мотай/i.test(cleanLower);
      const isPrev = !isNonMediaTarget && /(?:предыдущ|назад|верни|прошл|сначала|прежний)/i.test(cleanLower) && !/вперед|следующ|перемотай|мотай|чуть/i.test(cleanLower);
      const isQuieter = !isSystemVolumeExplicit && /(?:тише|убавь|потише|снизь|уменьши)(?:\s|$)/i.test(cleanLower) && !/свет|яркост/i.test(cleanLower);
      const isLouder = !isSystemVolumeExplicit && /(?:громче|прибавь|погромче|увеличь|подними)(?:\s|$)/i.test(cleanLower) && !/свет|яркост/i.test(cleanLower);
      const isPlay = !isNonMediaTarget && /вклю|запус|плей|воспроизведи|играй|врубай|продолжи|заиграй/i.test(cleanLower);
      const isPause = !isNonMediaTarget && (
        /пауз|останов|выклю|хватит|тихо|выруб/i.test(cleanLower) ||
        (mentionsMusic && /стоп/i.test(cleanLower))
      );

      const isVkMusic = !isQuieter && !isLouder && !volumeMatch && !isPause && (
        /вклю(чи|чить)? ?(музык[а-я])? ?(вк|вконтакте|лка|кулака|вка|ока|ака|в к|в)|за ?пус(ти|тить)? ?(музык[а-я])? ?(вк|вконтакте|лка|кулака|вка|ока|ака|в к|в)|откр(ой|ойте)? ?(музык[а-я] )?(вк|вконтакте|лка|кулака)|музык[а-я] ?(вк|вконтакте|лка|кулака|ока|ака|в к)/i.test(cleanLower)
      );

      const wins = BrowserWindow.getAllWindows();
      let targetVkUrl = stripTrailingUrlPunctuation(settings?.vkAudioUrl || 'https://vk.ru/audios553297430');

      const shouldAutoPlay = isPlay || cleanLower.includes('вклю') || cleanLower.includes('запус');
      if (shouldAutoPlay) {
        targetVkUrl += targetVkUrl.includes('?') ? '&arc-autoplay=1' : '?arc-autoplay=1';
      }

      const mentionsVk = /(?:^|\s)(?:вк|vk|вконтакте|вка|ока)(?:\s|$)/iu.test(cleanLower) || cleanLower.includes("музыку вк");
      if (!isPause && (isVkMusic || ((isPlay || mentionsMusic) && mentionsVk && !isQuieter && !isLouder && !volumeMatch))) {
        this.markMediaActive();
        if (hasVkClients) {
           const res = vkWebSocketServer.sendCommand('play');
           if (res.success) {
             return 'Обнаружил активную сессию. Возобновляю музыку ВКонтакте.';
           }
        }

        Promise.resolve(shell.openExternal(targetVkUrl)).catch((err) => {
          console.error('[MediaClassifier] Failed to open VK player externally:', err);
        });
        return 'Открываю медиаплеер ВКонтакте в вашем браузере по умолчанию. Теперь я могу управлять музыкой на уровне системы.';
      }

      if (isShuffle) {
        this.markMediaActive();
        const res = vkWebSocketServer.sendCommand('shuffle');
        if (res.success) {
          return 'Переключаю случайное воспроизведение ВКонтакте.';
        }
        return 'Не удалось изменить режим перемешивания: плеер ВКонтакте не подключен.';
      }
      if (isRepeat) {
        this.markMediaActive();
        const res = vkWebSocketServer.sendCommand('repeat');
        if (res.success) {
          return 'Переключаю повтор трека ВКонтакте.';
        }
        return 'Не удалось изменить режим повтора: плеер ВКонтакте не подключен.';
      }
      if (isSave) {
        this.markMediaActive();
        const res = vkWebSocketServer.sendCommand('save');
        if (res.success) {
          return 'Трек добавлен в вашу музыку ВКонтакте.';
        }
        return 'Не удалось добавить трек: плеер ВКонтакте не подключен.';
      }
      if (isRemove) {
        this.markMediaActive();
        const res = vkWebSocketServer.sendCommand('remove');
        if (res.success) {
          return 'Трек удален из вашей музыки ВКонтакте.';
        }
        return 'Не удалось удалить трек: плеер ВКонтакте не подключен.';
      }

      if (isTrackInfo) {
        this.markMediaActive();
        if (vkWebSocketServer.lastStatus && vkWebSocketServer.lastStatus.track) {
          const s = vkWebSocketServer.lastStatus;
          return `Сейчас играет ${s.artist}, трек называется ${s.track}.`;
        }
        return "Я не вижу активного плеера ВКонтакте.";
      }

      if (isRewindFwd) {
        this.markMediaActive();
        const res = vkWebSocketServer.sendCommand('rewind_fwd');
        if (res.success) {
          return 'Перематываю вперед на 10 секунд.';
        }
        return 'Не удалось перемотать: плеер ВКонтакте не подключен.';
      }

      if (isRewindBack) {
        this.markMediaActive();
        const res = vkWebSocketServer.sendCommand('rewind_back');
        if (res.success) {
          return 'Возвращаю на 10 секунд назад.';
        }
        return 'Не удалось перемотать: плеер ВКонтакте не подключен.';
      }
      
      if (volumeMatch) {
        const percent = parseInt(volumeMatch[1], 10);
        if (!isNaN(percent)) {
          const clamped = Math.max(0, Math.min(100, percent));
          const val = clamped / 100;
          const res = vkWebSocketServer.sendCommand('volume', { value: val });
          if (res.success) {
            this.markMediaActive();
            const updated = this.updateLastStatusVolume(val);
            wins.forEach((win: any) => {
              win.webContents.send('media:volume', { volume: val });
              win.webContents.send('media:vk-status', updated);
            });
            return `Громкость музыки ВКонтакте установлена на ${clamped}%.`;
          }
          if (mentionsMusic) {
            return 'Не удалось установить громкость: плеер ВКонтакте не подключен.';
          }
          return null;
        }
      }

      if (isNext) {
        this.markMediaActive();
        const sentResult = vkWebSocketServer.sendCommand('next');
        if (sentResult.success) {
          return 'Переключаю на следующий трек ВКонтакте.';
        }
        SystemMediaController.sendKey('next');
        return 'Отправлен системный сигнал переключения на следующий трек.';
      }
      if (isPrev) {
        this.markMediaActive();
        const sentResult = vkWebSocketServer.sendCommand('prev');
        if (sentResult.success) {
          return 'Переключаю на предыдущий трек ВКонтакте.';
        }
        SystemMediaController.sendKey('prev');
        return 'Отправлен системный сигнал переключения на предыдущий трек.';
      }
      if (isQuieter) {
        const currentVol = typeof vkWebSocketServer.lastStatus?.volume === 'number' ? vkWebSocketServer.lastStatus.volume : 0.5;
        const newVol = Math.max(0, Math.round((currentVol - 0.15) * 100) / 100);
        const res = vkWebSocketServer.sendCommand('volume', { value: newVol });
        if (res.success) {
          this.markMediaActive();
          const updated = this.updateLastStatusVolume(newVol);
          wins.forEach((win: any) => {
            win.webContents.send('media:quieter', { volume: newVol });
            win.webContents.send('media:vk-status', updated);
          });
          return `Громкость музыки ВКонтакте снижена до ${Math.round(newVol * 100)}%.`;
        }
        if (mentionsMusic) {
          return 'Не удалось изменить громкость: плеер ВКонтакте не подключен.';
        }
        return null;
      }
      if (isLouder) {
        const currentVol = typeof vkWebSocketServer.lastStatus?.volume === 'number' ? vkWebSocketServer.lastStatus.volume : 0.5;
        const newVol = Math.min(1.0, Math.round((currentVol + 0.15) * 100) / 100);
        const res = vkWebSocketServer.sendCommand('volume', { value: newVol });
        if (res.success) {
          this.markMediaActive();
          const updated = this.updateLastStatusVolume(newVol);
          wins.forEach((win: any) => {
            win.webContents.send('media:louder', { volume: newVol });
            win.webContents.send('media:vk-status', updated);
          });
          return `Громкость музыки ВКонтакте увеличена до ${Math.round(newVol * 100)}%.`;
        }
        if (mentionsMusic) {
          return 'Не удалось изменить громкость: плеер ВКонтакте не подключен.';
        }
        return null;
      }
      if (isPlay && (mentionsMusic || /^(?:плей|воспроизведи|играй|продолжи|заиграй)$/i.test(cleanLower))) {
        this.markMediaActive();
        const sentResult = vkWebSocketServer.sendCommand('play');
        if (sentResult.success) {
          return 'Запускаю музыку ВКонтакте.';
        }
        SystemMediaController.sendKey('playpause');
        return 'Отправлен системный сигнал воспроизведения.';
      }
      if (isPause && (mentionsMusic || /(?:пауз[а-я]|останов[а-я]|хватит|тихо|поставь на пауз|выключи|выруби)/i.test(cleanLower))) {
        this.markMediaActive();
        let vkPaused = false;
        if (hasVkClients) {
          const sentResult = vkWebSocketServer.sendCommand('pause');
          if (sentResult.success) vkPaused = true;
        }
        SystemMediaController.sendKey('playpause');
        if (vkPaused) {
          return 'Воспроизведение ВКонтакте приостановлено.';
        }
        return 'Воспроизведение приостановлено.';
      }
    } else if (mediaSkill && !mediaSkill.enabled) {
      const cleanLower = normalizeMediaPhonetics(
        normalizeRussianNumbers(lower).replace(/--\s*app/g, '').replace(/[^а-яёa-z0-9%\s]/gi, ' ').replace(/\s+/g, ' ').trim()
      );
      if (cleanLower.includes('включи управление музыкой') || /вклю(чи|чить)? ?(музык[а-я])?|за ?пус(ти|тить)? ?(музык[а-я])?|^плей$|^воспроизведи$/i.test(cleanLower)) {
        mediaSkill.enabled = true;
        return 'Управление медиа активировано. Теперь вы можете управлять музыкой.';
      }
      const isMediaCommand = /вклю(чи|чить)? ?(музык[а-я])?|за ?пус(ти|тить)? ?(музык[а-я])?|^плей$|^воспроизведи$|пауза|стоп ?(музык[а-я])?|останов(и|ить)? ?(музык[а-я])?|выклю(чи|чить)? ?(музык[а-я])?/i.test(cleanLower);
      if (isMediaCommand) {
        return 'модуль «Управление медиа» в данный момент отключен в настройках навыков. Скажите «Включи управление музыкой», чтобы активировать его, или перейдите в настройки.';
      }
    }

    return null;
  }
}
