"""Curriculo privado do candidato (PDF, ate 5 MiB).

POST   /dashboard/api/candidato/curriculo  (multipart/form-data: arquivo)
GET    /dashboard/api/candidato/curriculo  (metadados)
GET    /dashboard/api/candidato/curriculo/arquivo
DELETE /dashboard/api/candidato/curriculo
"""
import os
import re
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from mysql.connector import Error
from pypdf import PdfReader

from database.connection import conectar
from dashboard.formacoes_routes import _candidato_autorizado, _id_usuario
from usuarios.routes import obter_usuario_autenticado

router = APIRouter(prefix="/dashboard/api", tags=["Curriculo do candidato"])
MAX_BYTES = 5 * 1024 * 1024
NOME_ARQUIVO_RE = re.compile(r"^[0-9a-f]{32}\.pdf$")


def _diretorio() -> Path:
    # Fora de /static: somente uma rota autenticada pode disponibilizar o PDF.
    raiz = Path(__file__).resolve().parent.parent
    return Path(os.getenv("CURRICULOS_DIR", str(raiz / "uploads_privados" / "curriculos"))).resolve()



def _validar_pdf(caminho: Path):
    try:
        with caminho.open("rb") as arquivo:
            leitor = PdfReader(arquivo, strict=True)

            if leitor.is_encrypted:
                raise HTTPException(
                    422, "Envie um PDF sem protecao por senha."
                )

            if len(leitor.pages) == 0:
                raise HTTPException(
                    422, "O PDF precisa possuir pelo menos uma pagina."
                )

            if len(leitor.pages) > 100:
                raise HTTPException(
                    422, "O curriculo excede o limite de paginas."
                )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            422, "Estrutura do arquivo PDF invalida."
        ) from exc


def _nome_salvo(valor: str | None) -> str | None:
    if not valor:
        return None
    # Nao aceitar paths arbitrarios salvos no banco.
    if not NOME_ARQUIVO_RE.fullmatch(valor):
        raise HTTPException(409, "Caminho de curriculo antigo/invalido. Necessita migracao.")
    return valor


def _perfil(token: dict, *, bloquear=False):
    _id_usuario(token)
    conexao = conectar()
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        id_candidato = _candidato_autorizado(cursor, token)
        consulta = "SELECT url_curriculo FROM candidatos WHERE id_candidato = %s"

        if bloquear:
            consulta += " FOR UPDATE"

        cursor.execute(consulta, (id_candidato,))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(404, "Perfil de candidato nao encontrado.")
        return conexao, cursor, id_candidato, row["url_curriculo"]
    except BaseException:
        if cursor is not None:
            cursor.close()
        conexao.close()
        raise


def _fechar(conexao, cursor):
    if cursor is not None:
        cursor.close()
    if conexao is not None:
        conexao.close()


@router.get("/candidato/curriculo")
def consultar_curriculo(token: dict = Depends(obter_usuario_autenticado)):
    conexao = cursor = None
    try:
        conexao, cursor, _, nome = _perfil(token)
        return {"enviado": bool(nome), "arquivo": "curriculo.pdf" if nome else None}
    except (Error, RuntimeError) as exc:
        raise HTTPException(503, "Erro ao consultar curriculo.") from exc
    finally:
        _fechar(conexao, cursor)


@router.get("/candidato/curriculo/arquivo")
def baixar_curriculo(token: dict = Depends(obter_usuario_autenticado)):
    conexao = cursor = None
    try:
        conexao, cursor, _, valor = _perfil(token)
        nome = _nome_salvo(valor)
        if not nome:
            raise HTTPException(404, "Curriculo nao enviado.")
        caminho = _diretorio() / nome
        if not caminho.is_file():
            raise HTTPException(404, "Arquivo do curriculo nao encontrado.")
        return FileResponse(
            caminho, media_type="application/pdf", filename="curriculo.pdf",
            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
        )
    except (Error, RuntimeError) as exc:
        raise HTTPException(503, "Erro ao consultar curriculo.") from exc
    finally:
        _fechar(conexao, cursor)


