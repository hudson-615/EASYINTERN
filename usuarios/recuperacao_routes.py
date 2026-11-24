"""Recuperação de senha do EasyIntern, usando as colunas já existentes em usuarios."""
import hashlib
import logging
import os
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from mysql.connector import Error
from pydantic import BaseModel, EmailStr, Field, field_validator

from database.connection import conectar
from usuarios.routes import password_hash

router = APIRouter(prefix="/api/auth", tags=["Recuperação de senha"])
LOG = logging.getLogger(__name__)
MINUTOS_VALIDADE = 20
RESPOSTA_GENERICA = "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação."


class PedidoRecuperacao(BaseModel):
    email: EmailStr


class NovaSenha(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    nova_senha: str = Field(min_length=8, max_length=128)

    @field_validator("nova_senha")
    @classmethod
    def senha_forte(cls, valor: str) -> str:
        import re
        if not re.search(r"[A-Z]", valor) or not re.search(r"\d", valor):
            raise ValueError("A senha precisa de uma letra maiúscula e um número.")
        return valor


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _config_email():
    valores = {k: os.getenv(k, "").strip() for k in (
        "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "PUBLIC_BASE_URL")}
    if any(not valor for valor in valores.values()):
        raise HTTPException(status_code=503, detail="Recuperação por e-mail não configurada.")
    try:
        porta = int(valores["SMTP_PORT"])
    except ValueError:
        raise HTTPException(status_code=503, detail="Configuração de e-mail inválida.")
    if not (1 <= porta <= 65535):
        raise HTTPException(status_code=503, detail="Configuração de e-mail inválida.")
    base = valores["PUBLIC_BASE_URL"].rstrip("/")
    if not (base.startswith("https://") or base.startswith("http://localhost") or base.startswith("http://127.0.0.1")):
        raise HTTPException(status_code=503, detail="URL pública de recuperação inválida.")
    return valores, porta, base


def _enviar_email(destinatario: str, token: str, config, porta: int, base: str):
    link = f"{base}/auth?{urlencode({'modo': 'redefinir', 'token': token})}"
    mensagem = EmailMessage()
    mensagem["From"] = config["SMTP_FROM"]
    mensagem["To"] = destinatario
    mensagem["Subject"] = "EasyIntern — redefinição de senha"
    mensagem.set_content(
        "Recebemos uma solicitação de redefinição de senha.\n"
        f"Abra este link em até {MINUTOS_VALIDADE} minutos: {link}\n"
        "Se você não solicitou a alteração, ignore este e-mail.\n"
    )
    context = ssl.create_default_context()
    if porta == 465:
        with smtplib.SMTP_SSL(config["SMTP_HOST"], porta, timeout=10, context=context) as smtp:
            smtp.login(config["SMTP_USER"], config["SMTP_PASSWORD"])
            smtp.send_message(mensagem)
    else:
        with smtplib.SMTP(config["SMTP_HOST"], porta, timeout=10) as smtp:
            smtp.starttls(context=context)
            smtp.login(config["SMTP_USER"], config["SMTP_PASSWORD"])
            smtp.send_message(mensagem)


@router.post("/recuperar-senha")
def recuperar_senha(dados: PedidoRecuperacao):
    config, porta, base = _config_email()
    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor()
        cursor.execute(
            "SELECT id_usuario FROM usuarios WHERE email = %s AND ativo = 1 AND deletado_em IS NULL",
            (str(dados.email).lower(),),
        )
        usuario = cursor.fetchone()
        if usuario:
            token = secrets.token_urlsafe(32)
            expira = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=MINUTOS_VALIDADE)
            cursor.execute(
                "UPDATE usuarios SET token_recuperacao = %s, token_recuperacao_expira = %s WHERE id_usuario = %s",
                (_hash_token(token), expira, usuario[0]),
            )
            conexao.commit()
            try:
                _enviar_email(str(dados.email).lower(), token, config, porta, base)
            except (OSError, smtplib.SMTPException) as exc:
                LOG.warning("Falha ao enviar recuperação por e-mail: %s", type(exc).__name__)
                cursor.execute(
                    "UPDATE usuarios SET token_recuperacao = NULL, token_recuperacao_expira = NULL "
                    "WHERE id_usuario = %s AND token_recuperacao = %s",
                    (usuario[0], _hash_token(token)),
                )
                conexao.commit()
        return {"mensagem": RESPOSTA_GENERICA}
    except HTTPException:
        raise
    except Error:
        if conexao:
            conexao.rollback()
        LOG.exception("Falha no banco ao solicitar recuperação")
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()


@router.get("/validar-token/{token}")
def validar_token_recuperacao(token: str):
    if not (32 <= len(token) <= 256):
        return {"valido": False}
    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor()
        cursor.execute(
            "SELECT id_usuario FROM usuarios WHERE token_recuperacao = %s "
            "AND token_recuperacao_expira > UTC_TIMESTAMP() AND ativo = 1 AND deletado_em IS NULL",
            (_hash_token(token),),
        )
        return {"valido": cursor.fetchone() is not None}
    except Error:
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()


@router.post("/redefinir-senha")
def redefinir_senha(dados: NovaSenha):
    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor()
        # A comparação e a invalidação ocorrem na mesma transação.
        cursor.execute(
            "SELECT id_usuario FROM usuarios WHERE token_recuperacao = %s "
            "AND token_recuperacao_expira > UTC_TIMESTAMP() AND ativo = 1 AND deletado_em IS NULL FOR UPDATE",
            (_hash_token(dados.token),),
        )
        usuario = cursor.fetchone()
        if not usuario:
            raise HTTPException(status_code=400, detail="Link inválido ou expirado.")
        novo_hash = password_hash.hash(dados.nova_senha)
        cursor.execute(
            "UPDATE usuarios SET senha_hash = %s, token_recuperacao = NULL, "
            "token_recuperacao_expira = NULL, tentativas_login = 0, bloqueado_ate = NULL "
            "WHERE id_usuario = %s AND token_recuperacao = %s",
            (novo_hash, usuario[0], _hash_token(dados.token)),
        )
        if cursor.rowcount != 1:
            raise HTTPException(status_code=400, detail="Link inválido ou expirado.")
        conexao.commit()
        return {"mensagem": "Senha redefinida com sucesso. Faça login novamente."}
    except HTTPException:
        if conexao:
            conexao.rollback()
        raise
    except Error:
        if conexao:
            conexao.rollback()
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()
