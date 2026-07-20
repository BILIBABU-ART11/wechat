const config = require('../config');
const reminderJobService = require('./reminderJobService');

let timer = null;
const ranKeys = new Set();

function shouldRun(now) {
  const timeText = reminderJobService.currentTimeText(now);
  if (!config.reminderSchedule.times.includes(timeText)) return null;
  const key = reminderJobService.todayKey(timeText, now);
  if (ranKeys.has(key)) return null;
  ranKeys.add(key);
  return key;
}

function tick() {
  const runKey = shouldRun(new Date());
  if (!runKey) return;
  reminderJobService.runReminderJob(`schedule:${runKey}`)
    .then((result) => {
      console.log('[reminder-scheduler] completed', JSON.stringify(result));
    })
    .catch((error) => {
      console.error('[reminder-scheduler] failed', error);
    });
}

function start() {
  if (!config.reminderSchedule.enabled || timer) return;
  console.log(`[reminder-scheduler] enabled at ${config.reminderSchedule.times.join(', ')} (${config.reminderSchedule.timeZone})`);
  tick();
  timer = setInterval(tick, config.reminderSchedule.pollMs);
  if (timer.unref) timer.unref();
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop };
