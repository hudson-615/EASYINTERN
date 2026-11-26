UPDATE vagas
SET nivel = CONCAT('Estagi', CONVERT(0xC3A1 USING utf8mb4), 'rio')
WHERE LOWER(TRIM(nivel)) = 'estagiario';

UPDATE vagas
SET nivel = CONCAT('J', CONVERT(0xC3BA USING utf8mb4), 'nior')
WHERE LOWER(TRIM(nivel)) = 'junior';
