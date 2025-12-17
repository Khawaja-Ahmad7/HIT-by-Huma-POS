-- =============================================
-- HIT BY HUMA POS - Database Schema
-- SQL Server Database Design
-- Version: 1.0.0
-- =============================================

-- Create Database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'HitByHumaPOS')
BEGIN
    CREATE DATABASE HitByHumaPOS;
END
GO

USE HitByHumaPOS;
GO

-- =============================================
-- CORE LOOKUP TABLES
-- =============================================

-- Locations/Stores Table
CREATE TABLE Locations (
    LocationID INT IDENTITY(1,1) PRIMARY KEY,
    LocationCode NVARCHAR(20) NOT NULL UNIQUE,
    LocationName NVARCHAR(100) NOT NULL,
    Address NVARCHAR(500),
    City NVARCHAR(100),
    Phone NVARCHAR(20),
    Email NVARCHAR(100),
    IsActive BIT DEFAULT 1,
    IsHeadquarters BIT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);

-- Product Categories
CREATE TABLE Categories (
    CategoryID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryName NVARCHAR(100) NOT NULL,
    ParentCategoryID INT NULL REFERENCES Categories(CategoryID),
    Description NVARCHAR(500),
    SortOrder INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);

-- Product Attributes (Size, Color, etc.)
CREATE TABLE Attributes (
    AttributeID INT IDENTITY(1,1) PRIMARY KEY,
    AttributeName NVARCHAR(50) NOT NULL UNIQUE, -- e.g., 'Size', 'Color'
    AttributeType NVARCHAR(20) DEFAULT 'select', -- select, text, color
    SortOrder INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE()
);

-- Attribute Values
CREATE TABLE AttributeValues (
    AttributeValueID INT IDENTITY(1,1) PRIMARY KEY,
    AttributeID INT NOT NULL REFERENCES Attributes(AttributeID),
    Value NVARCHAR(100) NOT NULL, -- e.g., 'S', 'M', 'L', 'Red', 'Blue'
    ColorHex NVARCHAR(7) NULL, -- For color attributes: #FF0000
    SortOrder INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT UQ_Attribute_Value UNIQUE (AttributeID, Value)
);

-- =============================================
-- PRODUCT MATRIX (Parent/Child Architecture)
-- =============================================

-- Parent Products (Master Product Definition)
CREATE TABLE Products (
    ProductID INT IDENTITY(1,1) PRIMARY KEY,
    ProductCode NVARCHAR(50) NOT NULL UNIQUE,
    ProductName NVARCHAR(200) NOT NULL,
    CategoryID INT REFERENCES Categories(CategoryID),
    Description NVARCHAR(MAX),
    BasePrice DECIMAL(18,2) NOT NULL,
    CostPrice DECIMAL(18,2) DEFAULT 0,
    TaxRate DECIMAL(5,2) DEFAULT 0, -- Tax percentage
    HasVariants BIT DEFAULT 0, -- True if this product has variants
    PropagatePrice BIT DEFAULT 1, -- If true, price changes cascade to variants
    ImageURL NVARCHAR(500),
    Tags NVARCHAR(500), -- Comma-separated tags for search
    IsActive BIT DEFAULT 1,
    CreatedBy INT,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Products_Category (CategoryID),
    INDEX IX_Products_Name (ProductName),
    INDEX IX_Products_Active (IsActive)
);

-- Product Variants (Child Products with SKU)
CREATE TABLE ProductVariants (
    VariantID INT IDENTITY(1,1) PRIMARY KEY,
    ProductID INT NOT NULL REFERENCES Products(ProductID) ON DELETE CASCADE,
    SKU NVARCHAR(50) NOT NULL UNIQUE,
    Barcode NVARCHAR(50) UNIQUE,
    VariantName NVARCHAR(200), -- Auto-generated: "Embroidered Kurta - Red - M"
    Price DECIMAL(18,2) NOT NULL, -- Can override parent price
    CostPrice DECIMAL(18,2) DEFAULT 0,
    Weight DECIMAL(10,3) NULL, -- For shipping calculations
    IsDefault BIT DEFAULT 0, -- Default variant to show
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Variants_Product (ProductID),
    INDEX IX_Variants_SKU (SKU),
    INDEX IX_Variants_Barcode (Barcode)
);

