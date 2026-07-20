const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const dashboardRoutes = require('./dashboard');
const articleRoutes = require('./articles');
const messageRoutes = require('./messages');
const subscribeRoutes = require('./subscribe');
const webhookRoutes = require('./webhooks');
const todoStatRoutes = require('./todoStat');
const reminderRoutes = require('./reminders');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/articles', articleRoutes);
router.use('/messages', messageRoutes);
router.use('/subscribe', subscribeRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/todo-stat', todoStatRoutes);
router.use('/reminders', reminderRoutes);

module.exports = router;
