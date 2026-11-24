import pytest

from fastapi import HTTPException

from dashboard.geolocalizacao import (
    validar_uf,
    validar_coordenadas,
    validar_raio,
    distancia_km,
)


@pytest.mark.parametrize("entrada,esperado", [
    ("SP", "SP"),
    ("sp", "SP"),
    (" rj ", "RJ"),
    ("DF", "DF"),
    (None, None),
])
def test_uf_valida(entrada, esperado):
    assert validar_uf(entrada) == esperado


@pytest.mark.parametrize("uf", [
    "ZZ", "XX", "S", "ABC", "12", ""
])
def test_uf_invalida(uf):
    with pytest.raises(HTTPException) as erro:
        validar_uf(uf)

    assert erro.value.status_code == 422


@pytest.mark.parametrize("lat,lon", [
    (-23.5505, -46.6333),
    (0, 0),
    (90, 180),
    (-90, -180),
    (None, None),
])
def test_coordenadas_validas(lat, lon):
    validar_coordenadas(lat, lon)


@pytest.mark.parametrize("lat,lon", [
    (91, 0),
    (-91, 0),
    (0, 181),
    (0, -181),
    (None, 10),
    (10, None),
    (float("nan"), 0),
    (0, float("inf")),
])
def test_coordenadas_invalidas(lat, lon):
    with pytest.raises(HTTPException) as erro:
        validar_coordenadas(lat, lon)

    assert erro.value.status_code == 422


@pytest.mark.parametrize("raio", [1, 5, 10, 20, 50, 100, 200])
def test_raio_valido(raio):
    validar_raio(raio)


@pytest.mark.parametrize("raio", [
    -1, 0, 201, float("nan"), float("inf")
])
def test_raio_invalido(raio):
    with pytest.raises(HTTPException):
        validar_raio(raio)


def test_distancia_mesmo_local():
    assert distancia_km(
        -23.5505, -46.6333,
        -23.5505, -46.6333
    ) == pytest.approx(0)


def test_distancia_sao_paulo_rio():
    distancia = distancia_km(
        -23.5505, -46.6333,
        -22.9068, -43.1729
    )

    assert 350 < distancia < 370


def test_distancia_simetrica():
    ida = distancia_km(-23.5, -46.6, -22.9, -43.2)
    volta = distancia_km(-22.9, -43.2, -23.5, -46.6)

    assert ida == pytest.approx(volta)


def test_distancia_antimeridiano():
    assert distancia_km(
        0, 179, 0, -179
    ) == pytest.approx(222.39, abs=0.1)