-- Variant Attribute Values (Links variants to their attributes)
CREATE TABLE VariantAttributes (
    VariantAttributeID INT IDENTITY(1,1) PRIMARY KEY,
    VariantID INT NOT NULL REFERENCES ProductVariants(VariantID) ON DELETE CASCADE,
    AttributeID INT NOT NULL REFERENCES Attributes(AttributeID),
    AttributeValueID INT NOT NULL REFERENCES AttributeValues(AttributeValueID),
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT UQ_Variant_Attribute UNIQUE (VariantID, AttributeID)
);

-- Product Attributes Definition (Which attributes apply to a product)
CREATE TABLE ProductAttributes (
    ProductAttributeID INT IDENTITY(1,1) PRIMARY KEY,
    ProductID INT NOT NULL REFERENCES Products(ProductID) ON DELETE CASCADE,
    AttributeID INT NOT NULL REFERENCES Attributes(AttributeID),
    IsRequired BIT DEFAULT 1,
    SortOrder INT DEFAULT 0,
    CONSTRAINT UQ_Product_Attribute UNIQUE (ProductID, AttributeID)
);

-- =============================================
-- MULTI-LOCATION INVENTORY
-- =============================================

-- Inventory per Location per Variant
CREATE TABLE Inventory (
    InventoryID INT IDENTITY(1,1) PRIMARY KEY,
    VariantID INT NOT NULL REFERENCES ProductVariants(VariantID),
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    QuantityOnHand INT DEFAULT 0,
    QuantityReserved INT DEFAULT 0, -- Reserved for pending orders
    ReorderLevel INT DEFAULT 5,
    ReorderQuantity INT DEFAULT 10,
    BinLocation NVARCHAR(50), -- Physical location in store
    LastStockCheck DATETIME2,
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT UQ_Inventory_Variant_Location UNIQUE (VariantID, LocationID),
    INDEX IX_Inventory_Location (LocationID),
    INDEX IX_Inventory_Variant (VariantID)
);

-- Inventory Transactions (Audit Trail)
CREATE TABLE InventoryTransactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    VariantID INT NOT NULL REFERENCES ProductVariants(VariantID),
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    TransactionType NVARCHAR(20) NOT NULL, -- SALE, RETURN, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, RECEIVE
    QuantityChange INT NOT NULL, -- Positive or negative
    QuantityBefore INT NOT NULL,
    QuantityAfter INT NOT NULL,
    ReferenceType NVARCHAR(50), -- SALE, PURCHASE_ORDER, TRANSFER, MANUAL
    ReferenceID INT, -- Links to Sale, PO, Transfer ID
    Notes NVARCHAR(500),
    CreatedBy INT,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_InvTrans_Variant (VariantID),
    INDEX IX_InvTrans_Location (LocationID),
    INDEX IX_InvTrans_Date (CreatedAt)
);

-- Stock Transfers Between Locations
CREATE TABLE StockTransfers (
    TransferID INT IDENTITY(1,1) PRIMARY KEY,
    TransferNumber NVARCHAR(20) NOT NULL UNIQUE,
    FromLocationID INT NOT NULL REFERENCES Locations(LocationID),
    ToLocationID INT NOT NULL REFERENCES Locations(LocationID),
    Status NVARCHAR(20) DEFAULT 'PENDING', -- PENDING, IN_TRANSIT, COMPLETED, CANCELLED
    Notes NVARCHAR(500),
    RequestedBy INT,
    ApprovedBy INT,
    RequestedAt DATETIME2 DEFAULT GETDATE(),
    CompletedAt DATETIME2,
    INDEX IX_Transfer_Status (Status),
    INDEX IX_Transfer_From (FromLocationID),
    INDEX IX_Transfer_To (ToLocationID)
);

CREATE TABLE StockTransferItems (
    TransferItemID INT IDENTITY(1,1) PRIMARY KEY,
    TransferID INT NOT NULL REFERENCES StockTransfers(TransferID) ON DELETE CASCADE,
    VariantID INT NOT NULL REFERENCES ProductVariants(VariantID),
    QuantityRequested INT NOT NULL,
    QuantityShipped INT DEFAULT 0,
    QuantityReceived INT DEFAULT 0
);

-- =============================================
-- USERS & AUTHENTICATION
-- =============================================

CREATE TABLE Roles (
    RoleID INT IDENTITY(1,1) PRIMARY KEY,
    RoleName NVARCHAR(50) NOT NULL UNIQUE,
    Description NVARCHAR(200),
    Permissions NVARCHAR(MAX), -- JSON array of permission codes
    CreatedAt DATETIME2 DEFAULT GETDATE()
);

CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode NVARCHAR(20) NOT NULL UNIQUE,
    Email NVARCHAR(100) UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100),
    Phone NVARCHAR(20),
    RoleID INT REFERENCES Roles(RoleID),
    PrimaryLocationID INT REFERENCES Locations(LocationID),
    ManagerPIN NVARCHAR(10), -- For override approvals
    HourlyRate DECIMAL(10,2) DEFAULT 0,
    CommissionRate DECIMAL(5,2) DEFAULT 0, -- Percentage
    IsActive BIT DEFAULT 1,
    LastLoginAt DATETIME2,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Users_Role (RoleID),
    INDEX IX_Users_Location (PrimaryLocationID)
);

-- =============================================
-- CUSTOMER RELATIONSHIP MANAGEMENT (CRM)
-- =============================================

CREATE TABLE Customers (
    CustomerID INT IDENTITY(1,1) PRIMARY KEY,
    Phone NVARCHAR(20) NOT NULL UNIQUE, -- Primary Key for lookup
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    Email NVARCHAR(100),
    DateOfBirth DATE,
    Gender NVARCHAR(10),
    Address NVARCHAR(500),
    City NVARCHAR(100),
    CustomerType NVARCHAR(20) DEFAULT 'REGULAR', -- REGULAR, VIP, WHOLESALE
    TotalSpend DECIMAL(18,2) DEFAULT 0,
    TotalVisits INT DEFAULT 0,
    LastVisitAt DATETIME2,
    WalletBalance DECIMAL(18,2) DEFAULT 0, -- Store Credit
    LoyaltyPoints INT DEFAULT 0,
    Notes NVARCHAR(MAX),
    OptInSMS BIT DEFAULT 1,
    OptInEmail BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Customers_Phone (Phone),
    INDEX IX_Customers_Name (FirstName, LastName),
    INDEX IX_Customers_Type (CustomerType)
);

-- Customer Wallet Transactions
CREATE TABLE WalletTransactions (
    WalletTransactionID INT IDENTITY(1,1) PRIMARY KEY,
    CustomerID INT NOT NULL REFERENCES Customers(CustomerID),
    TransactionType NVARCHAR(20) NOT NULL, -- CREDIT, DEBIT, REFUND, EXPIRED
    Amount DECIMAL(18,2) NOT NULL,
    BalanceBefore DECIMAL(18,2) NOT NULL,
    BalanceAfter DECIMAL(18,2) NOT NULL,
    ReferenceType NVARCHAR(50), -- RETURN, PROMOTION, MANUAL
    ReferenceID INT,
    Notes NVARCHAR(500),
    ExpiresAt DATETIME2,
    CreatedBy INT,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Wallet_Customer (CustomerID)
);

-- =============================================
-- POS TRANSACTIONS
-- =============================================

-- Shift Management
CREATE TABLE Shifts (
    ShiftID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL REFERENCES Users(UserID),
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    TerminalNumber NVARCHAR(20),
    OpeningCash DECIMAL(18,2) DEFAULT 0,
    ClosingCash DECIMAL(18,2),
    ExpectedCash DECIMAL(18,2), -- System calculated
    CashVariance DECIMAL(18,2), -- Difference
    Status NVARCHAR(20) DEFAULT 'OPEN', -- OPEN, CLOSED, RECONCILED
    ClockInAt DATETIME2 DEFAULT GETDATE(),
    ClockOutAt DATETIME2,
    Notes NVARCHAR(500),
    ReconciliationNotes NVARCHAR(500),
    ReconciliationBy INT,
    INDEX IX_Shifts_User (UserID),
    INDEX IX_Shifts_Location (LocationID),
    INDEX IX_Shifts_Status (Status)
);

-- Sales/Transactions
CREATE TABLE Sales (
    SaleID INT IDENTITY(1,1) PRIMARY KEY,
    SaleNumber NVARCHAR(30) NOT NULL UNIQUE, -- Format: LOC-YYYYMMDD-XXXX
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    ShiftID INT REFERENCES Shifts(ShiftID),
    CustomerID INT REFERENCES Customers(CustomerID),
    UserID INT NOT NULL REFERENCES Users(UserID), -- Cashier
    
    -- Amounts
    SubTotal DECIMAL(18,2) NOT NULL, -- Before discounts/tax
    DiscountAmount DECIMAL(18,2) DEFAULT 0,
    DiscountType NVARCHAR(20), -- PERCENTAGE, FIXED, RULE
    DiscountReason NVARCHAR(200),
    TaxAmount DECIMAL(18,2) DEFAULT 0,
    TotalAmount DECIMAL(18,2) NOT NULL, -- Final amount
    
    -- Status
    Status NVARCHAR(20) DEFAULT 'COMPLETED', -- PARKED, COMPLETED, VOIDED, RETURNED
    IsParked BIT DEFAULT 0,
    ParkedAt DATETIME2,
    ParkedNotes NVARCHAR(200),
    
    -- Metadata
    ReceiptPrinted BIT DEFAULT 0,
    SMSSent BIT DEFAULT 0,
    Notes NVARCHAR(500),
    
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    
    INDEX IX_Sales_Location (LocationID),
    INDEX IX_Sales_Customer (CustomerID),
    INDEX IX_Sales_User (UserID),
    INDEX IX_Sales_Date (CreatedAt),
    INDEX IX_Sales_Status (Status)
);

