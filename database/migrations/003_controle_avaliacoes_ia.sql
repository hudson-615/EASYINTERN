CREATE TABLE IF NOT EXISTS controle_avaliacoes_ia (
    id_candidatura INT NOT NULL,
    tentativas INT UNSIGNED NOT NULL DEFAULT 0,
    ultima_tentativa DATETIME NULL,
    PRIMARY KEY (id_candidatura),
    CONSTRAINT fk_controle_ia_candidatura
        FOREIGN KEY (id_candidatura)
        REFERENCES candidaturas(id_candidatura)
        ON DELETE CASCADE
) ENGINE=InnoDB;
