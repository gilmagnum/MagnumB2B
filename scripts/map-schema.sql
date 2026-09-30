/* ============================================================
   Hashavshevet (magnum12) schema mapping - READ ONLY
   ------------------------------------------------------------
   Everything here only READS metadata and counts. It does not
   change any data, table, or setting.

   How to run on the server (PowerShell), writing to a file:

     sqlcmd -S localhost,61476 -U sa -d magnum12 -i "F:\Gil-Claude\MagnumB2B\scripts\map-schema.sql" -o "F:\Gil-Claude\MagnumB2B\scripts\schema-out.txt" -W -s "|" -f 65001

   Then send me schema-out.txt (or paste it). The -f 65001 makes
   sqlcmd read this file as UTF-8 so the Hebrew keywords work.
   ============================================================ */

SET NOCOUNT ON;

/* ---------- 1. All tables with row counts (busiest first) ---------- */
PRINT '=== 1. TABLES BY ROW COUNT ===';
SELECT TOP 120
       s.name  AS [schema],
       t.name  AS [table],
       SUM(p.rows) AS [rows]
FROM   sys.tables t
JOIN   sys.schemas s   ON s.schema_id = t.schema_id
JOIN   sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
GROUP  BY s.name, t.name
ORDER  BY SUM(p.rows) DESC;

/* ---------- 2. Columns that look like CUSTOMERS ---------- */
PRINT '';
PRINT '=== 2. CUSTOMER-LIKE COLUMNS ===';
SELECT t.name AS [table], c.name AS [column], ty.name AS [type]
FROM   sys.columns c
JOIN   sys.tables  t ON t.object_id = c.object_id
JOIN   sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE  c.name LIKE '%custom%' OR c.name LIKE '%client%'
   OR  c.name LIKE '%account%' OR c.name LIKE '%agent%'
   OR  c.name LIKE N'%לקוח%'  OR c.name LIKE N'%סוכן%'
   OR  c.name LIKE N'%כרטיס%'
ORDER  BY t.name, c.name;

/* ---------- 3. Columns that look like ITEMS / PRODUCTS ---------- */
PRINT '';
PRINT '=== 3. ITEM/PRODUCT-LIKE COLUMNS ===';
SELECT t.name AS [table], c.name AS [column], ty.name AS [type]
FROM   sys.columns c
JOIN   sys.tables  t ON t.object_id = c.object_id
JOIN   sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE  c.name LIKE '%item%'    OR c.name LIKE '%product%'
   OR  c.name LIKE '%barcode%' OR c.name LIKE '%sku%'
   OR  c.name LIKE '%catalog%' OR c.name LIKE '%makat%'
   OR  c.name LIKE N'%פריט%'  OR c.name LIKE N'%מקט%'
   OR  c.name LIKE N'%ברקוד%' OR c.name LIKE N'%מוצר%'
ORDER  BY t.name, c.name;

/* ---------- 4. Columns that look like PRICES / PRICE LISTS ---------- */
PRINT '';
PRINT '=== 4. PRICE / PRICELIST-LIKE COLUMNS ===';
SELECT t.name AS [table], c.name AS [column], ty.name AS [type]
FROM   sys.columns c
JOIN   sys.tables  t ON t.object_id = c.object_id
JOIN   sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE  c.name LIKE '%price%'    OR c.name LIKE '%mחיר%'
   OR  c.name LIKE '%discount%' OR c.name LIKE '%mחירון%'
   OR  c.name LIKE N'%מחיר%'   OR c.name LIKE N'%מחירון%'
   OR  c.name LIKE N'%הנחה%'
ORDER  BY t.name, c.name;

/* ---------- 5. Columns that look like STOCK / INVENTORY ---------- */
PRINT '';
PRINT '=== 5. STOCK / INVENTORY-LIKE COLUMNS ===';
SELECT t.name AS [table], c.name AS [column], ty.name AS [type]
FROM   sys.columns c
JOIN   sys.tables  t ON t.object_id = c.object_id
JOIN   sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE  c.name LIKE '%stock%'     OR c.name LIKE '%inventory%'
   OR  c.name LIKE '%quantity%'  OR c.name LIKE '%qty%'
   OR  c.name LIKE '%warehouse%' OR c.name LIKE '%balance%'
   OR  c.name LIKE N'%מלאי%'    OR c.name LIKE N'%כמות%'
   OR  c.name LIKE N'%מחסן%'    OR c.name LIKE N'%יתרה%'
ORDER  BY t.name, c.name;

/* ---------- 6. Columns that look like ORDERS / DOCUMENTS ---------- */
PRINT '';
PRINT '=== 6. ORDER / DOCUMENT-LIKE COLUMNS ===';
SELECT t.name AS [table], c.name AS [column], ty.name AS [type]
FROM   sys.columns c
JOIN   sys.tables  t ON t.object_id = c.object_id
JOIN   sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE  c.name LIKE '%order%'    OR c.name LIKE '%doc%'
   OR  c.name LIKE '%invoice%'  OR c.name LIKE '%delivery%'
   OR  c.name LIKE N'%הזמנה%'  OR c.name LIKE N'%מסמך%'
   OR  c.name LIKE N'%תעודה%'  OR c.name LIKE N'%חשבונית%'
   OR  c.name LIKE N'%משלוח%'
ORDER  BY t.name, c.name;

/* ---------- 7. Foreign key relationships (how tables link) ---------- */
PRINT '';
PRINT '=== 7. FOREIGN KEYS ===';
SELECT  fk.name AS fk,
        tp.name AS parent_table, cp.name AS parent_col,
        tr.name AS ref_table,    cr.name AS ref_col
FROM    sys.foreign_keys fk
JOIN    sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN    sys.tables tp ON tp.object_id = fk.parent_object_id
JOIN    sys.columns cp ON cp.object_id = tp.object_id AND cp.column_id = fkc.parent_column_id
JOIN    sys.tables tr ON tr.object_id = fk.referenced_object_id
JOIN    sys.columns cr ON cr.object_id = tr.object_id AND cr.column_id = fkc.referenced_column_id
ORDER   BY tp.name, fk.name;

/* ---------- 8. Full column dump of ALL tables (the master map) ---------- */
PRINT '';
PRINT '=== 8. ALL COLUMNS (table | column | type | nullable) ===';
SELECT  t.name AS [table],
        c.column_id AS [ord],
        c.name AS [column],
        ty.name AS [type],
        c.max_length AS [len],
        c.is_nullable AS [null]
FROM    sys.columns c
JOIN    sys.tables  t ON t.object_id = c.object_id
JOIN    sys.types  ty ON ty.user_type_id = c.user_type_id
ORDER   BY t.name, c.column_id;