-- Sale Line Items
CREATE TABLE SaleItems (
    SaleItemID INT IDENTITY(1,1) PRIMARY KEY,
    SaleID INT NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
    VariantID INT NOT NULL REFERENCES ProductVariants(VariantID),
    Quantity INT NOT NULL,
    UnitPrice DECIMAL(18,2) NOT NULL, -- Price at time of sale
    OriginalPrice DECIMAL(18,2) NOT NULL, -- Original price before any override
    DiscountAmount DECIMAL(18,2) DEFAULT 0,
    TaxAmount DECIMAL(18,2) DEFAULT 0,
    LineTotal DECIMAL(18,2) NOT NULL,
    PriceOverrideBy INT REFERENCES Users(UserID), -- Manager who approved
    Notes NVARCHAR(200),
    INDEX IX_SaleItems_Sale (SaleID),
    INDEX IX_SaleItems_Variant (VariantID)
);

-- Payment Methods
CREATE TABLE PaymentMethods (
    PaymentMethodID INT IDENTITY(1,1) PRIMARY KEY,
    MethodName NVARCHAR(50) NOT NULL UNIQUE,
    MethodType NVARCHAR(20) NOT NULL, -- CASH, CARD, WALLET, ONLINE
    IsActive BIT DEFAULT 1,
    RequiresReference BIT DEFAULT 0, -- Needs reference number
    OpensCashDrawer BIT DEFAULT 0,
    SortOrder INT DEFAULT 0
);

-- Sale Payments (Support Split Payments)
CREATE TABLE SalePayments (
    SalePaymentID INT IDENTITY(1,1) PRIMARY KEY,
    SaleID INT NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
    PaymentMethodID INT NOT NULL REFERENCES PaymentMethods(PaymentMethodID),
    Amount DECIMAL(18,2) NOT NULL,
    TenderedAmount DECIMAL(18,2), -- For cash: amount given
    ChangeAmount DECIMAL(18,2), -- For cash: change returned
    ReferenceNumber NVARCHAR(100), -- Card auth, transaction ID
    Notes NVARCHAR(200),
    ProcessedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Payments_Sale (SaleID)
);

-- =============================================
-- RETURNS & EXCHANGES
-- =============================================

CREATE TABLE Returns (
    ReturnID INT IDENTITY(1,1) PRIMARY KEY,
    ReturnNumber NVARCHAR(30) NOT NULL UNIQUE,
    OriginalSaleID INT REFERENCES Sales(SaleID),
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    CustomerID INT REFERENCES Customers(CustomerID),
    UserID INT NOT NULL REFERENCES Users(UserID),
    
    ReturnType NVARCHAR(20) NOT NULL, -- REFUND, EXCHANGE, STORE_CREDIT
    TotalRefundAmount DECIMAL(18,2) NOT NULL,
    RefundMethod NVARCHAR(20), -- ORIGINAL_PAYMENT, CASH, WALLET
    
    Reason NVARCHAR(500),
    ManagerApprovedBy INT REFERENCES Users(UserID),
    Status NVARCHAR(20) DEFAULT 'COMPLETED',
    
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    INDEX IX_Returns_Sale (OriginalSaleID),
    INDEX IX_Returns_Customer (CustomerID)
);

CREATE TABLE ReturnItems (
    ReturnItemID INT IDENTITY(1,1) PRIMARY KEY,
    ReturnID INT NOT NULL REFERENCES Returns(ReturnID) ON DELETE CASCADE,
    OriginalSaleItemID INT REFERENCES SaleItems(SaleItemID),
    VariantID INT NOT NULL REFERENCES ProductVariants(VariantID),
    Quantity INT NOT NULL,
    RefundAmount DECIMAL(18,2) NOT NULL,
    Condition NVARCHAR(50), -- RESALABLE, DAMAGED, DEFECTIVE
    RestockLocation INT REFERENCES Locations(LocationID),
    Notes NVARCHAR(200)
);

