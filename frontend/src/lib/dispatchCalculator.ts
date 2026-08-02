/**
 * Pure helper for calculating next dispatch date and dynamic merchant dispatch messages
 * using Montevideo timezone (America/Montevideo).
 */

export interface DispatchCalculatorInput {
  currentDate?: Date | string;
  timezone?: string; // Default: 'America/Montevideo'
  enabledWeekdays?: (string | number)[]; // e.g. ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] or [1,2,3,4,5]
  cutoffTime?: string; // 'HH:mm', e.g., '15:00' or '12:30'
  preparationDays?: number; // extra business days needed before dispatching
  holidays?: string[]; // ISO date strings 'YYYY-MM-DD'
  courierName?: string; // e.g., 'DAC', 'UES', 'SoyDelivery'
  vendorName?: string; // e.g., 'JorgiToys'
}

export interface DispatchCalculatorResult {
  can_dispatch_today: boolean;
  next_dispatch_date: Date;
  next_dispatch_day_name: string; // 'lunes', 'martes', etc.
  next_dispatch_label: string; // e.g. 'hoy', 'el lunes 3 de agosto'
  formatted_message: string; // Commercial text matching user specification
  cutoff_passed: boolean;
  cutoff_time_formatted: string;
  reason: 'within_cutoff' | 'cutoff_passed' | 'weekend_or_non_dispatch_day' | 'holiday' | 'preparation_days';
}

const WEEKDAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Normalizes input date to Montevideo time parts (year, month, day, hour, minute, weekday).
 */
export function getMontevideoTimeParts(dateInput?: Date | string, timezone: string = 'America/Montevideo') {
  const date = dateInput ? (typeof dateInput === 'string' ? new Date(dateInput) : dateInput) : new Date();

  // Use Intl.DateTimeFormat to convert to specified timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = parseInt(part.value, 10);
    }
  }

  // Note: hour12=false can return 24 for midnight in some Node/Intl versions
  const hour = map.hour === 24 ? 0 : map.hour;
  const monthIdx = map.month - 1; // 0-11
  const year = map.year;
  const day = map.day;

  // Compute weekday index (0=Sunday, 1=Monday... 6=Saturday) in Montevideo
  const localDateObj = new Date(Date.UTC(year, monthIdx, day, hour, map.minute));
  const weekdayIdx = localDateObj.getUTCDay();

  return {
    year,
    monthIdx,
    day,
    hour,
    minute: map.minute,
    weekdayIdx,
    isoDateStr: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}

/**
 * Normalizes enabledWeekdays to array of numbers 0-6 (0=Sunday, 1=Monday... 6=Saturday)
 */
function normalizeWeekdays(enabled?: (string | number)[]): number[] {
  if (!enabled || enabled.length === 0) {
    // Default: Mon-Fri (1,2,3,4,5)
    return [1, 2, 3, 4, 5];
  }

  return enabled.map(item => {
    if (typeof item === 'number') {
      return item === 7 ? 0 : item; // 1-7 ISO to 0-6 JS
    }
    const lower = String(item).toLowerCase().trim();
    if (lower.startsWith('lu')) return 1;
    if (lower.startsWith('ma')) return 2;
    if (lower.startsWith('mi')) return 3;
    if (lower.startsWith('ju')) return 4;
    if (lower.startsWith('vi')) return 5;
    if (lower.startsWith('sá') || lower.startsWith('sa')) return 6;
    if (lower.startsWith('do')) return 0;
    return -1;
  }).filter(n => n >= 0 && n <= 6);
}

