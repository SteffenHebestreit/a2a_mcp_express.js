# Code Structure Documentation

This document provides an overview of the source code structure of the LangChain MCP & A2A Agent, explaining what each file does and how it's used in the system.

## Related Documentation

- **[README.md](./README.md)** - Technical documentation with setup instructions and configuration details
- **[OVERVIEW.md](./OVERVIEW.md)** - A simplified guide explaining the system in non-technical terms

## Core Files

### `src/server.ts`

**Purpose**: Main application entry point that bootstraps the entire system.

**What it does**:
- Initializes the Express server and its middleware
- Sets up routes for API and A2A endpoints
- Creates the LangChain agent instance with tools
- Defines core `processWithAgent` function that handles all requests
- Manages error handling and response formatting

**Used by**: The Node.js runtime as the application starting point.

## Configuration System

### `src/config/loader.ts`

**Purpose**: Handles loading, merging, and validating configuration from multiple sources.

**What it does**:
- Defines the main `AgentConfig` interface used throughout the application
- Loads configuration from YAML files (agent-config.yml)
- Applies environment variables on top of file-based configuration
- Processes template variables in the system prompt (replacing `{name}`, `{description}`, `{baseUrl}`)
- Validates the configuration and logs warnings for potential issues

**Used by**: `src/config/index.ts` to create and export the unified configuration.

### `src/config/index.ts`

**Purpose**: Provides a centralized configuration object for the entire application.

**What it does**:
- Imports and re-exports the configuration from `loader.ts`
- Serves as the single point of access for configuration

**Used by**: All modules needing access to configuration settings.

## Agent Implementation

### `src/agent/agent.ts`

**Purpose**: Creates and configures the LangChain agent that powers the system.

**What it does**:
- Initializes the OpenAI or Ollama client based on configuration
- Creates the LangChain agent with appropriate tools and memory
- Configures the agent for function calling and structured outputs
- Handles agent initialization errors and fallbacks

**Used by**: `server.ts` to create the agent instance.

### `src/agent/memory.ts`

**Purpose**: Manages conversation history and memory persistence.

**What it does**:
- Implements both in-memory and Redis-based chat history storage
- Handles automatic fallback if Redis is unavailable
- Manages conversation TTL (time-to-live) for automatic cleanup
- Provides functions to get and clear memory for conversations

**Used by**: `agent.ts` to provide memory capabilities to the LangChain agent.

## MCP (Model Context Protocol) Implementation

### `src/mcp/client.ts`

**Purpose**: Manages the connection to MCP servers and provides MCP capabilities.

**What it does**:
- Initializes the MCP client with the Streamable HTTP transport
- Handles connecting to MCP servers and error handling
- Provides functions to call MCP tools, get resources, and read prompts
- Implements direct RPC calls for tool discovery and metadata retrieval

**Used by**: `mcp/tools.ts` to create LangChain tools from MCP capabilities.

### `src/mcp/tools.ts`

**Purpose**: Converts MCP capabilities into LangChain tools the agent can use.

**What it does**:
- Discovers available tools from connected MCP servers
- Converts MCP tool schemas to Zod schemas for LangChain
- Creates LangChain-compatible tools from MCP tool definitions
- Falls back to static tool definitions if discovery fails

**Used by**: `server.ts` when creating the agent with tools.

## Route Handlers

### `src/routes/api.ts`

**Purpose**: Handles user-facing API endpoints.

**What it does**:
- Implements the `/api/invoke` endpoint for user interactions
- Validates incoming requests and formats responses
- Manages conversation IDs and request tracking
- Calls `processWithAgent` to handle user prompts

**Used by**: `server.ts` as an Express router for API requests.

### `src/routes/a2a.ts`

**Purpose**: Implements the Agent-to-Agent protocol endpoints.

**What it does**:
- Serves the agent card at `/.well-known/agent.json` (A2A discovery)
- Handles incoming A2A tasks via the `/a2a/message` endpoint
- Processes A2A messages through the LangChain agent
- Formats responses according to A2A protocol standards

**Used by**: `server.ts` as an Express router for A2A protocol compliance.

## Custom Tools

### `src/tools/AskAnotherAgentTool.ts`

**Purpose**: Enables the agent to communicate with other A2A-compliant agents.

**What it does**:
- Creates a LangChain tool that implements the A2A client protocol
- Discovers target agent capabilities via agent card
- Sends task requests to other agents and processes responses
- Handles error conditions and retries

**Used by**: `server.ts` when initializing the agent with its toolset.

## Type Definitions

### `src/types/a2aTypes.ts`

**Purpose**: Defines TypeScript interfaces for the A2A protocol.

**What it does**:
- Defines types for A2A Tasks, Messages, Agent Cards, etc.
- Ensures type safety when working with A2A protocol objects
- Documents the structure of A2A protocol messages

**Used by**: `routes/a2a.ts` and `tools/AskAnotherAgentTool.ts` for type safety.

## Utilities

### `src/utils/logger.ts`

**Purpose**: Provides enhanced logging capabilities.

**What it does**:
- Implements color-coded console logging based on log levels
- Includes source file and line information in logs
- Supports log level filtering (DEBUG, INFO, WARN, ERROR, FATAL)
- Formats log messages consistently

**Used by**: All modules throughout the application.

### `src/utils/requestLogger.ts`

**Purpose**: Handles HTTP request logging and request ID management.

**What it does**:
- Generates and tracks request IDs for tracing
- Logs incoming HTTP requests with details
- Adds request IDs to response headers
- Preserves upstream request IDs for tracing through services

**Used by**: `server.ts` as Express middleware for request tracking.

## Mock MCP Server

### `mcp-mock-server/src/server.ts`

**Purpose**: Provides a simple MCP server for development and testing.

**What it does**:
- Implements a lightweight MCP-compatible server
- Provides mock tools (calculator, weather, etc.)
- Handles MCP JSON-RPC protocol requests
- Serves for development when a real MCP server is unavailable

**Used by**: Developers during local development and testing.

## Configuration Files

### `agent-config.yml`

**Purpose**: Provides the main configuration for the agent.

**What it does**:
- Defines server settings and agent identity
- Configures LLM providers and models
- Sets up MCP connection details and tools
- Configures the agent's system prompt with template variables
- Defines A2A skills and capabilities
- Sets memory and logging options

**Used by**: The configuration system (`src/config/loader.ts`) at application startup.

### `docker-compose.yml`

**Purpose**: Defines the multi-container Docker environment.

**What it does**:
- Configures the main agent application container
- Sets up Traefik reverse proxy for hostname-based routing
- Includes mock MCP server for development
- Configures Redis for persistent memory
- Sets up Redis Commander UI for monitoring

**Used by**: Docker Compose when running the containerized application.

### `Dockerfile`

**Purpose**: Defines how to build the agent application container.

**What it does**:
- Creates a multi-stage build for optimized container size
- Installs dependencies and builds the TypeScript code
- Sets up the production runtime environment
- Exposes the application port

**Used by**: Docker when building the container image.

## Conclusion

The codebase follows a modular architecture with clear separation of concerns:
- Server and request handling
- Agent creation and orchestration
- MCP client and tool integration
- A2A protocol compliance
- Memory management
- Configuration system

Each file has a specific purpose and fits within this architecture. When making changes, be mindful of these responsibilities to maintain clean code structure.