-- =============================================
-- DISCOUNT RULES ENGINE
-- =============================================

CREATE TABLE DiscountRules (
    RuleID INT IDENTITY(1,1) PRIMARY KEY,
    RuleName NVARCHAR(100) NOT NULL,
    RuleCode NVARCHAR(50) UNIQUE,
    Description NVARCHAR(500),
    
    -- Rule Type
    RuleType NVARCHAR(20) NOT NULL, -- BUNDLE, CATEGORY, QUANTITY, COUPON, CUSTOMER_TYPE
    
    -- Conditions (JSON structure for flexibility)
    Conditions NVARCHAR(MAX), -- JSON: {"categories": [1,2], "minQty": 2, "products": [...]}
    
    -- Discount
    DiscountType NVARCHAR(20) NOT NULL, -- PERCENTAGE, FIXED, PRICE_OVERRIDE
    DiscountValue DECIMAL(18,2) NOT NULL,
    MaxDiscountAmount DECIMAL(18,2), -- Cap for percentage discounts
    
    -- Validity
    StartDate DATETIME2,
    EndDate DATETIME2,
    UsageLimit INT, -- Max times rule can be used
    UsageCount INT DEFAULT 0,
    
    -- Scope
    ApplicableLocations NVARCHAR(MAX), -- JSON array of location IDs, null = all
    ApplicableCustomerTypes NVARCHAR(MAX), -- JSON array
    
    Priority INT DEFAULT 0, -- Higher priority rules apply first
    IsStackable BIT DEFAULT 0, -- Can combine with other discounts
    IsActive BIT DEFAULT 1,
    
    CreatedBy INT,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    
    INDEX IX_Rules_Active (IsActive),
    INDEX IX_Rules_Type (RuleType)
);

-- =============================================
-- NOTIFICATIONS & SMS QUEUE
-- =============================================

CREATE TABLE NotificationQueue (
    NotificationID INT IDENTITY(1,1) PRIMARY KEY,
    NotificationType NVARCHAR(20) NOT NULL, -- SMS, EMAIL
    RecipientPhone NVARCHAR(20),
    RecipientEmail NVARCHAR(100),
    Subject NVARCHAR(200),
    Message NVARCHAR(MAX) NOT NULL,
    
    -- Reference
    ReferenceType NVARCHAR(50), -- SALE, RETURN, PROMOTION
    ReferenceID INT,
    
    -- Status
    Status NVARCHAR(20) DEFAULT 'PENDING', -- PENDING, PROCESSING, SENT, FAILED
    Attempts INT DEFAULT 0,
    MaxAttempts INT DEFAULT 3,
    LastAttemptAt DATETIME2,
    SentAt DATETIME2,
    ErrorMessage NVARCHAR(500),
    
    -- Provider Response
    ProviderMessageID NVARCHAR(100),
    
    ScheduledFor DATETIME2 DEFAULT GETDATE(),
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    
    INDEX IX_Notifications_Status (Status),
    INDEX IX_Notifications_Scheduled (ScheduledFor)
);

-- =============================================
-- REPORTS & ANALYTICS
-- =============================================

-- Daily Summary (Pre-aggregated for performance)
CREATE TABLE DailySalesSummary (
    SummaryID INT IDENTITY(1,1) PRIMARY KEY,
    SummaryDate DATE NOT NULL,
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    
    TotalSales DECIMAL(18,2) DEFAULT 0,
    TotalReturns DECIMAL(18,2) DEFAULT 0,
    NetSales DECIMAL(18,2) DEFAULT 0,
    TotalDiscounts DECIMAL(18,2) DEFAULT 0,
    TotalTax DECIMAL(18,2) DEFAULT 0,
    
    TransactionCount INT DEFAULT 0,
    ItemsSold INT DEFAULT 0,
    AverageTransactionValue DECIMAL(18,2) DEFAULT 0,
    
    CashTotal DECIMAL(18,2) DEFAULT 0,
    CardTotal DECIMAL(18,2) DEFAULT 0,
    WalletTotal DECIMAL(18,2) DEFAULT 0,
    
    NewCustomers INT DEFAULT 0,
    ReturningCustomers INT DEFAULT 0,
    
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    
    CONSTRAINT UQ_DailySummary UNIQUE (SummaryDate, LocationID),
    INDEX IX_Summary_Date (SummaryDate)
);

