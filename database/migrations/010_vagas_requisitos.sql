-- EasyIntern 2.0
-- Adiciona requisitos na tabela vagas.
-- Corrige erro 503 causado pela ausencia da coluna.
-- Seguro para executar novamente no MySQL 8.

USE eazyintern;

SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE vagas ADD COLUMN requisitos TEXT NULL',
        'SELECT ''Coluna requisitos ja existe'' AS mensagem'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vagas'
      AND COLUMN_NAME = 'requisitos'
);

PREPARE migracao FROM @sql;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;
