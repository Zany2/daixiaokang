---
title: DeerFlow 2.0使用指南
description: "整理 DeerFlow 2.0 的核心概念、本地部署、模型配置、沙箱、Skills、MCP 与任务使用方法，并记录常见问题及实践思路。"
tags:
  - 技术开发
  - AI
  - Agent
  - DeerFlow
categories:
  - 技术
abbrlink: 29cc628
date: 2026-10-23
updated: 2026-10-23
---

# 1、DeerFlow 2.0 是什么

[DeerFlow](https://github.com/bytedance/deer-flow) 是字节跳动开源的智能体运行系统。它将模型、工具、子智能体、文件系统和记忆等能力组织起来，用于完成资料研究、内容整理、代码与文件处理等多步骤任务。

官方将 2.0 定位为 **Super Agent Harness**，可以理解为让智能体实际开展工作的运行环境。模型负责理解和决策，DeerFlow 提供执行任务所需的基础设施。

**DeerFlow 2.0 是一次完整重写，旧版代码保留在 `1.x` 分支。** 查找教程时，需要先确认教程针对的分支，避免把旧版配置复制进当前项目。[官方项目说明](https://github.com/bytedance/deer-flow#readme)。

本文按 **2026-10-23 查阅的官方 `main` 分支文档**整理。2.0 是本文讨论的产品架构，具体命令、配置项与界面仍应以下载的提交版本为准。本文仅记录使用方法，没有安装或启动 DeerFlow。

<!-- more -->

# 2、先理解几个核心概念

| 概念 | 主要职责 | 理解方式 |
| --- | --- | --- |
| Model | 理解任务、生成计划、决定工具调用 | 智能体使用的推理与生成能力 |
| Lead Agent | 接收任务、协调工具与子任务 | 主执行者 |
| Subagent | 接收被拆分的任务并返回结果 | 分工处理的执行者 |
| Tool | 执行具体动作 | 搜索、读取文件、运行代码等操作 |
| Skill | 描述某类任务的流程与方法 | 可以复用的工作说明 |
| Sandbox | 提供文件和代码执行环境 | 完成实际操作的工作空间 |
| Memory | 保存适合跨会话使用的信息 | 长期偏好与上下文 |

一个典型任务可以按下面的过程理解：

```text
用户描述目标
    → 主智能体理解任务
    → 按需要规划、调用工具或委派子任务
    → 在工作空间读取资料、处理文件
    → 整理结果并交付文件或回答
```

这是便于理解的流程，不代表每次请求都会经过所有步骤。简单问答不一定需要沙箱，复杂研究也不一定需要同时启动很多子智能体。[后端组件说明](https://github.com/bytedance/deer-flow/blob/main/backend/README.md)。

# 3、项目由哪些部分组成

官方项目包含 Web 界面、后端 Gateway、智能体运行时以及可选执行组件。

| 位置 | 主要内容 |
| --- | --- |
| `frontend/` | 基于 Next.js 的 Web 界面 |
| `backend/` | Gateway、智能体运行逻辑与相关模块 |
| `skills/` | 技能资源 |
| `docker/` | 容器编排、镜像及代理配置 |
| `config.example.yaml` | 主配置模板 |
| `extensions_config.example.json` | 扩展配置模板 |
| `Makefile` | 配置、安装、启动、停止与诊断入口 |

当前官方架构通过 Nginx 提供统一入口：网页请求进入前端，`/api/*` 进入 Gateway，`/api/langgraph/*` 提供兼容的智能体交互接口。默认访问端口是 **2026**。[后端架构与路由](https://github.com/bytedance/deer-flow/blob/main/backend/README.md#architecture)。

初次使用可以从统一入口访问，先确认完整链路能正常工作，再考虑单独调试内部服务。

# 4、准备运行环境

## 4.1、两种启动方式

| 方式 | 特点 | 需要准备 |
| --- | --- | --- |
| Docker 开发环境 | 通过容器组织服务，适合先体验与调试 | Docker、Compose、仓库脚本所需工具 |
| 本地开发环境 | 便于直接调试前后端代码 | Node.js、pnpm、uv、nginx 等 |

当前 Docker 开发配置要求 **Docker Compose v2.24 或更新版本**。本地开发文档列出的 Node.js 要求为 **22+**，Python 环境与依赖按仓库的项目配置和锁文件准备。

官方开发环境资源建议以 4 核、8 GB 内存作为起步参考，较重的任务可以从 8 核、16 GB 内存评估。这是运行应用与容器的参考，不包含自行部署本地大模型所需的额外资源。[开发环境指南](https://github.com/bytedance/deer-flow/blob/main/CONTRIBUTING.md)。

Windows 下执行 `make` 前，需要确认 Make 可用；当前 Makefile 的 Windows 路径会通过 Git Bash 运行相关 Shell 脚本。Docker 方式还需要确认 Docker Desktop 已启动。[官方 Makefile](https://github.com/bytedance/deer-flow/blob/main/Makefile)。

## 4.2、获取代码并生成配置

首次使用时，在准备存放项目的位置执行：

```shell
git clone https://github.com/bytedance/deer-flow.git
cd deer-flow
make config
```

`make config` 用于生成本地配置。已有配置的项目跳过这一步，避免把初始化当成日常启动流程。

官方也提供 `make setup` 交互式配置向导；本文使用手动配置方式说明各部分作用。执行命令前，确认当前目录是 DeerFlow 仓库根目录。[官方安装流程](https://github.com/bytedance/deer-flow/blob/main/Install.md)。

# 5、配置模型

## 5.1、模型配置需要哪些信息

至少准备模型名称、调用凭证和正确的服务地址。模型还需要能够完成所选任务使用的工具调用；普通文本对话可用，不代表完整的智能体流程一定可用。

下面是使用 OpenAI 兼容协议的**配置片段**，用于说明字段含义。把它合并到生成的 `config.yaml` 的 `models` 列表中，保留其余配置，不要重复声明两个 `models` 键。

```yaml
models:
  - name: my-agent-model
    display_name: 自定义任务模型
    use: langchain_openai:ChatOpenAI
    model: replace-with-provider-model-id
    base_url: https://api.example.com/v1
    api_key: $MODEL_API_KEY
    max_tokens: 4096
    supports_vision: false
```

其中 `name` 是内部标识，`model` 是供应商实际接受的模型 ID，`base_url` 是对应 API 根地址。示例域名与模型 ID 都是占位值，需要替换。`max_tokens` 是单次调用的输出限制，不是整个任务的总预算。

`use` 决定适配器，模型特有的推理参数应参考对应示例；不能仅靠设置一个能力标记，就让不支持该功能的模型获得相应能力。[模型配置指南](https://github.com/bytedance/deer-flow/blob/main/backend/docs/CONFIGURATION.md#models)。

## 5.2、环境变量放在哪里

上面的 `$MODEL_API_KEY` 表示从环境变量读取凭证。

对于官方 Docker 开发编排，Gateway 会读取仓库根目录的 `.env`。可以在该文件中加入自己的变量：

```dotenv
MODEL_API_KEY=replace_with_your_api_key
```

前端还有独立的 `frontend/.env`，两者用途不同。模型服务凭证应进入真正运行后端的环境；如果采用其他部署方式，需要核对对应进程或容器如何接收环境变量。[Docker 开发编排配置](https://github.com/bytedance/deer-flow/blob/main/docker/docker-compose-dev.yaml)。

凭证只保存在本地或部署环境中，不写入文章、截图和公开仓库。变更环境变量后，需要让对应服务重新加载配置。

# 6、启动与停止服务

## 6.1、Docker 开发方式

完成配置后，在仓库根目录执行：

```shell
make docker-init
make docker-start
```

`docker-init` 负责所选沙箱模式需要的初始化准备；`docker-start` 才是应用服务的启动入口。启动完成后访问 [http://localhost:2026](http://localhost:2026)。

查看开发环境日志：

```shell
make docker-logs
```

日常停止开发容器：

```shell
make docker-stop
```

首次启动的耗时可能包含依赖安装、镜像构建和下载，应结合日志判断当前阶段。应用使用 Docker 部署与任务采用哪一种沙箱模式，是两个需要分别确认的配置。[Docker 开发流程](https://github.com/bytedance/deer-flow/blob/main/CONTRIBUTING.md#option-1-docker-development-recommended)。

## 6.2、本地开发方式

本地运行时，可以先检查工具，再安装依赖并启动：

```shell
make check
make install
make dev
```

对应的本地服务停止命令为：

```shell
make stop
```

两种开发方式选择一种运行即可。端口已被另一套实例占用时，先确认正在运行的服务来源，再决定停止哪一套。

**`make clean` 会删除本地运行数据与日志，可能涉及会话、上传文件、记忆等数据。** 日常停止使用上面的停止命令，故障排查先查看日志与配置。[命令定义](https://github.com/bytedance/deer-flow/blob/main/Makefile)。

# 7、怎样描述一个容易执行的任务

开始任务前，可以先把需求拆成四部分：目标、材料、约束、交付物。

| 部分 | 可以填写的内容 |
| --- | --- |
| 目标 | 希望最终完成什么 |
| 材料 | 提供哪些链接、附件或数据 |
| 约束 | 时间范围、技术版本、引用要求、允许的操作 |
| 交付物 | Markdown 报告、表格、代码或其他文件 |

例如准备一篇技术文章：

```text
请整理一份 DTM 分布式事务的学习报告。

材料：以 DTM 官方文档和官方示例仓库为主要来源。
范围：Saga、TCC、二阶段消息和子事务屏障。
要求：说明适用场景、关键前提和失败处理，区分事实与实践建议。
代码：展示 Go 接入结构，未运行的示例必须明确标注。
交付：输出一份中文 Markdown 文件，并在相关段落附来源链接。
```

这段提示词是本文的使用示例。它将资料范围和验收要求写清楚，便于检查产出，也便于任务中断后继续补充。

对于文件分析任务，还可以给出需要核对的列名、单位、缺失值处理方式，以及希望保留的原始数据。一次任务包含多个交付物时，明确各文件的名称和用途。

## 7.1、根据任务选择执行方式

简短的问题可以先直接询问；需要研究、比较、计算和生成文件时，再使用界面提供的规划或子任务能力。

我的实践思路是先用一个边界清晰的小任务验证模型和工具，再扩大到完整流程。把任务完成与否落实到交付物上，例如报告是否含来源、表格是否能打开、代码是否注明验证范围。

# 8、Skills 与 MCP 的区别

Skill 用来组织“这类任务应该怎么做”，Tool 用来执行具体动作，MCP 则可以为智能体接入外部工具与服务。

例如“技术文章整理”Skill 可以规定资料检索、版本核对和文章结构；搜索工具或 MCP 服务提供实际检索能力。只有工作说明而没有可用工具，无法自动获得对应的外部数据。

当前官方界面通过工作区的 **Capability Center** 管理 Skills 与插件等能力。安装或导入后，还需要确认该能力对当前任务可用。[Skills 与工具说明](https://github.com/bytedance/deer-flow#skills--tools)。

## 8.1、一个自定义 Skill 的思路

下面是本文编写的 `SKILL.md` 内容示例，用于表达技术文章整理流程；它不是已经安装到 DeerFlow 的技能包。

```markdown
---
name: technical-article-notes
description: "根据官方资料整理中文技术文章，保留版本信息、代码前提和来源。"
---

# 技术文章整理

1. 明确主题、目标读者与技术版本。
2. 优先阅读官方文档、源码和维护者提供的示例。
3. 记录关键结论及其来源，区分已核实内容和推断。
4. 按背景、概念、接入方式、常见问题组织文章。
5. 将配置中的真实凭证替换为明确的占位值。
6. 对代码标注运行条件和验证范围。
7. 交付 Markdown 文件，并检查标题、日期、链接与代码围栏。
```

可先将团队反复使用的写作规范整理成这种流程，再按当前版本的技能目录或导入功能接入。引用资源、辅助脚本和工具需求也需要随技能一起组织，不能仅凭一个名称假设依赖已经准备完成。

# 9、沙箱、文件与记忆如何理解

## 9.1、确认代码执行的位置

沙箱模式决定任务在哪里读取文件和执行代码。当前项目提供本地执行与基于容器的执行方式；本地模式中的命令可能直接作用于宿主环境，容器模式则需要核对镜像、挂载与执行范围。

应用本身在容器中启动，不等于所有业务工具都自动获得同样的隔离边界。准备启用命令执行前，应先确认实际选用的 Provider。[沙箱配置说明](https://github.com/bytedance/deer-flow/blob/main/backend/docs/CONFIGURATION.md#sandbox)。

## 9.2、工作文件与最终文件

官方后端为线程组织工作目录、上传文件和输出文件，并使用虚拟路径映射到对应存储位置。

例如任务内部出现的 `/mnt/user-data/outputs` 是执行环境中的输出路径，不应直接理解为 Windows 本机磁盘路径。查看交付物时，使用界面提供的文件入口，并确认实际下载的是最终版本。[文件系统说明](https://github.com/bytedance/deer-flow/blob/main/backend/README.md#sandbox-system)。

## 9.3、会话与长期记忆

会话用于保留本次任务的过程，文件用于保存材料与产物，长期记忆用于跨会话的适当上下文。它们不应被当成同一种数据。

在实践中，可以将长期写作偏好与临时任务要求分开表达。任务完成后仍需检查实际产物，不把“系统记住了偏好”当成这次输出已经符合要求的证据。

# 10、常见问题怎么排查

| 现象 | 可以优先检查 |
| --- | --- |
| 网页能打开，发送消息失败 | Gateway 日志、模型配置、凭证与供应商返回结果 |
| 模型可以聊天，但任务不会调用工具 | 所选模型的工具调用能力、适配器和工具配置 |
| 容器内访问本机模型失败 | `localhost` 的实际指向、容器网络及服务监听地址 |
| 搜索没有结果 | 搜索工具是否启用、相关凭证、网络和来源限制 |
| 文件处理失败 | 文件是否上传成功、执行环境依赖、沙箱路径和权限 |
| 页面长时间没有流式内容 | 后端是否仍在运行、网络连接、反向代理的流式转发 |
| 升级后提示配置过旧 | 当前模板版本与本地配置差异，先备份再合并 |

模型、搜索服务、浏览器和文件执行是不同链路。排查时可以分别验证，再组合成完整任务，避免仅凭网页状态推断后端已经就绪。

官方提供 `make doctor` 诊断入口，配置更新还提供 `make config-upgrade`。升级前保留本地配置与运行数据副本，再依据当前版本说明处理变更。[诊断与升级命令](https://github.com/bytedance/deer-flow/blob/main/Makefile)、[配置版本说明](https://github.com/bytedance/deer-flow/blob/main/backend/docs/CONFIGURATION.md#config-versioning)。

如果部署到服务器，应先确定访问人员、鉴权和沙箱边界，再开放相应入口。模型凭证、执行环境和普通静态网页承担的权限不同，访问控制需要跟着实际能力一起配置。[官方部署说明](https://github.com/bytedance/deer-flow#security-notice)。

# 11、在个人技术学习中的使用思路

结合自己的博客，可以先尝试三个边界明确的场景：

1. **官方资料整理**：围绕一个版本生成学习提纲，保留来源与待核实事项。
2. **代码阅读辅助**：提供一组源码文件，整理调用关系与设计问题，再人工核对。
3. **文章发布前检查**：检查术语、代码前提、引用链接与段落结构，最终由自己确认内容。

这些是本文提出的任务设计方式，不代表 DeerFlow 对每个任务都能自动给出正确结论。使用时保留任务输入、来源和最终文件，才能持续改进自己的工作流程。

本文仅完成文档整理与示例说明，未进行 DeerFlow 部署、模型调用或端到端验证。后续使用时可以继续查阅[官方仓库](https://github.com/bytedance/deer-flow)、[安装说明](https://github.com/bytedance/deer-flow/blob/main/Install.md)与[配置模板](https://github.com/bytedance/deer-flow/blob/main/config.example.yaml)。
