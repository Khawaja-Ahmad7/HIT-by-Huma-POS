const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await db.query(
      `SELECT u.*, r.RoleName, r.Permissions, l.LocationCode, l.LocationName
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN Locations l ON u.PrimaryLocationID = l.LocationID
       WHERE u.UserID = @userId AND u.IsActive = 1`,
      { userId: decoded.userId }
    );
    
    if (result.recordset.length === 0) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    req.user = result.recordset[0];
    req.user.Permissions = JSON.parse(req.user.Permissions || '[]');
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Invalid or expired token'));
    }
    next(error);
  }
};

// Check specific permission
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    const userPermissions = req.user.Permissions;
    
    // Admin has all permissions
    if (userPermissions.includes('*')) {
      return next();
    }
    
    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(permission => {
      // Check exact match
      if (userPermissions.includes(permission)) return true;
      
      // Check wildcard (e.g., 'pos.*' matches 'pos.sale')
      const wildcardPermission = permission.split('.')[0] + '.*';
      return userPermissions.includes(wildcardPermission);
    });
    
    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    
    next();
  };
};

// Verify Manager PIN for sensitive operations
const verifyManagerPIN = async (req, res, next) => {
  try {
    const { managerPIN } = req.body;
    
    if (!managerPIN) {
      throw new ForbiddenError('Manager PIN required for this operation');
    }
    
    // Find manager with this PIN at the same location
    const result = await db.query(
      `SELECT u.UserID, u.FirstName, u.LastName, r.RoleName
       FROM Users u
       INNER JOIN Roles r ON u.RoleID = r.RoleID
       WHERE u.ManagerPIN = @pin 
         AND u.IsActive = 1
         AND (u.PrimaryLocationID = @locationId OR r.RoleName = 'Admin')`,
      { 
        pin: managerPIN,
        locationId: req.user.PrimaryLocationID
      }
    );
    
    if (result.recordset.length === 0) {
      throw new ForbiddenError('Invalid Manager PIN');
    }
    
    req.approvedBy = result.recordset[0];
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  authorize,
  verifyManagerPIN,
};