-- Z-Report (End of Day)
CREATE TABLE ZReports (
    ZReportID INT IDENTITY(1,1) PRIMARY KEY,
    ReportNumber NVARCHAR(30) NOT NULL UNIQUE,
    LocationID INT NOT NULL REFERENCES Locations(LocationID),
    ReportDate DATE NOT NULL,
    
    -- Sales Summary
    GrossSales DECIMAL(18,2) DEFAULT 0,
    Discounts DECIMAL(18,2) DEFAULT 0,
    Returns DECIMAL(18,2) DEFAULT 0,
    NetSales DECIMAL(18,2) DEFAULT 0,
    TaxCollected DECIMAL(18,2) DEFAULT 0,
    
    -- Transaction Counts
    SaleCount INT DEFAULT 0,
    VoidCount INT DEFAULT 0,
    ReturnCount INT DEFAULT 0,
    
    -- Payment Breakdown
    CashTotal DECIMAL(18,2) DEFAULT 0,
    CardTotal DECIMAL(18,2) DEFAULT 0,
    WalletTotal DECIMAL(18,2) DEFAULT 0,
    
    -- Cash Reconciliation
    OpeningCash DECIMAL(18,2) DEFAULT 0,
    CashIn DECIMAL(18,2) DEFAULT 0,
    CashOut DECIMAL(18,2) DEFAULT 0, -- Payouts, returns
    ExpectedCash DECIMAL(18,2) DEFAULT 0,
    ActualCash DECIMAL(18,2),
    Variance DECIMAL(18,2),
    VarianceNotes NVARCHAR(500),
    
    GeneratedBy INT REFERENCES Users(UserID),
    GeneratedAt DATETIME2 DEFAULT GETDATE(),
    
    INDEX IX_ZReport_Location (LocationID),
    INDEX IX_ZReport_Date (ReportDate)
);

-- =============================================
-- AUDIT TRAIL
-- =============================================

CREATE TABLE AuditLog (
    AuditID BIGINT IDENTITY(1,1) PRIMARY KEY,
    TableName NVARCHAR(100) NOT NULL,
    RecordID INT NOT NULL,
    Action NVARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    OldValues NVARCHAR(MAX), -- JSON
    NewValues NVARCHAR(MAX), -- JSON
    ChangedFields NVARCHAR(MAX), -- JSON array of field names
    UserID INT,
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(500),
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    
    INDEX IX_Audit_Table (TableName),
    INDEX IX_Audit_Record (TableName, RecordID),
    INDEX IX_Audit_User (UserID),
    INDEX IX_Audit_Date (CreatedAt)
);

-- =============================================
-- SYSTEM CONFIGURATION
-- =============================================

