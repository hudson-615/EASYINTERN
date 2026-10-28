from fastapi import FastAPI

app = FastAPI(title="EasyIntern")


@app.get("/")
def inicio():
    return {"mensagem": "EasyIntern - Backend funcionando!"}
