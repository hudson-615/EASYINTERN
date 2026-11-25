import pytest

from dashboard.empresa_routes import normalizar_nivel_vaga


@pytest.mark.parametrize("entrada, esperado", [
    ("Estagi\u00e1rio", "estagiario"),
    ("estagiario", "estagiario"),
    ("ESTAGI\u00c1RIO", "estagiario"),
    ("J\u00fanior", "junior"),
    ("junior", "junior"),
    ("  Junior  ", "junior"),
    (None, ""),
])
def test_normalizar_nivel_vaga(entrada, esperado):
    assert normalizar_nivel_vaga(entrada) == esperado
