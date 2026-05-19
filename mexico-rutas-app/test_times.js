const cediConfig = { startTime: '06:00', endTime: '17:00', maxShiftDays: 2 };
const loadDur = 7200;

const formatTime = (timeStr, baseDateStr = "2026-04-10", offsetDays = 0) => {
  const finalBaseDate = baseDateStr;
  let hours = 8, minutes = 0;
  const timeMatch = timeStr.toString().match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);
  }
  let finalDateStr = finalBaseDate;
  if (offsetDays > 0) {
    const d = new Date(finalBaseDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offsetDays);
    finalDateStr = d.toISOString().split('T')[0];
  }
  return `${finalDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-06:00`;
};

const addSecondsToLocal = (isoStr, seconds) => {
  const d = new Date(isoStr);
  d.setSeconds(d.getSeconds() + seconds);
  const local = new Date(d.getTime() - (6 * 60 * 60 * 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}-06:00`;
};

const times = Array.from({ length: cediConfig.maxShiftDays }).map((_, d) => {
  const startStr = formatTime(cediConfig.startTime, undefined, d);
  const endStr = formatTime(cediConfig.endTime, undefined, d);
  const latestStart = addSecondsToLocal(endStr, -loadDur);
  return [startStr, latestStart];
});

console.log(JSON.stringify(times, null, 2));
