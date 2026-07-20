const app = require('./app');
const config = require('./config');
const reminderScheduler = require('./services/reminderScheduler');

app.listen(config.port, () => {
  console.log(`院院通 backend listening on http://localhost:${config.port}`);
  console.log(`MOCK_MODE=${config.mockMode}`);
  console.log(`TODO_DATA_SOURCE=${config.todoApi.dataSource}`);
  console.log(`REMINDER_TIME_ZONE=${config.reminderSchedule.timeZone}`);
  reminderScheduler.start();
});