CREATE TABLE SystemSettings (
    SettingID INT IDENTITY(1,1) PRIMARY KEY,
    SettingKey NVARCHAR(100) NOT NULL UNIQUE,
    SettingValue NVARCHAR(MAX),
    SettingType NVARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    Description NVARCHAR(500),
    IsEditable BIT DEFAULT 1,
    UpdatedBy INT,
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

GO

-- View: Full Product with Variants
CREATE VIEW vw_ProductVariantsWithDetails AS
SELECT 
    p.ProductID,
    p.ProductCode,
    p.ProductName,
    p.BasePrice,
    p.HasVariants,
    c.CategoryID,
    c.CategoryName,
    pv.VariantID,
    pv.SKU,
    pv.Barcode,
    pv.VariantName,
    pv.Price AS VariantPrice,
    pv.IsActive AS VariantActive
FROM Products p
LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
LEFT JOIN ProductVariants pv ON p.ProductID = pv.ProductID
WHERE p.IsActive = 1;
GO

-- View: Inventory with Product Details
CREATE VIEW vw_InventoryDetails AS
SELECT 
    i.InventoryID,
    i.LocationID,
    l.LocationName,
    l.LocationCode,
    pv.VariantID,
    pv.SKU,
    pv.Barcode,
    pv.VariantName,
    p.ProductID,
    p.ProductName,
    pv.Price,
    i.QuantityOnHand,
    i.QuantityReserved,
    (i.QuantityOnHand - i.QuantityReserved) AS AvailableQuantity,
    i.ReorderLevel,
    CASE WHEN i.QuantityOnHand <= i.ReorderLevel THEN 1 ELSE 0 END AS NeedsReorder
FROM Inventory i
INNER JOIN ProductVariants pv ON i.VariantID = pv.VariantID
INNER JOIN Products p ON pv.ProductID = p.ProductID
INNER JOIN Locations l ON i.LocationID = l.LocationID;
GO

-- View: Sales with Details
CREATE VIEW vw_SalesDetails AS
SELECT 
    s.SaleID,
    s.SaleNumber,
    s.LocationID,
    l.LocationName,
    s.CustomerID,
    CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
    c.Phone AS CustomerPhone,
    s.UserID,
    CONCAT(u.FirstName, ' ', u.LastName) AS CashierName,
    s.SubTotal,
    s.DiscountAmount,
    s.TaxAmount,
    s.TotalAmount,
    s.Status,
    s.CreatedAt
FROM Sales s
INNER JOIN Locations l ON s.LocationID = l.LocationID
LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
INNER JOIN Users u ON s.UserID = u.UserID;
GO

-- =============================================
-- STORED PROCEDURES
-- =============================================

-- Procedure: Generate SKU for Variant
CREATE PROCEDURE sp_GenerateSKU
    @ProductCode NVARCHAR(50),
    @Attributes NVARCHAR(200), -- e.g., "RED-M"
    @SKU NVARCHAR(50) OUTPUT
AS
BEGIN
    SET @SKU = CONCAT(@ProductCode, '-', @Attributes, '-', FORMAT(GETDATE(), 'yyMMdd'));
END
GO

-- Procedure: Update Inventory with Transaction Log
CREATE PROCEDURE sp_UpdateInventory
    @VariantID INT,
    @LocationID INT,
    @QuantityChange INT,
    @TransactionType NVARCHAR(20),
    @ReferenceType NVARCHAR(50) = NULL,
    @ReferenceID INT = NULL,
    @UserID INT = NULL,
    @Notes NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    
    DECLARE @QuantityBefore INT, @QuantityAfter INT;
    
    -- Get current quantity
    SELECT @QuantityBefore = ISNULL(QuantityOnHand, 0)
    FROM Inventory
    WHERE VariantID = @VariantID AND LocationID = @LocationID;
    
    IF @QuantityBefore IS NULL
    BEGIN
        -- Create inventory record if doesn't exist
        INSERT INTO Inventory (VariantID, LocationID, QuantityOnHand)
        VALUES (@VariantID, @LocationID, 0);
        SET @QuantityBefore = 0;
    END
    
    SET @QuantityAfter = @QuantityBefore + @QuantityChange;
    
    -- Update inventory
    UPDATE Inventory
    SET QuantityOnHand = @QuantityAfter,
        UpdatedAt = GETDATE()
    WHERE VariantID = @VariantID AND LocationID = @LocationID;
    
    -- Log transaction
    INSERT INTO InventoryTransactions (
        VariantID, LocationID, TransactionType, 
        QuantityChange, QuantityBefore, QuantityAfter,
        ReferenceType, ReferenceID, Notes, CreatedBy
    )
    VALUES (
        @VariantID, @LocationID, @TransactionType,
        @QuantityChange, @QuantityBefore, @QuantityAfter,
        @ReferenceType, @ReferenceID, @Notes, @UserID
    );
    
    COMMIT TRANSACTION;
END
GO

-- Procedure: Check Stock at Other Locations
CREATE PROCEDURE sp_CheckStockAtOtherLocations
    @VariantID INT,
    @CurrentLocationID INT
AS
BEGIN
    SELECT 
        l.LocationID,
        l.LocationCode,
        l.LocationName,
        l.Phone,
        i.QuantityOnHand,
        i.QuantityReserved,
        (i.QuantityOnHand - i.QuantityReserved) AS Available
    FROM Inventory i
    INNER JOIN Locations l ON i.LocationID = l.LocationID
    WHERE i.VariantID = @VariantID
        AND i.LocationID != @CurrentLocationID
        AND l.IsActive = 1
        AND i.QuantityOnHand > 0
    ORDER BY i.QuantityOnHand DESC;
END
GO

-- Procedure: Generate Sale Number
CREATE PROCEDURE sp_GenerateSaleNumber
    @LocationCode NVARCHAR(20),
    @SaleNumber NVARCHAR(30) OUTPUT
AS
BEGIN
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
    DECLARE @Sequence INT;
    
    SELECT @Sequence = ISNULL(MAX(
        CAST(RIGHT(SaleNumber, 4) AS INT)
    ), 0) + 1
    FROM Sales
    WHERE LocationID = (SELECT LocationID FROM Locations WHERE LocationCode = @LocationCode)
        AND CAST(CreatedAt AS DATE) = @Today;
    
    SET @SaleNumber = CONCAT(@LocationCode, '-', FORMAT(GETDATE(), 'yyyyMMdd'), '-', RIGHT('0000' + CAST(@Sequence AS NVARCHAR), 4));
END
GO

-- Procedure: Calculate Customer Totals
CREATE PROCEDURE sp_UpdateCustomerTotals
    @CustomerID INT
AS
BEGIN
    UPDATE Customers
    SET 
        TotalSpend = (
            SELECT ISNULL(SUM(TotalAmount), 0)
            FROM Sales
            WHERE CustomerID = @CustomerID AND Status = 'COMPLETED'
        ),
        TotalVisits = (
            SELECT COUNT(*)
            FROM Sales
            WHERE CustomerID = @CustomerID AND Status = 'COMPLETED'
        ),
        LastVisitAt = (
            SELECT MAX(CreatedAt)
            FROM Sales
            WHERE CustomerID = @CustomerID AND Status = 'COMPLETED'
        ),
        UpdatedAt = GETDATE()
    WHERE CustomerID = @CustomerID;
END
GO

-- =============================================
-- INSERT DEFAULT DATA
-- =============================================

-- Insert Default Roles
INSERT INTO Roles (RoleName, Description, Permissions) VALUES
('Admin', 'Full system access', '["*"]'),
('Manager', 'Store manager with override capabilities', '["pos.*","inventory.*","reports.*","customers.*","returns.approve","discounts.override"]'),
('Cashier', 'POS terminal operations', '["pos.sale","pos.park","pos.retrieve","customers.view","customers.create","returns.create"]'),
('Inventory', 'Inventory management', '["inventory.*","products.view"]');

-- Insert Default Payment Methods
INSERT INTO PaymentMethods (MethodName, MethodType, IsActive, RequiresReference, OpensCashDrawer, SortOrder) VALUES
('Cash', 'CASH', 1, 0, 1, 1),
('Credit Card', 'CARD', 1, 1, 0, 2),
('Debit Card', 'CARD', 1, 1, 0, 3),
('Store Credit', 'WALLET', 1, 0, 0, 4),
('JazzCash', 'ONLINE', 1, 1, 0, 5),
('EasyPaisa', 'ONLINE', 1, 1, 0, 6);

-- Insert Default Attributes
INSERT INTO Attributes (AttributeName, AttributeType, SortOrder) VALUES
('Size', 'select', 1),
('Color', 'color', 2);

-- Insert Default Size Values
INSERT INTO AttributeValues (AttributeID, Value, SortOrder) VALUES
(1, 'XS', 1), (1, 'S', 2), (1, 'M', 3), (1, 'L', 4), (1, 'XL', 5), (1, 'XXL', 6),
(1, 'Free Size', 7);

-- Insert Default Color Values
INSERT INTO AttributeValues (AttributeID, Value, ColorHex, SortOrder) VALUES
(2, 'Black', '#000000', 1),
(2, 'White', '#FFFFFF', 2),
(2, 'Red', '#FF0000', 3),
(2, 'Blue', '#0000FF', 4),
(2, 'Green', '#00FF00', 5),
(2, 'Navy', '#000080', 6),
(2, 'Maroon', '#800000', 7),
(2, 'Beige', '#F5F5DC', 8),
(2, 'Pink', '#FFC0CB', 9),
(2, 'Purple', '#800080', 10);

-- Insert Default Categories
INSERT INTO Categories (CategoryName, Description, SortOrder) VALUES
('Unstitched', 'Unstitched fabric and suits', 1),
('Pret', 'Ready to wear collection', 2),
('Trousers', 'Pants and trousers', 3),
('Accessories', 'Bags, shoes, jewelry', 4),
('Kids', 'Children clothing', 5);

-- Insert System Settings
INSERT INTO SystemSettings (SettingKey, SettingValue, SettingType, Description) VALUES
('company_name', 'HIT BY HUMA', 'string', 'Company name for receipts'),
('currency_symbol', 'PKR', 'string', 'Currency symbol'),
('currency_code', 'PKR', 'string', 'ISO currency code'),
('tax_rate', '0', 'number', 'Default tax rate percentage'),
('max_discount_without_approval', '10', 'number', 'Maximum discount % without manager approval'),
('cash_variance_threshold', '500', 'number', 'Maximum acceptable cash variance'),
('receipt_footer', 'Thank you for shopping at HIT BY HUMA! Exchange within 7 days with receipt.', 'string', 'Receipt footer text'),
('sms_enabled', 'true', 'boolean', 'Enable SMS notifications'),
('loyalty_points_per_100', '1', 'number', 'Loyalty points earned per 100 PKR');

PRINT 'HIT BY HUMA POS Database Schema Created Successfully!';
GO
