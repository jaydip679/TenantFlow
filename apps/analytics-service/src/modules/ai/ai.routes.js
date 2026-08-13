'use strict';

const express = require('express');
const aiController = require('./ai.controller');

const router = express.Router();

router.get('/churn/all', aiController.getAllChurnScores);
router.get('/churn/:tenantId', aiController.getChurnScore);
router.post('/chat', aiController.chat);

module.exports = router;
