# UrbanAlert — FastAPI + SQLite (local) / PostgreSQL (Render)

Sistema de registro de ocorrências urbanas. Backend em Python (FastAPI), banco SQLite local e PostgreSQL
em produção (o que o Render hospeda) e frontend em HTML/JS servido pelo próprio backend.

## Rodar localmente (sem instalar banco de dados)
Localmente o banco é um arquivo **SQLite** (`backend/urbanalert.db`), criado sozinho. Só precisa do Python 3.10+.
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env   (edite o JWT_SECRET)
python run.py               # http://localhost:3001
```
Na primeira execução ele cria as tabelas, as categorias e o admin: `admin@urbanalert.com` / `admin123`.
Opcionais: `python setup_db.py --demo` (dados de exemplo) · `python setup_db.py --reset` (apaga tudo e recria).
API interativa: `/api/docs` · Testes: `python tests/test_api.py` (use um banco vazio ou de teste).

> No Render o mesmo código usa **PostgreSQL** automaticamente (quando existe `DATABASE_URL`).
> Para testar PostgreSQL local: `DB_ENGINE=postgres` + `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` no `.env`.
> Os dados do SQLite local **não** vão para o Render: são bancos separados.

## Publicar no Render

### Opção A — Blueprint (automático)
1. Envie esta pasta para um repositório no GitHub (o `.gitignore` já exclui o `.env`).
2. Tenha um PostgreSQL no Render e copie a **Internal Database URL** dele (Dashboard → seu banco → *Connections*).
   - O plano gratuito permite **1 banco por conta**. Se você já tem um, **reaproveite**: o UrbanAlert usa um schema
     próprio (`DB_SCHEMA=urbanalert`), então não se mistura com as tabelas de outro projeto.
   - Se não tem nenhum, crie em New + → **PostgreSQL** (Database: `urbanalert`, Instance Type: Free).
3. Render → **New + → Blueprint** → escolha o repositório. Ele lê o `render.yaml` e cria o site.
4. Informe `DATABASE_URL` (passo 2) e `ADMIN_PASSWORD` (senha do admin).
5. No primeiro start o schema `urbanalert`, as tabelas, as categorias e o admin são criados sozinhos.

### Opção B — manual (Web Service)
1. **Banco:** use o PostgreSQL que você já tem ou crie um (veja acima) e copie a **Internal Database URL**.
2. **Site:** New + → **Web Service** → escolha o repositório.
   - Language: **Python 3** · Branch: `main` · Root Directory: *(vazio)* · Region: **a mesma do banco** · Instance Type: Free
   - Build Command: `pip install -r backend/requirements.txt`
   - Start Command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Advanced → Health Check Path: `/api/health`
3. **Environment Variables:**

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a Internal Database URL do passo 1 |
   | `DB_SCHEMA` | `urbanalert` (recomendado quando o banco é compartilhado com outro projeto) |
   | `AUTO_SETUP` | `true` |
   | `JWT_SECRET` | texto aleatório com 32+ caracteres |
   | `ADMIN_PASSWORD` | senha forte do admin (não use `admin123`) |
   | `PYTHON_VERSION` | `3.12.7` |
   | `ADMIN_EMAIL` | *(opcional)* padrão `admin@urbanalert.com` |

4. **Create Web Service**. Nos *Logs* deve aparecer "Schema 'urbanalert' pronto" e "Application startup complete".
5. Abra `https://SEU-SERVICO.onrender.com` e entre com o admin.

### Observações
- `--reset` e `DB_SCHEMA`: com `DB_SCHEMA` definido o reset só apaga as tabelas do schema do UrbanAlert; sem ele apaga as tabelas do banco inteiro com esses nomes.
- Use a **Internal** Database URL quando o site e o banco estiverem na mesma região; a *External* serve para acessar o banco do seu computador (exige SSL, que o driver negocia sozinho; se precisar forçar: `DB_SSLMODE=require`).
- Plano Free: o site dorme após ~15 min sem acesso (primeiro acesso demora ~30–60 s) e o banco gratuito do Render tem prazo de validade/limites — confira as condições atuais em render.com/docs/free e faça backup (`pg_dump`) se o conteúdo importar.
- Se o admin já existir, `ADMIN_PASSWORD` não altera a senha dele.
- Fotos ficam no banco em base64; com muito volume, prefira um armazenamento de arquivos.

## Estrutura
```
render.yaml                      blueprint do Render (site + PostgreSQL)
backend/app/                     API FastAPI (config, db, security, rotas)
backend/sql/schema.sql           schema PostgreSQL (Render)
backend/sql/schema_sqlite.sql    schema SQLite (uso local)
backend/setup_db.py              prepara o banco (local ou Render)
backend/tests/test_api.py        teste ponta a ponta
frontend/                        interface web
```

## Mudanças em relação à versão MySQL
- Tipos ajustados para PostgreSQL: `SERIAL`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB` (fotos), `CHECK` no lugar de `ENUM`, trigger para `updated_at`.
- Busca por título/endereço agora ignora maiúsculas/minúsculas (`ILIKE`).
- Driver `psycopg` 3 com pool de conexões (descarta conexões mortas quando o banco gratuito "acorda").
- Cidadão enxerga as ocorrências de todos, mas só edita/exclui as próprias; admin exclui usuários de verdade (com cascade).
