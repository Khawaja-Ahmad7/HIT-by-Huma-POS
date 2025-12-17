const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all settings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT SettingKey, SettingValue, SettingType, Description, IsEditable
       FROM SystemSettings
       ORDER BY SettingKey`
    );
    
    const settings = {};
    result.recordset.forEach(row => {
      let value = row.SettingValue;
      
      // Parse based on type
      switch (row.SettingType) {
        case 'number':
          value = parseFloat(value);
          break;
        case 'boolean':
          value = value === 'true';
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string if parse fails
          }
          break;
      }
      
      settings[row.SettingKey] = {
        value,
        type: row.SettingType,
        description: row.Description,
        editable: row.IsEditable,
      };
    });
    
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

// Get single setting
router.get('/:key', authenticate, async (req, res, next) => {
  try {
    const { key } = req.params;
    
    const result = await db.query(
      `SELECT SettingValue, SettingType FROM SystemSettings WHERE SettingKey = @key`,
      { key }
    );
    
    if (result.recordset.length === 0) {
      return res.json({ value: null });
    }
    
    let value = result.recordset[0].SettingValue;
    const type = result.recordset[0].SettingType;
    
    if (type === 'number') value = parseFloat(value);
    if (type === 'boolean') value = value === 'true';
    if (type === 'json') {
      try { value = JSON.parse(value); } catch (e) {}
    }
    
    res.json({ value });
  } catch (error) {
    next(error);
  }
});

// Update setting
router.put('/:key', authenticate, authorize('settings.update'), async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    const setting = await db.query(
      `SELECT SettingID, IsEditable, SettingType FROM SystemSettings WHERE SettingKey = @key`,
      { key }
    );
    
    if (setting.recordset.length === 0) {
      // Create new setting
      await db.query(
        `INSERT INTO SystemSettings (SettingKey, SettingValue, UpdatedBy)
         VALUES (@key, @value, @userId)`,
        { key, value: String(value), userId: req.user.UserID }
      );
    } else {
      if (!setting.recordset[0].IsEditable) {
        return res.status(403).json({ error: 'This setting is not editable' });
      }
      
      const stringValue = setting.recordset[0].SettingType === 'json' 
        ? JSON.stringify(value) 
        : String(value);
      
      await db.query(
        `UPDATE SystemSettings SET SettingValue = @value, UpdatedBy = @userId, UpdatedAt = GETDATE()
         WHERE SettingKey = @key`,
        { key, value: stringValue, userId: req.user.UserID }
      );
    }
    
    res.json({ success: true, message: 'Setting updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Get locations
router.get('/locations/all', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM Locations WHERE IsActive = 1 ORDER BY LocationName`
    );
    
    res.json({ locations: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Create location
router.post('/locations', authenticate, authorize('settings.locations'), async (req, res, next) => {
  try {
    const { code, name, address, city, phone, email, isHeadquarters } = req.body;
    
    const result = await db.query(
      `INSERT INTO Locations (LocationCode, LocationName, Address, City, Phone, Email, IsHeadquarters)
       OUTPUT INSERTED.LocationID
       VALUES (@code, @name, @address, @city, @phone, @email, @isHeadquarters)`,
      {
        code, name, 
        address: address || null, 
        city: city || null,
        phone: phone || null, 
        email: email || null,
        isHeadquarters: isHeadquarters || false
      }
    );
    
    res.status(201).json({
      success: true,
      locationId: result.recordset[0].LocationID,
    });
  } catch (error) {
    next(error);
  }
});

// Get users
router.get('/users/all', authenticate, authorize('settings.users'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.UserID, u.EmployeeCode, u.Email, u.FirstName, u.LastName, u.Phone,
        u.IsActive, u.LastLoginAt, u.CreatedAt,
        r.RoleID, r.RoleName,
        l.LocationID, l.LocationName
       FROM Users u
       LEFT JOIN Roles r ON u.RoleID = r.RoleID
       LEFT JOIN Locations l ON u.PrimaryLocationID = l.LocationID
       ORDER BY u.FirstName, u.LastName`
    );
    
    res.json({ users: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Create user
router.post('/users', authenticate, authorize('settings.users'), async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const {
      employeeCode, email, password, firstName, lastName,
      phone, roleId, locationId, managerPIN, hourlyRate, commissionRate
    } = req.body;
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const result = await db.query(
      `INSERT INTO Users (
        EmployeeCode, Email, PasswordHash, FirstName, LastName,
        Phone, RoleID, PrimaryLocationID, ManagerPIN, HourlyRate, CommissionRate
       )
       OUTPUT INSERTED.UserID
       VALUES (
        @employeeCode, @email, @password, @firstName, @lastName,
        @phone, @roleId, @locationId, @managerPIN, @hourlyRate, @commissionRate
       )`,
      {
        employeeCode,
        email: email || null,
        password: hashedPassword,
        firstName,
        lastName: lastName || null,
        phone: phone || null,
        roleId,
        locationId: locationId || null,
        managerPIN: managerPIN || null,
        hourlyRate: hourlyRate || 0,
        commissionRate: commissionRate || 0,
      }
    );
    
    res.status(201).json({
      success: true,
      userId: result.recordset[0].UserID,
    });
  } catch (error) {
    next(error);
  }
});

// Get roles
router.get('/roles/all', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT RoleID, RoleName, Description, Permissions FROM Roles ORDER BY RoleName`
    );
    
    res.json({
      roles: result.recordset.map(r => ({
        ...r,
        Permissions: JSON.parse(r.Permissions || '[]'),
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
