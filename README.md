# LangChain MCP & A2A Agent

This repository implements a Node.js AI agent using Express, LangChain, the Model Context Protocol (MCP), and the Agent-to-Agent (A2A) protocol. It is fully compliant with the latest MCP and A2A specifications.

## Documentation

- **[OVERVIEW.md](./OVERVIEW.md)** - A simplified guide to the MCP & A2A agent for non-technical users
- **[CODE_STRUCTURE.md](./CODE_STRUCTURE.md)** - Detailed documentation of each source file and its purpose in the system

## Overview

This project demonstrates how to build an AI agent that can:

1. **Expose LLM capabilities** through a traditional REST API
2. **Utilize external tools** via the Model Context Protocol (MCP)
3. **Communicate with other agents** using the Agent-to-Agent (A2A) protocol
4. **Orchestrate AI logic** with LangChain's agent framework

The agent serves as both an MCP client (consuming tools from MCP servers) and an A2A-compliant agent (providing an agent card and handling task requests).

## Folder Structure

```
├── Dockerfile                # Multi-stage build for production image
├── docker-compose.yml        # Docker Compose setup (app + Traefik proxy)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── README.md                 # Project overview and setup instructions
├── .env.example              # Example environment variables
├── mcp-mock-server/          # Mock MCP server for development
│   └── src/
│       └── server.ts         # Simple MCP server with mock tools
└── src                       # Application source code
    ├── server.ts             # Main Express app, initializes agent, tools, and defines processWithAgent logic
    ├── config                # Environment configuration
    │   ├── index.ts          # Configuration loader and validation
    │   └── loader.ts         # YAML and environment variable configuration loader
    ├── routes                # Express routers
    │   ├── api.ts            # `/api/invoke` user endpoint
    │   └── a2a.ts            # A2A endpoints (`/.well-known/agent.json`, `/a2a/message`)
    ├── agent                 # Agent orchestration logic
    │   ├── agent.ts          # Agent setup and initialization
    │   └── memory.ts         # Chat history management (in-memory or Redis)
    ├── mcp                   # MCP client and tool wrappers
    │   ├── client.ts         # MCP SDK client initialization and calls
    │   └── tools.ts          # Discovery and creation of MCP tools for LangChain
    ├── tools                 # Custom tools
    │   └── AskAnotherAgentTool.ts  # A2A client tool for cross-agent calls
    ├── utils                 # Utility functions
    │   ├── logger.ts         # Enhanced logging utility with colored output
    │   └── requestLogger.ts  # HTTP request logging with request IDs
    └── types                 # Shared TypeScript types
        └── a2aTypes.ts       # A2A protocol interfaces
```

## Key Features

- **LangChain Integration**: Uses OpenAI functions agent framework via `createOpenAIFunctionsAgent` for reasoning and tool selection.

- **MCP Client Implementation**: 
  - Uses the latest `@modelcontextprotocol/sdk` (protocol version 2024-11-05)
  - Implements **Streamable HTTP** transport (the recommended transport that replaced SSE)
  - Dynamically discovers available MCP tools from connected MCP servers
  - Converts MCP tools into LangChain-compatible tools with proper schema handling

- **A2A Protocol Implementation**:
  - **Agent Card**: Serves a well-formatted agent card at `/.well-known/agent.json`
  - **Task Handling**: Processes incoming A2A tasks via `/a2a/message` endpoint
  - **Cross-Agent Communication**: Provides a custom `AskAnotherAgentTool` for the agent to call other A2A agents
  - **Skill Definitions**: Defines agent capabilities through the "skills" section in the agent card

- **Multiple LLM Providers**:
  - **OpenAI**: Default provider with GPT-4o, GPT-4, and GPT-3.5 models
  - **Ollama**: For self-hosted models like Llama, Mistral, etc.
  - **Anthropic**: Claude model family support

- **Chat History Management**:
  - **In-memory Storage**: Simple chat history for development use
  - **Redis-based Persistence**: Production-ready chat history with automatic cleanup
  - **Automatic Fallback**: Redis with fallback to in-memory if unavailable
  - **TTL Support**: Automatic expiration of old conversations (default: 24 hours)

