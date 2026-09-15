-- Veloria PoS — Migration 0002: performance indexes (mandatory per 07 spec).

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(selling_price_minor);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON product_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_barcodes_product ON product_barcodes(product_id);

CREATE INDEX IF NOT EXISTS idx_customers_search ON customers(search_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_balance ON customers(outstanding_balance_minor);

CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer_created ON sales(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_customer_date ON sale_payments(customer_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_intakes_supplier_date ON stock_intakes(supplier_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_returns_original_sale ON returns(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_date ON supplier_payments(supplier_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_bread_customer_pickup ON bread_orders(customer_id, pickup_date);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_operation ON sales(operation_id);
