"""Testes unitarios M-08 sem gravar no MySQL de verdade."""
import asyncio
from io import BytesIO

import pytest
from pypdf import PdfWriter
from fastapi import HTTPException, UploadFile

from dashboard import curriculo_routes as modulo


class ConexaoFalsa:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        pass


class CursorFalso:
    def __init__(self):
        self.sql = []

    def execute(self, sql, params):
        self.sql.append((sql, params))

    def close(self):
        pass


def setup(monkeypatch, tmp_path, antigo=None):
    conn = ConexaoFalsa()
    cursor = CursorFalso()
    monkeypatch.setattr(modulo, "_perfil", lambda token, **kwargs: (conn, cursor, 123, antigo))
    monkeypatch.setenv("CURRICULOS_DIR", str(tmp_path))
    return conn, cursor



def gerar_pdf(senha=None):
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)

    if senha:
        writer.encrypt(senha)

    writer.write(buffer)
    return buffer.getvalue()


def pdf(conteudo=None, nome="curriculo.pdf", tipo="application/pdf"):
    if conteudo is None:
        conteudo = gerar_pdf()

    return UploadFile(
        file=BytesIO(conteudo),
        filename=nome,
        headers={"content-type": tipo}
    )


def test_upload_pdf_salva_so_uuid_e_atualiza_candidato(monkeypatch, tmp_path):
    conn, cursor = setup(monkeypatch, tmp_path)
    resultado = asyncio.run(modulo.enviar_curriculo(pdf(), {"sub": "42"}))
    assert resultado["arquivo"] == "curriculo.pdf"
    assert conn.commits == 1
    nome = cursor.sql[-1][1][0]
    assert modulo.NOME_ARQUIVO_RE.fullmatch(nome)
    assert (tmp_path / nome).exists()
    assert cursor.sql[-1][1][1] == 123


def test_rejeita_arquivo_nao_pdf(monkeypatch, tmp_path):
    conn, _ = setup(monkeypatch, tmp_path)
    with pytest.raises(HTTPException) as err:
        asyncio.run(modulo.enviar_curriculo(pdf(b"text", nome="foto.png"), {"sub": "42"}))
    assert err.value.status_code == 422
    assert conn.commits == 0


def test_rejeita_pdf_falso(monkeypatch, tmp_path):
    conn, _ = setup(monkeypatch, tmp_path)
    with pytest.raises(HTTPException) as err:
        asyncio.run(modulo.enviar_curriculo(pdf(b"nao sou um pdf"), {"sub": "42"}))
    assert err.value.status_code == 422
    assert conn.commits == 0
    assert list(tmp_path.iterdir()) == []


def test_rejeita_pdf_maior_que_5_mib(monkeypatch, tmp_path):
    conn, _ = setup(monkeypatch, tmp_path)
    dados = b"%PDF-1.4\n" + b"a" * (modulo.MAX_BYTES + 1) + b"%%EOF"
    with pytest.raises(HTTPException) as err:
        asyncio.run(modulo.enviar_curriculo(pdf(dados), {"sub": "42"}))
    assert err.value.status_code == 413
    assert conn.commits == 0
    assert list(tmp_path.iterdir()) == []


def test_nao_aceita_path_arbitrario_do_banco():
    with pytest.raises(HTTPException) as err:
        modulo._nome_salvo("../../.env")
    assert err.value.status_code == 409


def test_download_exige_referencia_e_arquivo_existentes(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with pytest.raises(HTTPException) as err:
        modulo.baixar_curriculo({"sub": "42"})
    assert err.value.status_code == 404


def test_exclusao_limpa_registro_e_arquivo(monkeypatch, tmp_path):
    nome = "a" * 32 + ".pdf"
    (tmp_path / nome).write_bytes(b"%PDF-1.4\n%%EOF")
    conn, cursor = setup(monkeypatch, tmp_path, nome)
    resultado = modulo.excluir_curriculo({"sub": "42"})
    assert conn.commits == 1
    assert "sucesso" in resultado["mensagem"]
    assert cursor.sql[-1][1] == (123,)
    assert not (tmp_path / nome).exists()


def test_rejeita_pdf_com_estrutura_invalida(monkeypatch, tmp_path):
    conn, _ = setup(monkeypatch, tmp_path)

    dados = b"%PDF-1.4\\nconteudo falso\\n%%EOF"

    with pytest.raises(HTTPException) as erro:
        asyncio.run(modulo.enviar_curriculo(
            pdf(dados), {"sub": "42"}
        ))

    assert erro.value.status_code == 422
    assert conn.commits == 0
    assert list(tmp_path.iterdir()) == []


def test_rejeita_pdf_protegido_por_senha(monkeypatch, tmp_path):
    conn, _ = setup(monkeypatch, tmp_path)

    with pytest.raises(HTTPException) as erro:
        asyncio.run(modulo.enviar_curriculo(
            pdf(gerar_pdf("SenhaTeste123")), {"sub": "42"}
        ))

    assert erro.value.status_code == 422
    assert conn.commits == 0
    assert list(tmp_path.iterdir()) == []


def test_rejeita_pdf_sem_paginas(monkeypatch, tmp_path):
    conn, _ = setup(monkeypatch, tmp_path)

    buffer = BytesIO()
    writer = PdfWriter()
    writer.write(buffer)

    with pytest.raises(HTTPException) as erro:
        asyncio.run(modulo.enviar_curriculo(
            pdf(buffer.getvalue()), {"sub": "42"}
        ))

    assert erro.value.status_code == 422
    assert conn.commits == 0


def test_substituicao_preserva_curriculo_em_upload_invalido(
    monkeypatch, tmp_path
):
    nome = "a" * 32 + ".pdf"
    antigo = tmp_path / nome
    antigo.write_bytes(gerar_pdf())

    conn, _ = setup(monkeypatch, tmp_path, nome)

    with pytest.raises(HTTPException):
        asyncio.run(modulo.enviar_curriculo(
            pdf(b"arquivo invalido"), {"sub": "42"}
        ))

    assert antigo.exists()
    assert conn.commits == 0
    assert len(list(tmp_path.iterdir())) == 1


def test_substituicao_remove_curriculo_anterior(monkeypatch, tmp_path):
    nome = "b" * 32 + ".pdf"
    antigo = tmp_path / nome
    antigo.write_bytes(gerar_pdf())

    conn, cursor = setup(monkeypatch, tmp_path, nome)

    asyncio.run(modulo.enviar_curriculo(
        pdf(), {"sub": "42"}
    ))

    novo_nome = cursor.sql[-1][1][0]

    assert not antigo.exists()
    assert (tmp_path / novo_nome).exists()
    assert conn.commits == 1
