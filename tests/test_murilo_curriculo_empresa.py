from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.responses import FileResponse

from dashboard.curriculo_routes import baixar_curriculo_empresa


EMPRESA = {
    "tipo_usuario": "Empresa",
    "ativo": 1,
    "deletado_em": None
}

TOKEN = {"sub": "42"}


def preparar(usuario, registro):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.side_effect = [usuario, registro]
    return conexao, cursor


def test_empresa_autorizada_baixa_curriculo(tmp_path, monkeypatch):
    nome = "a" * 32 + ".pdf"
    (tmp_path / nome).write_bytes(b"%PDF-1.4")

    monkeypatch.setenv("CURRICULOS_DIR", str(tmp_path))

    conexao, cursor = preparar(
        EMPRESA, {"url_curriculo": nome}
    )

    with patch("dashboard.curriculo_routes.conectar", return_value=conexao):
        resposta = baixar_curriculo_empresa(15, TOKEN)

    assert isinstance(resposta, FileResponse)
    assert resposta.filename == "curriculo.pdf"
    assert resposta.headers["cache-control"] == "private, no-store"

    sql, parametros = cursor.execute.call_args.args

    assert "e.id_usuario = %s" in sql
    assert parametros == (15, 42)


@pytest.mark.parametrize("usuario,registro,status", [
    (None, None, 401),
    ({**EMPRESA, "ativo": 0}, None, 401),
    ({**EMPRESA, "deletado_em": "2026-11-01"}, None, 401),
    ({**EMPRESA, "tipo_usuario": "Candidato"}, None, 403),
    (EMPRESA, None, 404),
    (EMPRESA, {"url_curriculo": None}, 404),
    (EMPRESA, {"url_curriculo": "../../.env"}, 409),
])
def test_acessos_invalidos(usuario, registro, status):
    conexao, _ = preparar(usuario, registro)

    with patch("dashboard.curriculo_routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            baixar_curriculo_empresa(15, TOKEN)

    assert erro.value.status_code == status
    conexao.close.assert_called_once()


def test_curriculo_ausente_no_disco(tmp_path, monkeypatch):
    monkeypatch.setenv("CURRICULOS_DIR", str(tmp_path))

    conexao, _ = preparar(
        EMPRESA, {"url_curriculo": "b" * 32 + ".pdf"}
    )

    with patch("dashboard.curriculo_routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            baixar_curriculo_empresa(15, TOKEN)

    assert erro.value.status_code == 404


def test_id_candidatura_invalido():
    with patch("dashboard.curriculo_routes.conectar") as conectar:
        with pytest.raises(HTTPException) as erro:
            baixar_curriculo_empresa(0, TOKEN)

    assert erro.value.status_code == 422
    conectar.assert_not_called()


def test_banco_indisponivel():
    with patch("dashboard.curriculo_routes.conectar", side_effect=RuntimeError):
        with pytest.raises(HTTPException) as erro:
            baixar_curriculo_empresa(15, TOKEN)

    assert erro.value.status_code == 503
