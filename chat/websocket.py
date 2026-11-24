import asyncio
from urllib.parse import urlsplit

from fastapi import (
    APIRouter,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.security import HTTPAuthorizationCredentials
from starlette.concurrency import run_in_threadpool

from usuarios.routes import obter_usuario_autenticado
from chat.routes import listar_notificacoes


router = APIRouter(prefix="/api/chat")


def origem_permitida(websocket):
    origem = websocket.headers.get("origin")

    if origem is None:
        return True

    try:
        url = urlsplit(origem)

        return (
            url.scheme in ("http", "https")
            and url.netloc.lower()
            == websocket.headers.get("host", "").lower()
        )

    except ValueError:
        return False


async def autenticar(token):
    credenciais = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token
    )

    return await run_in_threadpool(
        obter_usuario_autenticado,
        credenciais
    )


@router.websocket("/ws")
async def websocket_chat(websocket: WebSocket):
    if not origem_permitida(websocket):
        await websocket.close(code=1008)
        return

    await websocket.accept()

    try:
        dados = await asyncio.wait_for(
            websocket.receive_json(),
            timeout=5
        )

        if not isinstance(dados, dict):
            await websocket.close(code=1008)
            return

        token = dados.get("token")

        if (
            not isinstance(token, str)
            or not token
            or len(token) > 4096
        ):
            await websocket.close(code=1008)
            return

        usuario = await autenticar(token)

        await websocket.send_json({
            "evento": "CONECTADO"
        })

        estado_anterior = None

        while True:
            usuario = await autenticar(token)

            notificacoes = await run_in_threadpool(
                listar_notificacoes,
                token=usuario,
                apenas_nao_lidas=True,
                limite=100
            )

            estado = [
                {
                    "id_notificacao": n["id_notificacao"],
                    "id_mensagem": n["id_mensagem"],
                    "id_chat": n["id_chat"]
                }
                for n in notificacoes
            ]

            if estado != estado_anterior:
                await websocket.send_json({
                    "evento": "ATUALIZAR_CHAT",
                    "notificacoes": estado
                })

                estado_anterior = estado

            try:
                await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=2
                )

                # O envio de mensagens permanece na API HTTP.
                await websocket.close(code=1008)
                return

            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        return

    except HTTPException as erro:
        codigo = 1011 if erro.status_code >= 500 else 1008
        await websocket.close(code=codigo)

    except (ValueError, asyncio.TimeoutError):
        await websocket.close(code=1008)
