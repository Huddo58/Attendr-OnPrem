const express = require('express');
const router = express.Router();
const SetupController = require('../controllers/setupController');

// GET /setup
router.get('/', SetupController.showSetupPage);

// POST /setup
router.post('/', SetupController.processSetup);

module.exports = router;
