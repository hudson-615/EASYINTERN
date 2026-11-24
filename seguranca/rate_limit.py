from collections import OrderedDict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request


class Limitador:
    def __init__(self, limite, janela, max_chaves=10000):
        self.limite = limite
        self.janela = janela
        self.max_chaves = max_chaves
        self.registros = OrderedDict()
        self.lock = Lock()

    def verificar(self, chave):
        with self.lock:
            agora = monotonic()
            while self.registros:
                primeira = next(iter(self.registros.values()))

                if primeira and agora - primeira[-1] >= self.janela:
                    self.registros.popitem(last=False)
                else:
                    break

            eventos = self.registros.get(chave)

            if eventos is None:
                if len(self.registros) >= self.max_chaves:
                    raise HTTPException(
                        status_code=429,
                        detail="Limite temporario de solicitacoes.",
                        headers={"Retry-After": str(self.janela)}
                    )

                eventos = deque()
                self.registros[chave] = eventos

            while eventos and agora - eventos[0] >= self.janela:
                eventos.popleft()

            if len(eventos) >= self.limite:
                espera = max(1, int(self.janela - (agora - eventos[0])) + 1)
                raise HTTPException(
                    status_code=429,
                    detail="Muitas solicitacoes. Tente novamente mais tarde.",
                    headers={"Retry-After": str(espera)}
                )

            eventos.append(agora)
            self.registros.move_to_end(chave)



login_limitador = Limitador(30, 60)
recuperacao_limitador = Limitador(5, 900)


def obter_ip(request: Request):
    return request.client.host if request.client else "desconhecido"


def limitar_login(request: Request):
    login_limitador.verificar(obter_ip(request))


def limitar_recuperacao(request: Request):
    recuperacao_limitador.verificar(obter_ip(request))
