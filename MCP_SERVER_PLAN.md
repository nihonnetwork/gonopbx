# Plano: MCP Server para configuração do GonoPBX

## Objetivo
Criar um MCP server para permitir configuração assistida e controlada do GonoPBX por ferramentas compatíveis com MCP, sem expor operações perigosas sem autorização explícita.

## Escopo MVP

### Recursos expostos inicialmente
- Consulta de estado/configuração do sistema PBX.
- Listagem de entidades configuráveis:
  - SIP peers/extensions
  - SIP trunks
  - inbound routes
  - ring groups
  - IVR menus
  - conference rooms
  - voicemail mailboxes
  - call forwarding rules
- Operações seguras de leitura e validação.
- Operações de escrita somente para mudanças pequenas e auditáveis, usando APIs existentes.

### Fora do MVP
- Execução arbitrária de comandos no host ou containers.
- Escrita direta em arquivos Asterisk sem passar pelo backend.
- Alterações destrutivas em massa.
- Gerenciamento de credenciais sensíveis.
- Reinício/reload irrestrito de serviços.
- Reboot do servidor, restart de containers e `install-update`.
- Execução de comandos AMI arbitrários.
- Upload de áudio IVR.
- Edição de trunks com senha.
- Fail2Ban unban sem fluxo de confirmação e auditoria forte.

## Arquitetura proposta

### Opção recomendada
Implementar um MCP server separado do backend FastAPI, usando Python, que consome as APIs HTTP existentes do GonoPBX.

Vantagens:
- Reaproveita validações e auditoria existentes no backend.
- Evita duplicar regras de negócio.
- Reduz risco de inconsistência entre API, banco e arquivos Asterisk.
- Permite controlar permissões por token/API user.

### Alternativa
Integrar MCP diretamente ao backend FastAPI.

Desvantagens:
- Mistura protocolo MCP com API REST principal.
- Aumenta superfície de ataque do backend.
- Torna deploy e permissões mais acoplados.

## Ferramentas MCP sugeridas

### Somente leitura
- `get_pbx_overview`
- `get_system_info`
- `list_sip_peers`
- `list_sip_trunks`
- `list_inbound_routes`
- `list_ring_groups`
- `list_ivr_menus`
- `list_conference_rooms`
- `list_voicemail_mailboxes`
- `list_call_forwards`
- `list_cdr_summary`
- `list_audit_log`
- `analyze_security_posture`
- `get_dialplan_summary`

### Validação
- `validate_extension_available`
- `validate_did_available`
- `validate_destination_exists`
- `preview_dialplan_impact`

### Escrita controlada
- `create_sip_peer`
- `update_sip_peer`
- `create_inbound_route`
- `update_inbound_route`
- `create_conference_room`
- `update_conference_room`
- `create_ring_group`
- `update_ring_group`

Operações de delete devem ficar fora do MVP ou exigir confirmação externa.

## Segurança e permissões

### Requisitos mínimos
- Autenticação obrigatória contra o backend.
- Token com escopo específico para MCP.
- Logs/auditoria para toda operação de escrita.
- Bloqueio de campos sensíveis em respostas, especialmente senhas de trunks/peers.
- Confirmação explícita para ações com reload de Asterisk.
- Rate limiting básico.

### Riscos principais
- Exposição de credenciais SIP/trunk, SMTP, MQTT e Home Assistant API key.
- Configuração acidental que derruba chamadas.
- Alterações em dialplan sem validação.
- Ferramentas MCP usadas por agentes com autonomia excessiva.
- Prompt injection tentando disparar mudanças destrutivas.
- Reuso indevido da `HA_API_KEY`, que hoje funciona como fallback administrativo em `backend/auth.py`.
- Backend com `/var/run/docker.sock` montado, aumentando o impacto de qualquer rota operacional exposta.
- AMI configurado com permissões amplas; não expor uma tool MCP genérica para AMI.

### Política de segredo
- Não retornar `SIPPeer.secret`, `SIPTrunk.password`, senhas SMTP/MQTT ou tokens em claro.
- Retornar apenas flags como `configured: true` ou valores mascarados.
- Senhas novas só podem aparecer no resultado imediato de criação, se estritamente necessário.

