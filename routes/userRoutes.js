const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

// CRUD Routes for Users
router.post('/', userController.createUser.bind(userController));
router.get('/', userController.getAllUsers.bind(userController));
router.get('/:id', userController.getUserById.bind(userController));
router.put('/:id', userController.updateUser.bind(userController));
router.delete('/:id', userController.deleteUser.bind(userController));

module.exports = router;