- **Enhanced Logging System**:
  - **Colored Output**: Different colors for different log levels (DEBUG, INFO, WARN, ERROR, FATAL)
  - **Source Information**: Each log message includes the source file and line number
  - **Configurable Log Levels**: Control verbosity via environment variables
  - **HTTP Request Logging**: Automatic logging for all HTTP requests with request IDs
  - **Request Tracing**: Unique IDs for tracking requests through the system
  - **Error Handling**: Comprehensive error logging with stack traces

- **Developer Experience**:
  - **Mock MCP Server**: Includes a lightweight MCP server for development and testing
  - **Dockerized Deployment**: Multi-stage Docker build with Traefik reverse proxy for proper hostname handling
  - **Redis Commander UI**: Browser-based Redis monitoring and management
  - **Unified Configuration System**: YAML-based configuration with environment variable overrides

## Configuration System

The agent uses a comprehensive configuration system that allows customizing all aspects of behavior without code changes:

### YAML Configuration (Recommended)

1. **Copy the example configuration**:
   ```bash
   cp agent-config.yml.example agent-config.yml
   ```

2. **Edit the configuration file** to match your requirements:
   ```yaml
   # Server Configuration
   server:
     port: 3000
     baseUrl: "http://localhost:3000"
     name: "MyLangchainNodeAgentMCP"
   
   # LLM Configuration
   llm:
     provider: "openai"  # Options: openai, ollama, anthropic
     model: "gpt-4o-mini"
     temperature: 0.7
     
     # Provider-specific configuration
     openai:
       apiKey: ""  # Your OpenAI API key
       apiUrl: ""  # Optional: Custom OpenAI API URL
     
     ollama:
       baseUrl: "http://localhost:11434"
     
     anthropic:
       apiKey: ""  # Your Anthropic API key
   ```

3. **Start the agent** - it will automatically load the configuration from `agent-config.yml`

The YAML configuration supports all aspects of the agent:
- Server settings and agent identity
- LLM provider selection and configuration
- MCP connection and tool definitions
- A2A protocol skills and capabilities
- Memory storage options
- Logging levels and output
- Agent prompting and system messages

### System Prompt Templating

The agent's system prompt supports templating to dynamically include the agent's identity information. In your `agent-config.yml`, you'll see template variables in the `systemPrompt` section:

```yaml
agent:
  systemPrompt: |
    You are {name}, {description}.
    Your Agent ID is {baseUrl}. You have access to MCP tools that provide various capabilities,
    and an A2A tool ('ask_another_a2a_agent') to interact with other agents.
    # ...rest of the prompt
```

These template variables are automatically replaced during configuration loading:
- `{name}` is replaced with `server.name` from your configuration
- `{description}` is replaced with `server.description`
- `{baseUrl}` is replaced with `server.baseUrl`

This design ensures consistency between how the agent identifies itself in HTTP responses and in its conversations with users. You can set these values once in the `server` section of your configuration file:

```yaml
server:
  port: 3000
  baseUrl: "http://localhost:3000"
  name: "MyLangchainNodeAgentMCP"
  description: "A helpful agent built with Langchain and Node.js using MCP."
```

The agent will then use these values throughout the application, ensuring a consistent identity.

### Environment Variables (Alternative)

All configuration options can also be set via environment variables:

```ini
# Server configuration
PORT=3000
AGENT_BASE_URL=http://localhost:3000
AGENT_NAME=MyLangchainNodeAgentMCP

# LLM Configuration
LLM_PROVIDER=openai  # Options: openai, ollama, anthropic
OPENAI_API_KEY=your_openai_api_key  # If using OpenAI
OPENAI_URL=https://api.openai.com/v1  # Optional: Custom OpenAI API endpoint
OLLAMA_BASE_URL=http://localhost:11434  # If using Ollama
MODEL=gpt-4o-mini  # Model name (OpenAI: gpt-4o, gpt-4o-mini, etc. Ollama: llama3, mistral, etc.)
TEMPERATURE=0.7

# Anthropic Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key  # Required for Anthropic Claude
```

