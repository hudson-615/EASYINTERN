import pytest

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import app
from dashboard import routes


def test_rota_geografica_post():
    rotas = app.openapi()["paths"]
    caminho = "/dashboard/api/candidato/vagas/proximidade"

    assert caminho in rotas
    assert "post" in rotas[caminho]


@pytest.mark.parametrize("campos", [
    {"latitude": 91},
    {"longitude": 181},
    {"raio_km": 0},
    {"raio_km": 201},
    {"pagina": 0},
    {"limite": 101},
    {"latitude": float("nan")},
])
def test_busca_geografica_invalida(campos):
    dados = {
        "latitude": -23.55,
        "longitude": -46.63,
        "raio_km": 20,
    }

    dados.update(campos)

    with pytest.raises(ValidationError):
        routes.BuscaGeograficaVagas(**dados)


def test_busca_geografica_sem_autenticacao():
    with TestClient(app) as cliente:
        resposta = cliente.post(
            "/dashboard/api/candidato/vagas/proximidade",
            json={
                "latitude": -23.55,
                "longitude": -46.63,
                "raio_km": 20,
            }
        )

    assert resposta.status_code in (401, 403)


def test_resposta_geografica_sem_cache(monkeypatch):
    def consulta(**kwargs):
        assert kwargs["com_metadados"] is True
        assert kwargs["latitude"] == -23.55
        assert kwargs["raio_km"] == 20

        return {"items": [], "total": 0}

    monkeypatch.setattr(
        routes,
        "_consultar_vagas_candidato",
        consulta
    )

    dados = routes.BuscaGeograficaVagas(
        latitude=-23.55,
        longitude=-46.63,
        raio_km=20
    )

    resposta = routes.buscar_vagas_proximidade(
        dados,
        token={"sub": "1"}
    )

    assert resposta.status_code == 200
    assert resposta.headers["cache-control"] == "no-store"
