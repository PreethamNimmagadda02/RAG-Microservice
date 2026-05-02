/**
 * OpenAPI 3.0 specification for the Beem RAG Microservice.
 *
 * Serves interactive Swagger UI at /docs for API exploration and testing.
 */

const healthPath = {
  get: {
    summary: "Health Check",
    description:
      "Returns service health status and vector store document count. Useful for monitoring and readiness probes.",
    tags: ["System"],
    responses: {
      "200": {
        description: "Service is healthy",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/HealthResponse",
            },
            example: {
              status: "ok",
              document_count: 20,
              uptime_seconds: 142,
            },
          },
        },
      },
    },
  },
};

const ingestPath = {
  post: {
    summary: "Ingest FAQ Data",
    description:
      "Reads the FAQ JSON from data/beem_faqs.json, chunks each item (Q+A combined), generates embeddings via DeepInfra API (BAAI/bge-large-en-v1.5, 1024-dim), and stores them in the in-memory vector store. This endpoint is idempotent — calling it multiple times will not duplicate entries.",
    tags: ["RAG Pipeline"],
    responses: {
      "200": {
        description: "FAQ data successfully ingested",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/IngestResponse",
            },
            example: {
              message: "Successfully ingested 20 FAQ documents",
              document_count: 20,
              latency_ms: 1523,
            },
          },
        },
      },
      "429": {
        description: "Rate limit exceeded (default: 5 requests/minute)",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
      "500": {
        description: "Ingestion failed",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },
  },
};

const queryPath = {
  post: {
    summary: "Query the Knowledge Base",
    description:
      "Accepts a user question, retrieves the top-k most relevant FAQ chunks via cosine similarity, passes them as context to DeepInfra API (Meta-Llama-3-8B-Instruct), and returns a grounded response with source attribution. Supports optional category filtering for targeted retrieval.",
    tags: ["RAG Pipeline"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/QueryRequest",
          },
          examples: {
            basic: {
              summary: "Basic question",
              value: {
                question: "How do I get a cash advance with Beem?",
                top_k: 3,
              },
            },
            with_category: {
              summary: "Question with category filter",
              value: {
                question: "How is my data protected?",
                top_k: 3,
                category: "security",
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Grounded answer generated successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/QueryResponse",
            },
            example: {
              answer:
                "To get a cash advance with Beem, you can use the Everdraft feature. Once your direct deposit is set up, Beem analyzes your deposit history to determine your advance limit — up to $500 per pay cycle. Funds typically arrive in your Beem account within seconds. There are no interest charges, no credit check required, and repayment is automatic when your next paycheck deposits.",
              sources: ["FAQ-001", "FAQ-002", "FAQ-004"],
              scores: [0.872, 0.741, 0.698],
              latency_ms: 342,
            },
          },
        },
      },
      "400": {
        description:
          "Invalid request (empty question, invalid top_k/category) or empty vector store",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
      "429": {
        description: "Rate limit exceeded (default: 20 requests/minute)",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
      "500": {
        description: "Query processing failed",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },
  },
};

const components = {
  schemas: {
    QueryRequest: {
      type: "object",
      required: ["question"],
      properties: {
        question: {
          type: "string",
          description: "The user's question about Beem products/services",
          example: "How do I get a cash advance with Beem?",
        },
        top_k: {
          type: "integer",
          description:
            "Number of relevant FAQ chunks to retrieve (default: 3)",
          default: 3,
          minimum: 1,
          maximum: 20,
        },
        category: {
          type: "string",
          description:
            "Optional category filter for targeted retrieval",
          enum: [
            "everdraft",
            "direct_deposit",
            "credit_building",
            "cashback",
            "account_management",
            "security",
            "eligibility",
          ],
        },
      },
    },
    QueryResponse: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description: "The LLM-generated answer grounded in FAQ context",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "FAQ IDs used as context for the answer",
        },
        scores: {
          type: "array",
          items: { type: "number" },
          description:
            "Cosine similarity score (0–1) for each source, in the same order as `sources`. Higher = more relevant.",
        },
        latency_ms: {
          type: "integer",
          description:
            "Wall-clock time in milliseconds for the full pipeline (embed → search → generate)",
        },
      },
    },
    IngestResponse: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Human-readable status message",
        },
        document_count: {
          type: "integer",
          description: "Total documents in the vector store after ingestion",
        },
        latency_ms: {
          type: "integer",
          description: "Wall-clock time in milliseconds for the ingestion",
        },
      },
    },
    HealthResponse: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["ok", "error"],
        },
        document_count: {
          type: "integer",
          description: "Number of documents currently in the vector store",
        },
        uptime_seconds: {
          type: "integer",
          description: "Server uptime in seconds",
        },
      },
    },
    ErrorResponse: {
      type: "object",
      properties: {
        error: {
          type: "string",
          description: "Error message",
        },
        details: {
          type: "string",
          description: "Additional error details",
        },
        latency_ms: {
          type: "integer",
          description: "Time elapsed before the error occurred",
        },
      },
    },
  },
};

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Beem RAG Microservice",
    description:
      "A production-aware Retrieval-Augmented Generation (RAG) microservice for Beem's FAQ knowledge base. Both embeddings (BAAI/bge-large-en-v1.5) and answer generation (Meta-Llama-3-8B-Instruct) are powered by the DeepInfra API for state-of-the-art accuracy.",
    version: "1.0.0",
    contact: {
      name: "Beem Engineering",
    },
  },
  servers: [
    {
      url: "http://localhost:{port}",
      description: "Local development server",
      variables: {
        port: {
          default: "3000",
        },
      },
    },
  ],
  paths: {
    "/health": healthPath,
    "/ingest": ingestPath,
    "/query": queryPath,
  },
  components,
  tags: [
    {
      name: "RAG Pipeline",
      description: "Ingestion and query endpoints for the RAG system",
    },
    {
      name: "System",
      description: "Health check and system monitoring",
    },
  ],
};