@router.post("/candidato/curriculo")
async def enviar_curriculo(
    arquivo: UploadFile = File(...),
    token: dict = Depends(obter_usuario_autenticado),
):
    if not arquivo.filename or not arquivo.filename.lower().endswith(".pdf"):
        raise HTTPException(422, "Envie um arquivo com extensao .pdf.")
    if arquivo.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(422, "O tipo de arquivo deve ser PDF.")

    conexao = cursor = None
    novo = None
    temporario = None
    try:
        # Autoriza antes de gravar qualquer arquivo.
        conexao, cursor, id_candidato, antigo = _perfil(token, bloquear=True)
        _nome_salvo(antigo)  # evita sobrescrever uma referencia antiga ambigua
        diretorio = _diretorio()
        diretorio.mkdir(parents=True, exist_ok=True)
        novo = diretorio / (uuid4().hex + ".pdf")
        total = 0
        cabecalho = b""
        cauda = b""
        # Arquivo temporario no mesmo diretorio para substituir atomicamente.
        with tempfile.NamedTemporaryFile(dir=diretorio, prefix=".upload-", delete=False) as temp:
            temporario = Path(temp.name)
            try:
                while True:
                    bloco = await arquivo.read(65536)
                    if not bloco:
                        break
                    total += len(bloco)
                    if total > MAX_BYTES:
                        raise HTTPException(413, "Curriculo deve ter no maximo 5 MiB.")
                    if len(cabecalho) < 5:
                        cabecalho = (cabecalho + bloco)[:5]
                    cauda = (cauda + bloco)[-2048:]
                    temp.write(bloco)
            except BaseException:
                # No Windows o arquivo precisa ser fechado antes de ser removido.
                # A limpeza ocorre no tratador externo, apos sair do with.
                raise
        if total < 8 or cabecalho != b"%PDF-" or b"%%EOF" not in cauda:
            temporario.unlink(missing_ok=True)
            raise HTTPException(422, "Arquivo PDF invalido.")
        _validar_pdf(temporario)

        os.replace(temporario, novo)
        cursor.execute(
            "UPDATE candidatos SET url_curriculo = %s WHERE id_candidato = %s",
            (novo.name, id_candidato),
        )
        conexao.commit()
        if antigo:
            try:
                (_diretorio() / antigo).unlink(missing_ok=True)
            except OSError:
                pass  # upload novo ja foi confirmado no banco; limpar arquivo antigo depois
        return {"mensagem": "Curriculo enviado com sucesso.", "arquivo": "curriculo.pdf"}
    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        if temporario is not None:
            temporario.unlink(missing_ok=True)
        if novo is not None:
            novo.unlink(missing_ok=True)
        raise
    except (Error, OSError, RuntimeError) as exc:
        if conexao is not None:
            conexao.rollback()
        if temporario is not None:
            temporario.unlink(missing_ok=True)
        if novo is not None:
            novo.unlink(missing_ok=True)
        raise HTTPException(503, "Nao foi possivel salvar o curriculo.") from exc
    finally:
        await arquivo.close()
        _fechar(conexao, cursor)


@router.delete("/candidato/curriculo")
def excluir_curriculo(token: dict = Depends(obter_usuario_autenticado)):
    conexao = cursor = None
    try:
        conexao, cursor, id_candidato, antigo = _perfil(token, bloquear=True)
        nome = _nome_salvo(antigo)
        if not nome:
            raise HTTPException(404, "Curriculo nao enviado.")
        cursor.execute("UPDATE candidatos SET url_curriculo = NULL WHERE id_candidato = %s", (id_candidato,))
        conexao.commit()
        try:
            (_diretorio() / nome).unlink(missing_ok=True)
        except OSError:
            pass  # registro ja removido do banco; arquivo residual deve ser limpo depois
        return {"mensagem": "Curriculo excluido com sucesso."}
    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise
    except (Error, OSError, RuntimeError) as exc:
        if conexao is not None:
            conexao.rollback()
        raise HTTPException(503, "Nao foi possivel excluir curriculo.") from exc
    finally:
        _fechar(conexao, cursor)


@router.get("/empresa/candidaturas/{id_candidatura}/curriculo")
def baixar_curriculo_empresa(
    id_candidatura: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    if id_candidatura <= 0:
        raise HTTPException(422, "Candidatura invalida.")

    conexao = cursor = None

    try:
        id_usuario = _id_usuario(token)

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT tipo_usuario, ativo, deletado_em
            FROM usuarios
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        usuario = cursor.fetchone()

        if (
            not usuario
            or not usuario["ativo"]
            or usuario["deletado_em"] is not None
        ):
            raise HTTPException(401, "Conta indisponivel.")

        if usuario["tipo_usuario"] != "Empresa":
            raise HTTPException(403, "Acesso exclusivo para empresas.")

        cursor.execute(
            """
            SELECT c.url_curriculo
            FROM candidaturas AS ca
            JOIN candidatos AS c
                ON c.id_candidato = ca.id_candidato
            JOIN usuarios AS u
                ON u.id_usuario = c.id_usuario
            JOIN vagas AS v
                ON v.id_vaga = ca.id_vaga
            JOIN empresas AS e
                ON e.id_empresa = v.id_empresa
            WHERE ca.id_candidatura = %s
              AND e.id_usuario = %s
              AND u.ativo = 1
              AND u.deletado_em IS NULL
            """,
            (id_candidatura, id_usuario)
        )

        registro = cursor.fetchone()

        if not registro:
            raise HTTPException(404, "Candidatura nao encontrada.")

        nome = _nome_salvo(registro["url_curriculo"])

        if not nome:
            raise HTTPException(404, "Curriculo nao enviado.")

        caminho = _diretorio() / nome

        if caminho.is_symlink() or not caminho.is_file():
            raise HTTPException(404, "Arquivo nao encontrado.")

        return FileResponse(
            caminho,
            media_type="application/pdf",
            filename="curriculo.pdf",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff"
            }
        )

    except (Error, RuntimeError, OSError) as exc:
        raise HTTPException(
            503, "Nao foi possivel consultar o curriculo."
        ) from exc

    finally:
        _fechar(conexao, cursor)
