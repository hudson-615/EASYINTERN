ALTER TABLE vagas
    ADD COLUMN latitude DECIMAL(9,6) NULL,
    ADD COLUMN longitude DECIMAL(9,6) NULL,
    ADD CONSTRAINT chk_vagas_coordenadas CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (
            latitude IS NOT NULL
            AND longitude IS NOT NULL
            AND latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
        )
    );

CREATE INDEX idx_vagas_localizacao
    ON vagas (latitude, longitude);
