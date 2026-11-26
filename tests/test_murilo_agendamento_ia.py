from unittest.mock import MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException

from dashboard.routes import (
    NovaCandidatura,
    candidatar_a_vaga,
    processar_avaliacao,
)


def preparar_candidatura(existente=None):
    conn = MagicMock()
    cursor = conn.cursor.return_value
    cursor.lastrowid = 99

    cursor.fetchone.side_effect = [
        {
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None,
        },
        {"id_candidato": 6},
        {
            "id_vaga": 9,
            "titulo": "Estagio Python",
            "status": "Aberta",
            "prazo_encerramento": None,
        },
        {"disponivel": 1},
        existente,
    ]

    return conn


def test_agenda_ia_apos_candidatura():
    conn = preparar_candidatura()
    tarefas = MagicMock(spec=BackgroundTasks)

    def agendar(funcao, id_candidatura):
        conn.commit.assert_called_once()
        assert funcao is processar_avaliacao
        assert id_candidatura == 99

    tarefas.add_task.side_effect = agendar

    with patch("dashboard.routes.conectar", return_value=conn):
        resultado = candidatar_a_vaga(
            dados=NovaCandidatura(id_vaga=9),
            background_tasks=tarefas,
            token={"sub": "17"},
        )

    assert resultado["id_candidatura"] == 99
    tarefas.add_task.assert_called_once()


def test_candidatura_duplicada_nao_agenda_ia():
    conn = preparar_candidatura({"id_candidatura": 10})
    tarefas = BackgroundTasks()

    with patch("dashboard.routes.conectar", return_value=conn):
        with pytest.raises(HTTPException) as erro:
            candidatar_a_vaga(
                dados=NovaCandidatura(id_vaga=9),
                background_tasks=tarefas,
                token={"sub": "17"},
            )

    assert erro.value.status_code == 409
    assert len(tarefas.tasks) == 0
    conn.commit.assert_not_called()
