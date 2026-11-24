CREATE TABLE IF NOT EXISTS feedbacks_candidatura (
    id_candidatura INT NOT NULL,
    mensagem VARCHAR(2000) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id_candidatura),

    CONSTRAINT fk_feedback_candidatura
        FOREIGN KEY (id_candidatura)
        REFERENCES candidaturas (id_candidatura)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
