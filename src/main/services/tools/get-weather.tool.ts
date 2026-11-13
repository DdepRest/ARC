import { ToolInstance, ToolDefinition, ToolResult } from '../../../shared/types/tools';
import axios from 'axios';

export class GetWeatherTool implements ToolInstance {
  definition: ToolDefinition = {
    name: 'get_weather',
    description: 'Получает точный прогноз погоды по указанному городу. Использовать ТОЛЬКО для запросов о погоде, не использовать web_search.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Название города, например "Москва" или "Лондон"'
        }
      },
      required: ['location']
    }
  };

  async execute(params: { location: string }): Promise<ToolResult> {
    try {
      // Geocoding with candidate forms for Russian inflections (e.g. "Горловке" -> "Горловка", "Москве" -> "Москва")
      const rawLoc = (params.location || '').trim();
      const candidates = [rawLoc];
      if (rawLoc.endsWith('е')) {
        candidates.push(rawLoc.slice(0, -1) + 'а');
        candidates.push(rawLoc.slice(0, -1));
      } else if (rawLoc.endsWith('и')) {
        candidates.push(rawLoc.slice(0, -1) + 'ь');
        candidates.push(rawLoc.slice(0, -1) + 'я');
        candidates.push(rawLoc.slice(0, -1));
      } else if (rawLoc.endsWith('у')) {
        candidates.push(rawLoc.slice(0, -1) + 'а');
      }

      let city: any = null;
      for (const cand of candidates) {
        if (!cand) continue;
        try {
          const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cand)}&count=1&language=ru&format=json`);
          if (geoRes.data?.results && geoRes.data.results.length > 0) {
            city = geoRes.data.results[0];
            break;
          }
        } catch (_) {}
      }

      if (!city) {
        return {
          success: false,
          toolName: this.definition.name,
          error: `Город "${params.location}" не найден.`
        };
      }

      // Weather
      const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m&timezone=auto`);
      const weatherData = weatherRes.data;
      const current = weatherData.current;
      
      const obsTime = new Date(current.time);
      const now = new Date();
      const ageMinutes = (now.getTime() - obsTime.getTime()) / 60000;
      
      if (ageMinutes > 60) {
        return {
          success: false,
          toolName: this.definition.name,
          error: `Данные устарели (старше 60 минут). Время наблюдения: ${current.time}`
        };
      }

      // Convert wind direction degrees to human readable full names
      const directionsShort = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
      const directionsFull = [
        'северный',
        'северо-восточный',
        'восточный',
        'юго-восточный',
        'южный',
        'юго-западный',
        'западный',
        'северо-западный'
      ];
      const dirIndex = Math.round(((current.wind_direction_10m %= 360) < 0 ? current.wind_direction_10m + 360 : current.wind_direction_10m) / 45) % 8;
      const windDirShort = directionsShort[dirIndex];
      const windDirFull = directionsFull[dirIndex];

      const tempVal = current.temperature_2m;
      const feelsVal = current.apparent_temperature;
      const tempSign = tempVal > 0 ? `+${tempVal}` : `${tempVal}`;
      const feelsSign = feelsVal > 0 ? `+${feelsVal}` : `${feelsVal}`;
      const summaryText = `Погода в г. ${city.name}: температура ${tempSign}°C (ощущается как ${feelsSign}°C), ветер ${windDirFull}, ${current.wind_speed_10m} км/ч, влажность ${current.relative_humidity_2m}%.`;

      return {
        success: true,
        toolName: this.definition.name,
        data: {
          location: city.name,
          observation_time: current.time,
          temperature: current.temperature_2m,
          feels_like: current.apparent_temperature,
          wind_speed: current.wind_speed_10m,
          wind_direction: windDirFull,
          wind_direction_short: windDirShort,
          humidity: current.relative_humidity_2m,
          pressure: current.surface_pressure,
          precipitation: current.precipitation,
          summary: summaryText
        }
      };
    } catch (err: any) {
      return {
        success: false,
        toolName: this.definition.name,
        error: err.message
      };
    }
  }
}
