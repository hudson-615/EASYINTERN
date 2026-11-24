from unittest.mock import patch

from ia.worker_avaliacao import executar_ciclo, main


def test_worker_processa_pendencias():
    with patch(
        "ia.worker_avaliacao.recuperar_avaliacoes_pendentes",
        return_value=3
    ) as recuperar:

        assert executar_ciclo() == 3
        recuperar.assert_called_once_with(limite=20)


def test_worker_desativado(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "false")

    with patch("ia.worker_avaliacao.executar_ciclo") as ciclo:
        assert main() == 0
        ciclo.assert_not_called()


def test_worker_executa_ciclo_e_encerra(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")

    with patch(
        "ia.worker_avaliacao.executar_ciclo",
        return_value=2
    ) as ciclo:

        with patch(
            "ia.worker_avaliacao.time.sleep",
            side_effect=KeyboardInterrupt
        ):
            assert main() == 0
            ciclo.assert_called_once()


def test_worker_sobrevive_falha(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")

    with patch(
        "ia.worker_avaliacao.executar_ciclo",
        side_effect=RuntimeError("Falha temporaria")
    ) as ciclo:

        with patch(
            "ia.worker_avaliacao.time.sleep",
            side_effect=KeyboardInterrupt
        ):
            assert main() == 0
            ciclo.assert_called_once()