export function getNextDispatchDate(input: DispatchCalculatorInput = {}): DispatchCalculatorResult {
  const {
    currentDate,
    timezone = 'America/Montevideo',
    enabledWeekdays: rawWeekdays,
    cutoffTime = '15:00',
    preparationDays = 0,
    holidays = [],
    courierName = 'DAC',
    vendorName = 'El vendedor'
  } = input;

  const validWeekdays = normalizeWeekdays(rawWeekdays);
  const nowParts = getMontevideoTimeParts(currentDate, timezone);

  // Parse cutoffTime "HH:mm"
  const [cutoffHourStr, cutoffMinuteStr] = (cutoffTime || '15:00').split(':');
  const cutoffHour = parseInt(cutoffHourStr || '15', 10);
  const cutoffMinute = parseInt(cutoffMinuteStr || '0', 10);
  const cutoffFormatted = `${String(cutoffHour).padStart(2, '0')}:${String(cutoffMinute).padStart(2, '0')}`;

  const isTodayDispatchDay = validWeekdays.includes(nowParts.weekdayIdx);
  const isTodayHoliday = holidays.includes(nowParts.isoDateStr);

  const passedCutoffToday = nowParts.hour > cutoffHour || (nowParts.hour === cutoffHour && nowParts.minute >= cutoffMinute);

  let canDispatchToday = isTodayDispatchDay && !isTodayHoliday && !passedCutoffToday && preparationDays === 0;

  // Iterate days starting today or tomorrow to find next dispatch day
  let targetYear = nowParts.year;
  let targetMonthIdx = nowParts.monthIdx;
  let targetDay = nowParts.day;
  let daysAdded = 0;

  // If cannot dispatch today, move to tomorrow first
  if (!canDispatchToday) {
    daysAdded = 1;
  }

  let remainingPrepDays = preparationDays;
  let iterations = 0;

  while (iterations < 30) {
    const testDate = new Date(Date.UTC(targetYear, targetMonthIdx, targetDay + daysAdded));
    const testYear = testDate.getUTCFullYear();
    const testMonthIdx = testDate.getUTCMonth();
    const testDay = testDate.getUTCDate();
    const testWeekdayIdx = testDate.getUTCDay();
    const testIsoStr = `${testYear}-${String(testMonthIdx + 1).padStart(2, '0')}-${String(testDay).padStart(2, '0')}`;

    const isDispatchDay = validWeekdays.includes(testWeekdayIdx);
    const isHoliday = holidays.includes(testIsoStr);

    if (isDispatchDay && !isHoliday) {
      if (remainingPrepDays > 0) {
        remainingPrepDays--;
      } else {
        // Found the dispatch date!
        targetYear = testYear;
        targetMonthIdx = testMonthIdx;
        targetDay = testDay;
        break;
      }
    }

    daysAdded++;
    iterations++;
  }

  const finalDispatchDate = new Date(Date.UTC(targetYear, targetMonthIdx, targetDay, 12, 0, 0));
  const finalWeekdayIdx = finalDispatchDate.getUTCDay();
  const finalDayName = WEEKDAY_NAMES_ES[finalWeekdayIdx];

  const nextDispatchLabel = canDispatchToday
    ? 'hoy'
    : (daysAdded === 1 && nowParts.weekdayIdx !== 5 && nowParts.weekdayIdx !== 6
        ? 'el próximo día hábil'
        : `el ${finalDayName}`);

  // Determine commercial reason & message
  let reason: DispatchCalculatorResult['reason'] = 'within_cutoff';
  let formattedMessage = '';

  if (canDispatchToday) {
    reason = 'within_cutoff';
    formattedMessage = `Comprando antes de las ${cutoffFormatted}, ${vendorName} despacha hoy por ${courierName}.`;
  } else if (preparationDays > 0) {
    reason = 'preparation_days';
    formattedMessage = `Este producto requiere ${preparationDays} día${preparationDays > 1 ? 's' : ''} hábil${preparationDays > 1 ? 'es' : ''} de preparación antes del despacho.`;
  } else if (isTodayHoliday) {
    reason = 'holiday';
    formattedMessage = `Por feriado/excepción, este pedido se despacha el ${finalDayName} por ${courierName}.`;
  } else if (nowParts.weekdayIdx === 5 && passedCutoffToday) {
    // Friday after cutoff
    reason = 'cutoff_passed';
    formattedMessage = `Las compras realizadas después de las ${cutoffFormatted} del viernes se despachan el ${finalDayName} por ${courierName}.`;
  } else if (nowParts.weekdayIdx === 6 || nowParts.weekdayIdx === 0) {
    // Weekend
    reason = 'weekend_or_non_dispatch_day';
    formattedMessage = `${vendorName} despacha este pedido el ${finalDayName} por ${courierName}.`;
  } else if (passedCutoffToday) {
    // Mon-Thu after cutoff
    reason = 'cutoff_passed';
    formattedMessage = `Este pedido se despacha el próximo día hábil por ${courierName}.`;
  } else {
    reason = 'weekend_or_non_dispatch_day';
    formattedMessage = `Este pedido se despacha el ${finalDayName} por ${courierName}.`;
  }

  return {
    can_dispatch_today: canDispatchToday,
    next_dispatch_date: finalDispatchDate,
    next_dispatch_day_name: finalDayName,
    next_dispatch_label: nextDispatchLabel,
    formatted_message: formattedMessage,
    cutoff_passed: passedCutoffToday,
    cutoff_time_formatted: cutoffFormatted,
    reason
  };
}