**Note**: Environment variables take precedence over YAML configuration.

### Configuration Hierarchy

The system loads configuration in this order:
1. Default values (built-in)
2. YAML configuration from `agent-config.yml`
3. Environment variables (override YAML and defaults)

### Docker Configuration

When using Docker, mount your configuration file:

```yaml
services:
  app:
    # ...
    volumes:
      - ./agent-config.yml:/usr/src/app/agent-config.yml
```

You can also pass environment variables via Docker Compose:

```yaml
services:
  app:
    # ...
    environment:
      - LOG_LEVEL=DEBUG
```

## Setup & Installation

### Prerequisites

- Node.js 18.x or later
- npm 8.x or later
- Docker and Docker Compose (optional, for containerized deployment)
- Ollama (optional, for local LLM deployment)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd a2a_mcp_express
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment variables**
   - Copy `.env.example` to `.env` and fill in values:
     ```ini
     # Server Configuration
     PORT=3000
     AGENT_BASE_URL=http://localhost:3000
     AGENT_NAME=MyLangchainNodeAgentMCP
     AGENT_DESCRIPTION="A helpful agent using MCP and A2A"
     
     # LLM Configuration
     LLM_PROVIDER=openai  # Options: openai, ollama, anthropic
     OPENAI_API_KEY=your_openai_api_key  # If using OpenAI
     OPENAI_URL=https://api.openai.com/v1  # Optional: Custom OpenAI API endpoint
     OLLAMA_BASE_URL=http://localhost:11434  # If using Ollama
     MODEL=gpt-4o-mini  # Model name (OpenAI: gpt-4o, gpt-4o-mini, etc. Ollama: llama3, mistral, etc.)
     TEMPERATURE=0.7
     
     # Anthropic Configuration
     ANTHROPIC_API_KEY=your_anthropic_api_key  # Required for Anthropic Claude
     
     # Memory Configuration
     MEMORY_TYPE=memory  # Options: memory, redis
     REDIS_URL=redis://localhost:6379  # Required if MEMORY_TYPE=redis
     
     # MCP Configuration
     MCP_SERVER_URL=http://localhost:9000/mcp
     
     # A2A Configuration
     A2A_VERSION=1.0
     
     # Logging Configuration
     LOG_LEVEL=INFO  # Options: DEBUG, INFO, WARN, ERROR, FATAL
     ```

4. **Start the mock MCP server** (optional, for local development)
   ```bash
   cd mcp-mock-server
   npm install
   npm run dev
   ```

5. **Run in development mode**
   ```bash
   npm run dev
   ```

6. **Build & start in production mode**
   ```bash
   npm run build
   npm start
   ```

### Using Ollama (Local LLMs)

