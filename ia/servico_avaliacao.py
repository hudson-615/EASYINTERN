import logging
import os
from contextlib import closing

from database.connection import conectar
from ia.ia_eazyintern import (
    avaliar_candidatura,
    salvar_avaliacao_no_banco,
)

logger = logging.getLogger(__name__)


def ia_automatica_ativa() -> bool:
    return os.getenv(
        "IA_AUTOMATICA", "false"
    ).strip().lower() == "true"


def processar_avaliacao(id_candidatura: int) -> bool:
    """Avalia sem alterar o status seletivo."""

    if not ia_automatica_ativa():
        return False

    chave = "easyintern:avaliacao:global"

    try:
        with closing(conectar()) as conn:
            with closing(conn.cursor(dictionary=True)) as cursor:
                cursor.execute(
                    "SELECT GET_LOCK(%s, 0) AS adquirido",
                    (chave,)
                )

                bloqueio = cursor.fetchone()

                if not bloqueio or bloqueio["adquirido"] != 1:
                    return False

                try:
                    cursor.execute(
                        """
                        SELECT id_avaliacao
                        FROM avaliacoes_ia
                        WHERE id_candidatura = %s
                        """,
                        (id_candidatura,)
                    )

                    if cursor.fetchone():
                        return False

                    cursor.execute(
                        '''
                        INSERT INTO controle_avaliacoes_ia
                            (id_candidatura, tentativas)
                        VALUES (%s, 0)
                        ON DUPLICATE KEY UPDATE
                            id_candidatura = id_candidatura
                        ''',
                        (id_candidatura,)
                    )

                    cursor.execute(
                        '''
                        UPDATE controle_avaliacoes_ia
                        SET tentativas = tentativas + 1,
                            ultima_tentativa = UTC_TIMESTAMP()
                        WHERE id_candidatura = %s
                          AND EXISTS (
                              SELECT 1
                              FROM candidaturas AS c
                              JOIN vaga_tags AS vt
                                ON vt.id_vaga = c.id_vaga
                              WHERE c.id_candidatura =
                                    controle_avaliacoes_ia.id_candidatura
                          )
                          AND tentativas < 3
                          AND (
                              ultima_tentativa IS NULL
                              OR ultima_tentativa <= DATE_SUB(
                                  UTC_TIMESTAMP(), INTERVAL 5 MINUTE
                              )
                          )
                        ''',
                        (id_candidatura,)
                    )

                    if cursor.rowcount != 1:
                        conn.rollback()
                        return False

                    conn.commit()

                    avaliacao = avaliar_candidatura(
                        id_candidatura
                    )

                    salvar_avaliacao_no_banco(
                        id_candidatura,
                        avaliacao
                    )

                    logger.info(
                        "Avaliacao concluida: candidatura %s",
                        id_candidatura
                    )

                    return True

                finally:
                    cursor.execute(
                        "SELECT RELEASE_LOCK(%s) AS liberado",
                        (chave,)
                    )
                    cursor.fetchone()

    except Exception:
        logger.error(
            "Falha na avaliacao da candidatura %s",
            id_candidatura
        )
        return False



def listar_candidaturas_para_ia(*, pendentes=True, limite=20):
    if not 1 <= limite <= 1000:
        raise ValueError("Limite invalido.")

    with closing(conectar()) as conn:
        with closing(conn.cursor(dictionary=True)) as cursor:
            cursor.execute(
                """
                SELECT c.id_candidatura
                FROM candidaturas c
                LEFT JOIN avaliacoes_ia a
                    ON a.id_candidatura = c.id_candidatura
                LEFT JOIN controle_avaliacoes_ia ct
                    ON ct.id_candidatura = c.id_candidatura
                WHERE a.id_avaliacao IS NULL
                  AND EXISTS (
                      SELECT 1
                      FROM vaga_tags AS vt
                      WHERE vt.id_vaga = c.id_vaga
                  )
                  AND COALESCE(ct.tentativas, 0) < 3
                  AND (
                      ct.ultima_tentativa IS NULL
                      OR ct.ultima_tentativa <= DATE_SUB(
                          UTC_TIMESTAMP(), INTERVAL 5 MINUTE
                      )
                  )
                ORDER BY c.id_candidatura
                LIMIT %s
                """,
                (limite,)
            )
            return cursor.fetchall()


def recuperar_avaliacoes_pendentes(
    limite: int = 20
) -> int:

    if not ia_automatica_ativa():
        return 0

    try:
        candidaturas = listar_candidaturas_para_ia(
            pendentes=True,
            limite=limite
        )

        concluidas = 0

        for candidatura in candidaturas:
            if processar_avaliacao(
                candidatura["id_candidatura"]
            ):
                concluidas += 1

        return concluidas

    except Exception:
        logger.error(
            "Falha ao recuperar avaliacoes pendentes"
        )
        return 0