## Módulos relevantes existentes

Backend:
- `backend/main.py` — registro dos routers FastAPI.
- `backend/auth.py` — JWT, `require_admin` e fallback `X-API-Key`; não reutilizar a credencial Home Assistant para MCP.
- `backend/database.py` — modelos principais, incluindo SIP, routes, IVR, ring groups, CDR, settings e conference rooms.
- `backend/routers/settings.py` — status do servidor, codecs, whitelist SIP, SMTP, MQTT/Home Assistant, Fail2Ban e ações operacionais sensíveis.
- `backend/routers/peers.py` — SIP peers/extensions e verificação de senhas fracas.
- `backend/routers/trunks.py` — SIP trunks; mascarar senhas no MCP.
- `backend/routers/routes.py` — inbound routes.
- `backend/routers/groups.py` — ring groups.
- `backend/routers/ivr.py` — IVR menus e upload de prompts; upload deve ficar fora do MVP.
- `backend/routers/conferences.py` — conference rooms.
- `backend/routers/callforward.py` — call forwarding.
- `backend/routers/voicemail.py` — voicemail mailboxes e mensagens.
- `backend/routers/cdr.py` — histórico/estatísticas de chamadas.
- `backend/routers/dashboard.py` — visão agregada operacional.
- `backend/routers/audit.py` — auditoria.
- `backend/pjsip_config.py` — geração de `pjsip.conf`.
- `backend/dialplan.py` — geração de `extensions.conf`.
- `backend/voicemail_config.py` — geração de `voicemail.conf`.
- `backend/confbridge_config.py` — geração de `confbridge.conf`.
- `backend/queue_config.py` — geração de filas/ring groups.
- `backend/acl_config.py` — geração de ACL/whitelist SIP.
- `backend/email_config.py` — configuração msmtp.
- `backend/ami_client.py` — AMI/eventos/chamadas ativas; não expor AMI arbitrário.
- `backend/mqtt_client.py` — integração MQTT/Home Assistant.
- `docker-compose.yml` — backend monta Docker socket e volumes Asterisk; considerar alto impacto operacional.

Frontend/API:
- `frontend/src/api.ts` — client HTTP existente e tipos TypeScript.
- `frontend/src/pages/ConferenceRoomsPage.tsx` — UI de conference rooms.
- `frontend/src/pages/SettingsPage.tsx` — menu de configuração.

## Estrutura sugerida

```text
mcp-server/
  pyproject.toml
  README.md
  gonopbx_mcp/
    __init__.py
    server.py
    client.py
    schemas.py
    tools/
      system.py
      peers.py
      trunks.py
      routes.py
      conferences.py
      validation.py
```

## Dependências prováveis
- SDK MCP Python.
- `httpx` para consumir o backend FastAPI.
- `pydantic` para schemas de entrada/saída.
- Variáveis de ambiente:
  - `GONOPBX_API_BASE`
  - `GONOPBX_API_TOKEN` ou usuário/senha de serviço.

## Fases de implementação

### Fase 1 — Pesquisa e desenho
- Confirmar padrão atual de autenticação do backend.
- Definir usuário/token específico para MCP.
- Definir lista inicial de tools somente leitura.

### Fase 2 — MVP read-only
- Criar MCP server separado.
- Implementar client HTTP para backend.
- Implementar tools de listagem e consulta.
- Garantir mascaramento de credenciais.

### Fase 3 — Validação
- Adicionar tools de validação de extensão, DID e destino.
- Adicionar preview de impacto antes de escrita.

### Fase 4 — Escrita controlada
- Implementar create/update para recursos selecionados.
- Exigir confirmação do cliente/agente para mudanças com reload.
- Garantir logs/auditoria no backend.

### Fase 5 — Hardening
- Escopos de permissão.
- Rate limiting.
- Testes de integração.
- Documentação operacional.

## Critérios de aceite
- MCP server inicia localmente e lista tools.
- Tools read-only retornam dados sem credenciais sensíveis.
- Validações usam as mesmas regras do backend.
- Escritas passam pelas APIs existentes e aparecem no audit log.
- Nenhuma tool executa comando shell arbitrário.
- Nenhuma tool escreve diretamente em arquivos Asterisk.
