ALTER TABLE vagas
ADD COLUMN requisitos TEXT NULL AFTER descricao;

UPDATE vagas
SET
    requisitos = SUBSTRING_INDEX(
        descricao,
        CONCAT(CHAR(10), CHAR(10), 'Requisitos / Habilidades:', CHAR(10)),
        -1
    ),
    descricao = LEFT(
        descricao,
        CHAR_LENGTH(descricao) -
        CHAR_LENGTH(requisitos) -
        CHAR_LENGTH(CONCAT(CHAR(10), CHAR(10), 'Requisitos / Habilidades:', CHAR(10)))
    )
WHERE LOCATE(
    CONCAT(CHAR(10), CHAR(10), 'Requisitos / Habilidades:', CHAR(10)),
    descricao
) > 0;
