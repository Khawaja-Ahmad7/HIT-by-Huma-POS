const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ValidationError, UnauthorizedError } = require('../middleware/errorHandler');

const router = express.Router();

// Login
router.post('/login', [
  body('employeeCode').notEmpty().withMessage('Employee code is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { employeeCode, password, locationId } = req.body;
    
    const result = await db.query(
      `SELECT u.*, r.RoleName, r.Permissions
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       WHERE u.EmployeeCode = @employeeCode AND u.IsActive = 1`,
      { employeeCode }
    );
    
    if (result.recordset.length === 0) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    const user = result.recordset[0];
    
    // TEMPORARY: Plain text password comparison (for development only)
    // TODO: Re-enable bcrypt hashing for production
    const validPassword = password === user.PasswordHash || await bcrypt.compare(password, user.PasswordHash).catch(() => false);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // Update last login
    await db.query(
      'UPDATE Users SET LastLoginAt = GETDATE() WHERE UserID = @userId',
      { userId: user.UserID }
    );
    
    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.UserID, role: user.RoleName },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.UserID },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    
    res.json({
      success: true,
      user: {
        id: user.UserID,
        employeeCode: user.EmployeeCode,
        firstName: user.FirstName,
        lastName: user.LastName,
        email: user.Email,
        role: user.RoleName,
        permissions: JSON.parse(user.Permissions || '[]'),
        locationId: user.PrimaryLocationID,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh Token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const result = await db.query(
      `SELECT u.*, r.RoleName, r.Permissions
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       WHERE u.UserID = @userId AND u.IsActive = 1`,
      { userId: decoded.userId }
    );
    
    if (result.recordset.length === 0) {
      throw new UnauthorizedError('User not found');
    }
    
    const user = result.recordset[0];
    
    const accessToken = jwt.sign(
      { userId: user.UserID, role: user.RoleName },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    
    res.json({ accessToken });
  } catch (error) {
    next(error);
  }
});

// Get Current User
router.get('/me', authenticate, async (req, res) => {
  res.json({
    id: req.user.UserID,
    employeeCode: req.user.EmployeeCode,
    firstName: req.user.FirstName,
    lastName: req.user.LastName,
    email: req.user.Email,
    role: req.user.RoleName,
    permissions: req.user.Permissions,
    locationId: req.user.PrimaryLocationID,
    locationName: req.user.LocationName,
  });
});

// Change Password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { currentPassword, newPassword } = req.body;
    
    const result = await db.query(
      'SELECT PasswordHash FROM Users WHERE UserID = @userId',
      { userId: req.user.UserID }
    );
    
    const validPassword = await bcrypt.compare(currentPassword, result.recordset[0].PasswordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await db.query(
      'UPDATE Users SET PasswordHash = @password, UpdatedAt = GETDATE() WHERE UserID = @userId',
      { password: hashedPassword, userId: req.user.UserID }
    );
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Verify Manager PIN
router.post('/verify-pin', authenticate, [
  body('pin').notEmpty().isLength({ min: 4, max: 6 }),
], async (req, res, next) => {
  try {
    const { pin } = req.body;
    
    const result = await db.query(
      `SELECT u.UserID, u.FirstName, u.LastName, r.RoleName
       FROM Users u
       INNER JOIN Roles r ON u.RoleID = r.RoleID
       WHERE u.ManagerPIN = @pin 
         AND u.IsActive = 1
         AND r.RoleName IN ('Admin', 'Manager')`,
      { pin }
    );
    
    if (result.recordset.length === 0) {
      return res.json({ valid: false });
    }
    
    res.json({ 
      valid: true,
      manager: {
        id: result.recordset[0].UserID,
        name: `${result.recordset[0].FirstName} ${result.recordset[0].LastName}`,
        role: result.recordset[0].RoleName,
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
