import logging
import time

from ia.servico_avaliacao import (
    ia_automatica_ativa,
    recuperar_avaliacoes_pendentes,
)

INTERVALO_SEGUNDOS = 60

logger = logging.getLogger(__name__)


def executar_ciclo() -> int:
    return recuperar_avaliacoes_pendentes(limite=20)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s"
    )

    if not ia_automatica_ativa():
        logger.warning("IA automatica desativada.")
        return 0

    logger.info("Worker de avaliacoes iniciado.")

    try:
        while ia_automatica_ativa():
            try:
                concluidas = executar_ciclo()

                logger.info(
                    "Ciclo concluido: %s avaliacoes gravadas.",
                    concluidas
                )

            except Exception:
                logger.error("Falha no ciclo de avaliacoes.")

            time.sleep(INTERVALO_SEGUNDOS)

    except KeyboardInterrupt:
        logger.info("Worker encerrado.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
