# KarnoX Builder

🇧🇷 [Português](#português) | 🇺🇸 [English](#english) | 🇪🇸 [Español](#español)

---

## Português

**IDE No-Code com Inteligência Artificial para desenvolvimento Delphi.**

O KarnoX Builder é uma IDE desktop (Windows) que combina geração de código assistida por IA com um designer visual No-Code, para acelerar a criação, manutenção e migração de aplicações Delphi/VCL — sem abrir mão do controle sobre o código gerado.

### Principais recursos

#### Assistente de IA
- Geração de telas, formulários, DataModules e regras de negócio a partir de prompt em linguagem natural.
- **Ghost Text**: autocomplete inline no editor, sugerindo trechos de código Pascal em tempo real.
- Agente com ferramentas internas (leitura de arquivos do projeto, compilação e correção automática de erros).
- Sugestões inteligentes prontas para cenários comuns: CRUD, autenticação, auditoria, relatórios, integrações fiscais (NF-e/NFC-e/CT-e/MDF-e via ACBr), LGPD, SPED, entre outros.
- Respeita o perfil de versão do Delphi selecionado e as conexões de banco de dados já existentes no projeto (Zeos, UniDAC, FireDAC, IBX, ADO, dbExpress).

#### Designer visual No-Code
- Editor de formulários com propriedades e ações específicas por componente (grids, navegadores de dados, gráficos, calendários, menus, etc.).
- Vínculo de dados (DataBinding) com filtros, ordenação e pesquisa sem escrever código manualmente.
- Wizard para criação de telas de cadastro completas, já conectadas ao banco do projeto.

#### Banco de dados
- Suporte a múltiplos bancos: **Firebird, SQL Server, MySQL, Oracle, PostgreSQL e SQLite**.
- Explorador de banco de dados integrado: navegação de esquema, execução de SQL, comparação e versionamento de migrações.

#### Projeto e produtividade
- Suporte a múltiplos perfis Delphi (7/2007, 2009–XE, XE2–XE8, 10–13), com geração de código adaptada a cada versão.
- Assistente de migração de versão de projetos legados.
- Integração com Git (status, init, commit).
- Gerenciador de bibliotecas e componentes de terceiros.
- Publicador de builds com geração de instalador/atualizador.
- Language Server (LSP) para Object Pascal: autocomplete, definição, referências e diagnósticos.

### Idiomas da interface
A IDE está disponível em **Português, Inglês e Espanhol**, com troca de idioma em tempo real pelo menu Configurações.

### Provedores de IA suportados
- **Anthropic (Claude)** — Claude Sonnet 5, Opus 4.8, Haiku 4.5, Fable 5
- **OpenAI** — GPT-5, GPT-5 mini/nano, GPT-4.1, GPT-4o, GPT-4 turbo, GPT-4, GPT-3.5 turbo, o3, o3-mini, o4-mini, o1, o1-mini
- **OpenRouter** — acesso a múltiplos modelos (Claude, GPT-4o, Qwen, Llama 3.3, DeepSeek, entre outros)
- **Google Gemini** — Gemini 3.5 Flash, 3.1 Pro/Flash Lite, 3 Flash, 2.5 Pro/Flash/Flash Lite
- **Qwen (Alibaba DashScope)** — Qwen Max, Plus, Turbo, Qwen2.5 72B e Qwen2.5 Coder 32B
- **LM Studio (local)** — modelos rodando localmente, sem necessidade de chave de API
- **Ollama (local)** — modelos rodando localmente, sem necessidade de chave de API
- **Personalizado** — qualquer endpoint compatível com a API da OpenAI

### Requisitos para uso
- Windows 10/11 (64 bits)
- Conexão com internet
- Delphi/RAD Studio instalado na máquina (a IDE auxilia a geração e compilação, mas não substitui o compilador oficial)


### Contato
**Desenvolvido por:** Eurico Júnior

[⬆ Voltar ao topo](#karnox-builder)

---

## English

**No-Code IDE with Artificial Intelligence for Delphi development.**

KarnoX Builder is a desktop IDE (Windows) that combines AI-assisted code generation with a visual No-Code designer, to speed up the creation, maintenance, and migration of Delphi/VCL applications — without giving up control over the generated code.

### Key features

#### AI Assistant
- Generation of screens, forms, DataModules, and business rules from a natural-language prompt.
- **Ghost Text**: inline autocomplete in the editor, suggesting Pascal code snippets in real time.
- Agent with internal tools (reading project files, building, and automatic error fixing).
- Ready-made smart suggestions for common scenarios: CRUD, authentication, auditing, reports, tax integrations (NF-e/NFC-e/CT-e/MDF-e via ACBr), LGPD, SPED, and more.
- Respects the selected Delphi version profile and the database connections already present in the project (Zeos, UniDAC, FireDAC, IBX, ADO, dbExpress).

#### Visual No-Code designer
- Form editor with component-specific properties and actions (grids, data navigators, charts, calendars, menus, etc.).
- Data binding with filters, sorting, and search without writing manual code.
- Wizard for creating complete registration screens, already connected to the project's database.

#### Database
- Support for multiple databases: **Firebird, SQL Server, MySQL, Oracle, PostgreSQL, and SQLite**.
- Integrated database explorer: schema browsing, SQL execution, comparison, and migration versioning.

#### Project and productivity
- Support for multiple Delphi profiles (7/2007, 2009–XE, XE2–XE8, 10–13), with code generation adapted to each version.
- Legacy project version migration assistant.
- Git integration (status, init, commit).
- Third-party libraries and components manager.
- Build publisher with installer/updater generation.
- Language Server (LSP) for Object Pascal: autocomplete, go to definition, references, and diagnostics.

### Interface languages
The IDE is available in **Portuguese, English, and Spanish**, with real-time language switching from the Settings menu.

### Supported AI providers
- **Anthropic (Claude)** — Claude Sonnet 5, Opus 4.8, Haiku 4.5, Fable 5
- **OpenAI** — GPT-5, GPT-5 mini/nano, GPT-4.1, GPT-4o, GPT-4 turbo, GPT-4, GPT-3.5 turbo, o3, o3-mini, o4-mini, o1, o1-mini
- **OpenRouter** — access to multiple models (Claude, GPT-4o, Qwen, Llama 3.3, DeepSeek, and more)
- **Google Gemini** — Gemini 3.5 Flash, 3.1 Pro/Flash Lite, 3 Flash, 2.5 Pro/Flash/Flash Lite
- **Qwen (Alibaba DashScope)** — Qwen Max, Plus, Turbo, Qwen2.5 72B, and Qwen2.5 Coder 32B
- **LM Studio (local)** — locally running models, no API key required
- **Ollama (local)** — locally running models, no API key required
- **Custom** — any OpenAI API-compatible endpoint

### Requirements
- Windows 10/11 (64-bit)
- Internet connection
- Delphi/RAD Studio installed on the machine (the IDE assists with generation and compilation, but does not replace the official compiler)

### Licensing
KarnoX Builder is a commercial product licensed per account.

### Contact
**Developed by:** Eurico Júnior


[⬆ Back to top](#karnox-builder)

---

## Español

**IDE No-Code con Inteligencia Artificial para desarrollo Delphi.**

KarnoX Builder es una IDE de escritorio (Windows) que combina generación de código asistida por IA con un diseñador visual No-Code, para acelerar la creación, el mantenimiento y la migración de aplicaciones Delphi/VCL — sin renunciar al control sobre el código generado.

### Funciones principales

#### Asistente de IA
- Generación de pantallas, formularios, DataModules y reglas de negocio a partir de un prompt en lenguaje natural.
- **Ghost Text**: autocompletado en línea en el editor, sugiriendo fragmentos de código Pascal en tiempo real.
- Agente con herramientas internas (lectura de archivos del proyecto, compilación y corrección automática de errores).
- Sugerencias inteligentes listas para escenarios comunes: CRUD, autenticación, auditoría, informes, integraciones fiscales (NF-e/NFC-e/CT-e/MDF-e vía ACBr), LGPD, SPED, entre otros.
- Respeta el perfil de versión de Delphi seleccionado y las conexiones de base de datos ya existentes en el proyecto (Zeos, UniDAC, FireDAC, IBX, ADO, dbExpress).

#### Diseñador visual No-Code
- Editor de formularios con propiedades y acciones específicas por componente (grids, navegadores de datos, gráficos, calendarios, menús, etc.).
- Vínculo de datos (DataBinding) con filtros, ordenación y búsqueda sin escribir código manualmente.
- Asistente para crear pantallas de registro completas, ya conectadas a la base de datos del proyecto.

#### Base de datos
- Soporte para múltiples bases de datos: **Firebird, SQL Server, MySQL, Oracle, PostgreSQL y SQLite**.
- Explorador de base de datos integrado: navegación de esquema, ejecución de SQL, comparación y versionado de migraciones.

#### Proyecto y productividad
- Soporte para múltiples perfiles de Delphi (7/2007, 2009–XE, XE2–XE8, 10–13), con generación de código adaptada a cada versión.
- Asistente de migración de versión para proyectos heredados.
- Integración con Git (status, init, commit).
- Gestor de bibliotecas y componentes de terceros.
- Publicador de builds con generación de instalador/actualizador.
- Language Server (LSP) para Object Pascal: autocompletado, definición, referencias y diagnósticos.

### Idiomas de la interfaz
La IDE está disponible en **Portugués, Inglés y Español**, con cambio de idioma en tiempo real desde el menú de Configuración.

### Proveedores de IA compatibles
- **Anthropic (Claude)** — Claude Sonnet 5, Opus 4.8, Haiku 4.5, Fable 5
- **OpenAI** — GPT-5, GPT-5 mini/nano, GPT-4.1, GPT-4o, GPT-4 turbo, GPT-4, GPT-3.5 turbo, o3, o3-mini, o4-mini, o1, o1-mini
- **OpenRouter** — acceso a múltiples modelos (Claude, GPT-4o, Qwen, Llama 3.3, DeepSeek, entre otros)
- **Google Gemini** — Gemini 3.5 Flash, 3.1 Pro/Flash Lite, 3 Flash, 2.5 Pro/Flash/Flash Lite
- **Qwen (Alibaba DashScope)** — Qwen Max, Plus, Turbo, Qwen2.5 72B y Qwen2.5 Coder 32B
- **LM Studio (local)** — modelos ejecutados localmente, sin necesidad de clave de API
- **Ollama (local)** — modelos ejecutados localmente, sin necesidad de clave de API
- **Personalizado** — cualquier endpoint compatible con la API de OpenAI

### Requisitos de uso
- Windows 10/11 (64 bits)
- Conexión a internet
- Delphi/RAD Studio instalado en la máquina (la IDE ayuda con la generación y compilación, pero no reemplaza al compilador oficial)

### Licenciamiento
KarnoX Builder es un producto comercial licenciado por cuenta.

### Contacto
**Desarrollado por:** Eurico Júnior


[⬆ Volver arriba](#karnox-builder)

---
© KarnoX Builder. Todos os direitos reservados. / All rights reserved. / Todos los derechos reservados.