1. **Install Ollama** from [ollama.ai](https://ollama.ai)

2. **Pull your desired model**
   ```bash
   ollama pull llama3  # Or any other model
   ```

3. **Configure the agent to use Ollama**
   ```ini
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   MODEL=llama3  # Or your chosen model
   ```

### Using Custom OpenAI API Endpoints

You can configure the agent to use alternative OpenAI API endpoints:

1. **For self-hosted endpoints or proxies**
   ```ini
   LLM_PROVIDER=openai
   OPENAI_API_KEY=your_api_key_here
   OPENAI_URL=https://your-custom-endpoint.com/v1
   ```

2. **For regional OpenAI deployments**
   ```ini
   LLM_PROVIDER=openai
   OPENAI_API_KEY=your_api_key_here
   OPENAI_URL=https://your-region.api.openai.com/v1
   ```

This is especially useful for connecting to OpenAI-compatible services or when working behind corporate proxies.

### Dockerized Deployment

1. **Update environment variables in `.env`**
   ```ini
   # Memory Configuration
   MEMORY_TYPE=redis
   REDIS_URL=redis://redis:6379
   
   # MCP Configuration
   MCP_SERVER_URL=http://mcp-mock:9000/mcp
   
   # For Ollama in Docker, use:
   # OLLAMA_BASE_URL=http://host.docker.internal:11434  # For Windows/Mac
   # OLLAMA_BASE_URL=http://172.17.0.1:11434  # For Linux (Docker bridge network)
   ```

2. **Update your hosts file**
   
   For the default Traefik configuration to work correctly, you need to add an entry to your hosts file:
   
   - **Windows**: Edit `C:\Windows\System32\drivers\etc\hosts`
   - **macOS/Linux**: Edit `/etc/hosts`
   
   Add this line:
   ```
   127.0.0.1   agent.localhost
   ```
   
   This maps the domain `agent.localhost` to your local machine, enabling Traefik's domain-based routing.

3. **Build and run with Docker Compose**
   ```bash
   docker-compose up --build
   ```

4. **Access your services**
   - Agent: http://agent.localhost (if using the default Traefik config)
   - Traefik dashboard: http://localhost:8081
   - Redis Commander UI: http://localhost:8082

## Usage

### User API (`/api/invoke`)

The simplest way to interact with the agent directly:

- **POST** `/api/invoke`
- **Body**:
  ```json
  {
    "userPrompt": "Hello, who are you?",
    "conversationId": "optional-string"
  }
  ```
- **Response**:
  ```json
  {
    "reply": "<agent reply>",
    "conversationId": "...",
    "status": "complete"
  }
  ```

If an error occurs, the response will include an error message:
```json
{
  "error": "Error message description",
  "conversationId": "..."
}
```

### A2A Protocol Endpoints

For agent-to-agent communication:

#### Agent Card Discovery

- **GET** `/.well-known/agent.json`
- **Response**: Agent Card JSON object describing capabilities, skills, and endpoints

#### Task Messaging

- **POST** `/a2a/message` (implements the `tasks/send` endpoint)
- **Request Body**:
  ```json
  {
    "task": {
      "id": "unique-task-id",
      "message": {
        "role": "user",
        "parts": [
          { "type": "text", "content": "Your query here" }
        ]
      }
    }
  }
  ```
- **Response**: A valid A2A Task object with status and message
  ```json
  {
    "id": "unique-task-id",
    "status": {
      "state": "completed",
      "message": {
        "role": "assistant",
        "parts": [
          { "type": "text", "content": "Response from agent" }
        ]
      }
    }
  }
  ```

## LLM Provider Configuration

### OpenAI (Default)
```ini
LLM_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
MODEL=gpt-4o-mini
# Optional: Custom API endpoint
OPENAI_URL=https://api.openai.com/v1
```

### Ollama (Self-hosted)
```ini
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
MODEL=llama3  # Or any model you have in Ollama
```

### Anthropic Claude
```ini
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_api_key_here
MODEL=claude-3-opus-20240229
```

## Memory Configuration

### In-Memory (Default)
```ini
MEMORY_TYPE=memory
```

### Redis (Production)
```ini
MEMORY_TYPE=redis
REDIS_URL=redis://localhost:6379  # Local development
# or
REDIS_URL=redis://redis:6379  # Docker environment
```

## Key Components

- **server.ts**: Bootstraps the Express app, initializes the agent, tools, and defines processWithAgent logic.
- **mcp/client.ts**: Handles MCP client initialization using Streamable HTTP transport and protocol version 2024-11-05.
- **routes/a2a.ts**: Implements A2A protocol endpoints for discovery and task handling.
- **agent/memory.ts**: Manages chat history (in-memory or Redis-based persistence).
- **tools/AskAnotherAgentTool.ts**: Provides the agent with the ability to delegate tasks to other agents.
- **utils/logger.ts**: Enhanced logging utility with colored output and source information.
- **utils/requestLogger.ts**: HTTP request logging middleware with request IDs for tracing.
- **config/index.ts**: Centralizes configuration from environment variables with validation.

## Advanced Usage

### Customizing MCP Tool Discovery

The agent dynamically discovers tools from the connected MCP server. If your MCP server provides custom tools:

1. They will be automatically discovered via the `discoverMcpTools()` function in `mcp/tools.ts`
2. Tool metadata including schemas will be extracted and converted to LangChain tools
3. The agent will be able to use them immediately

If discovery fails, it will fall back to the static tool definitions in `staticMcpToolsList`.

### Adding Custom Agent Skills

To extend the agent's A2A capabilities:

1. Update the skills array in the agent card definition in `routes/a2a.ts`
2. Add custom handling logic in the `/a2a/message` route handler
3. Create specialized tools if needed in the `tools/` directory

### Logging Configuration

The enhanced logging system provides several features for better debugging and monitoring:

1. **Log Levels**: Control the verbosity of logs by setting the `LOG_LEVEL` environment variable:
   - `DEBUG`: All logs including detailed debug information
   - `INFO`: Information, warnings, errors, and fatal logs (default)
   - `WARN`: Only warnings, errors, and fatal logs
   - `ERROR`: Only errors and fatal logs
   - `FATAL`: Only fatal errors

2. **Colored Output**: Log levels are color-coded for better readability:
   - DEBUG: Cyan
   - INFO: Green
   - WARN: Yellow
   - ERROR: Red
   - FATAL: White on red background

3. **Source Information**: Each log message includes the source file and line number to quickly identify the origin of the log.

4. **Request Tracing**: All HTTP requests receive a unique UUID for tracing through logs:
   - Request IDs are added to response headers as `X-Request-ID`
   - Existing request IDs from upstream services are preserved
   - All logs related to a request include the request ID

5. **Debug Logging**: Set `LOG_LEVEL=DEBUG` for extensive logs during development:
   ```bash
   LOG_LEVEL=DEBUG npm run dev
   ```

Example log output format:
```
[2025-04-29T08:35:12.456Z] [INFO] [server.ts:123] Server started on port 3000
[2025-04-29T08:35:15.789Z] [INFO] [requestLogger.ts:42] [f47ac10b-58cc-4372-a567-0e02b2c3d479] GET /api/invoke from 127.0.0.1
```

### Redis Configuration Options

The Redis-based chat history comes with several configurable options:

1. **TTL**: By default, conversations expire after 24 hours, which can be customized in the `memory.ts` file
2. **Redis Commander**: Access the Redis Commander UI at http://localhost:8082 to inspect stored chat histories
3. **Fall-back Mechanism**: If Redis connection fails, the system automatically falls back to in-memory storage

### Production Considerations

For production deployments:

1. **Memory Storage**: Use Redis for persistent chat history across restarts
2. **Authentication**: Add authentication middleware for the API endpoints
3. **Rate Limiting**: Implement API rate limiting to prevent abuse
4. **Logging**: Set appropriate LOG_LEVEL (WARN or INFO for production)
5. **SSL**: Ensure all communication is done over HTTPS
6. **Custom OpenAI Endpoints**: Consider using regional or enterprise OpenAI endpoints for better performance
7. **Horizontal Scaling**: The system can be horizontally scaled with Redis as a shared memory store
8. **Health Checks**: Add health check endpoints for monitoring system status
9. **Ollama Integration**: For production Ollama setups, consider a dedicated Ollama server

## References

- **Model Context Protocol**:
  - [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  - Protocol Version: 2024-11-05
  - Transport: Streamable HTTP (recommended, replaces deprecated SSE transport)

- **Agent-to-Agent (A2A) Protocol**:
  - [A2A Protocol Documentation](https://google.github.io/A2A/#/documentation)
  - Implements: Agent Card, tasks/send endpoint
  - Current Version: v1.0

- **LangChain**:
  - [LangChain JS Documentation](https://js.langchain.com/)
  - Uses: Agent framework, OpenAI functions architecture, structured tools

- **OpenAI API**:
  - [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
  - Models: gpt-4o, gpt-4o-mini, gpt-4, gpt-3.5-turbo

- **Ollama**:
  - [Ollama Documentation](https://github.com/ollama/ollama)
  - Local LLM deployment and management

- **Anthropic Claude API**:
  - [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
  - Models: claude-3-opus, claude-3-sonnet, claude-3-haiku

- **Redis**:
  - [Redis Documentation](https://redis.io/documentation)
  - [LangChain Redis Integration](https://js.langchain.com/docs/integrations/chat_memory/redis)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
