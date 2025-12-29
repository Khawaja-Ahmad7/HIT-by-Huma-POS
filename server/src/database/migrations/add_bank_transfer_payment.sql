-- Add Bank Transfer payment method
INSERT INTO payment_methods (method_name, method_type, is_active, sort_order) 
VALUES ('Bank Transfer', 'BANK_TRANSFER', TRUE, 7)
ON CONFLICT (method_name) DO NOTHING;
