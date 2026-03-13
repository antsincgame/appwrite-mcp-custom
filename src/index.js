#!/usr/bin/env node
/**
 * Appwrite Admin MCP Server
 * Console-level access via raw REST API
 * Create projects, databases, collections, users, keys — everything
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ─── Config ───────────────────────────────────────────────
const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://appwrite.vibecoding.by/v1";
const EMAIL = process.env.APPWRITE_EMAIL;
const PASSWORD = process.env.APPWRITE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  process.stderr.write("ERROR: APPWRITE_EMAIL and APPWRITE_PASSWORD required\n");
  process.exit(1);
}

// ─── Session management ──────────────────────────────────
let sessionCookie = null;

async function appwriteFetch(path, opts = {}) {
  const url = `${ENDPOINT}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Appwrite-Project": opts.projectId || "console",
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    ...(opts.headers || {}),
  };

  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  // Capture session cookies
  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    const cookies = setCookie
      .map((c) => c.split(";")[0])
      .filter((c) => c.includes("a_session_"));
    if (cookies.length) sessionCookie = cookies.join("; ");
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

async function ensureAuth() {
  if (sessionCookie) {
    try {
      await appwriteFetch("/account");
      return;
    } catch { sessionCookie = null; }
  }
  await appwriteFetch("/account/sessions/email", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  process.stderr.write("✓ Authenticated with Appwrite Console\n");
}

// ─── Tool definitions ─────────────────────────────────────
const TOOLS = [
  // ── Projects ──
  { name: "list_projects", description: "List all Appwrite projects", inputSchema: { type: "object", properties: {} } },
  { name: "create_project", description: "Create a new project", inputSchema: {
    type: "object", required: ["projectId", "name", "teamId"],
    properties: {
      projectId: { type: "string" }, name: { type: "string" },
      teamId: { type: "string", description: "Team ID" },
      region: { type: "string", description: "default" },
    },
  }},
  { name: "get_project", description: "Get project details", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" } } } },
  { name: "delete_project", description: "Delete a project", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" } } } },

  // ── API Keys ──
  { name: "list_keys", description: "List API keys for a project", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" } } } },
  { name: "create_key", description: "Create API key with scopes", inputSchema: {
    type: "object", required: ["projectId", "name", "scopes"],
    properties: { projectId: { type: "string" }, name: { type: "string" }, scopes: { type: "array", items: { type: "string" } } },
  }},
  { name: "delete_key", description: "Delete an API key", inputSchema: { type: "object", required: ["projectId", "keyId"], properties: { projectId: { type: "string" }, keyId: { type: "string" } } } },

  // ── Platforms ──
  { name: "list_platforms", description: "List platforms for a project", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" } } } },
  { name: "create_platform", description: "Add web/mobile platform", inputSchema: {
    type: "object", required: ["projectId", "type", "name"],
    properties: { projectId: { type: "string" }, type: { type: "string" }, name: { type: "string" }, hostname: { type: "string" } },
  }},

  // ── Databases ──
  { name: "list_databases", description: "List databases in a project", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" } } } },
  { name: "create_database", description: "Create database", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "name"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, name: { type: "string" } },
  }},
  { name: "delete_database", description: "Delete database", inputSchema: { type: "object", required: ["projectId", "databaseId"], properties: { projectId: { type: "string" }, databaseId: { type: "string" } } } },

  // ── Collections ──
  { name: "list_collections", description: "List collections in database", inputSchema: { type: "object", required: ["projectId", "databaseId"], properties: { projectId: { type: "string" }, databaseId: { type: "string" } } } },
  { name: "create_collection", description: "Create collection", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "name"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, name: { type: "string" }, permissions: { type: "array", items: { type: "string" } } },
  }},
  { name: "delete_collection", description: "Delete collection", inputSchema: { type: "object", required: ["projectId", "databaseId", "collectionId"], properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" } } } },

  // ── Attributes ──
  { name: "list_attributes", description: "List attributes in collection", inputSchema: { type: "object", required: ["projectId", "databaseId", "collectionId"], properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" } } } },
  { name: "create_string_attribute", description: "Create string attribute", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "key", "size", "required"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" }, size: { type: "number" }, required: { type: "boolean" }, default: { type: "string" } },
  }},
  { name: "create_integer_attribute", description: "Create integer attribute", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "key", "required"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" }, required: { type: "boolean" }, min: { type: "number" }, max: { type: "number" } },
  }},
  { name: "create_boolean_attribute", description: "Create boolean attribute", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "key", "required"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" }, required: { type: "boolean" } },
  }},
  { name: "create_email_attribute", description: "Create email attribute", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "key", "required"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" }, required: { type: "boolean" } },
  }},
  { name: "create_datetime_attribute", description: "Create datetime attribute", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "key", "required"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" }, required: { type: "boolean" } },
  }},
  { name: "delete_attribute", description: "Delete attribute", inputSchema: { type: "object", required: ["projectId", "databaseId", "collectionId", "key"], properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" } } } },

  // ── Indexes ──
  { name: "create_index", description: "Create index on collection", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "key", "type", "attributes"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, key: { type: "string" }, type: { type: "string" }, attributes: { type: "array", items: { type: "string" } }, orders: { type: "array", items: { type: "string" } } },
  }},

  // ── Documents ──
  { name: "list_documents", description: "List documents in collection", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, limit: { type: "number" } },
  }},
  { name: "create_document", description: "Create document", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "documentId", "data"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, documentId: { type: "string" }, data: { type: "object" }, permissions: { type: "array", items: { type: "string" } } },
  }},
  { name: "get_document", description: "Get document by ID", inputSchema: { type: "object", required: ["projectId", "databaseId", "collectionId", "documentId"], properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, documentId: { type: "string" } } } },
  { name: "update_document", description: "Update document", inputSchema: {
    type: "object", required: ["projectId", "databaseId", "collectionId", "documentId", "data"],
    properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, documentId: { type: "string" }, data: { type: "object" } },
  }},
  { name: "delete_document", description: "Delete document", inputSchema: { type: "object", required: ["projectId", "databaseId", "collectionId", "documentId"], properties: { projectId: { type: "string" }, databaseId: { type: "string" }, collectionId: { type: "string" }, documentId: { type: "string" } } } },

  // ── Users ──
  { name: "list_users", description: "List users in project", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" }, search: { type: "string" } } } },
  { name: "create_user", description: "Create user", inputSchema: {
    type: "object", required: ["projectId", "userId", "email", "password"],
    properties: { projectId: { type: "string" }, userId: { type: "string" }, email: { type: "string" }, password: { type: "string" }, name: { type: "string" } },
  }},
  { name: "delete_user", description: "Delete user", inputSchema: { type: "object", required: ["projectId", "userId"], properties: { projectId: { type: "string" }, userId: { type: "string" } } } },

  // ── Storage ──
  { name: "list_buckets", description: "List storage buckets", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" } } } },
  { name: "create_bucket", description: "Create storage bucket", inputSchema: {
    type: "object", required: ["projectId", "bucketId", "name"],
    properties: { projectId: { type: "string" }, bucketId: { type: "string" }, name: { type: "string" }, permissions: { type: "array", items: { type: "string" } }, maximumFileSize: { type: "number" }, allowedFileExtensions: { type: "array", items: { type: "string" } } },
  }},
  { name: "delete_bucket", description: "Delete bucket", inputSchema: { type: "object", required: ["projectId", "bucketId"], properties: { projectId: { type: "string" }, bucketId: { type: "string" } } } },
];

// ─── Tool handler ─────────────────────────────────────────
function uid() { return Date.now().toString(16) + Math.random().toString(16).slice(2, 10); }

async function handleTool(name, a) {
  await ensureAuth();

  // Console-level (no project context)
  const C = (path, opts) => appwriteFetch(path, opts);
  // Project-scoped
  const P = (pid, path, opts) => appwriteFetch(path, { ...opts, projectId: pid });

  switch (name) {
    // Projects
    case "list_projects": return C("/projects");
    case "create_project": return C("/projects", { method: "POST", body: { projectId: a.projectId, name: a.name, teamId: a.teamId, region: a.region || "default" } });
    case "get_project": return C(`/projects/${a.projectId}`);
    case "delete_project": return C(`/projects/${a.projectId}`, { method: "DELETE" });

    // Keys
    case "list_keys": return C(`/projects/${a.projectId}/keys`);
    case "create_key": return C(`/projects/${a.projectId}/keys`, { method: "POST", body: { name: a.name, scopes: a.scopes } });
    case "delete_key": return C(`/projects/${a.projectId}/keys/${a.keyId}`, { method: "DELETE" });

    // Platforms
    case "list_platforms": return C(`/projects/${a.projectId}/platforms`);
    case "create_platform": return C(`/projects/${a.projectId}/platforms`, { method: "POST", body: { type: a.type, name: a.name, hostname: a.hostname } });

    // Databases
    case "list_databases": return P(a.projectId, "/databases");
    case "create_database": return P(a.projectId, "/databases", { method: "POST", body: { databaseId: a.databaseId === "unique()" ? uid() : a.databaseId, name: a.name } });
    case "delete_database": return P(a.projectId, `/databases/${a.databaseId}`, { method: "DELETE" });

    // Collections
    case "list_collections": return P(a.projectId, `/databases/${a.databaseId}/collections`);
    case "create_collection": return P(a.projectId, `/databases/${a.databaseId}/collections`, { method: "POST", body: { collectionId: a.collectionId === "unique()" ? uid() : a.collectionId, name: a.name, permissions: a.permissions } });
    case "delete_collection": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}`, { method: "DELETE" });

    // Attributes
    case "list_attributes": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes`);
    case "create_string_attribute": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes/string`, { method: "POST", body: { key: a.key, size: a.size, required: a.required, default: a.default || null } });
    case "create_integer_attribute": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes/integer`, { method: "POST", body: { key: a.key, required: a.required, min: a.min, max: a.max } });
    case "create_boolean_attribute": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes/boolean`, { method: "POST", body: { key: a.key, required: a.required } });
    case "create_email_attribute": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes/email`, { method: "POST", body: { key: a.key, required: a.required } });
    case "create_datetime_attribute": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes/datetime`, { method: "POST", body: { key: a.key, required: a.required } });
    case "delete_attribute": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/attributes/${a.key}`, { method: "DELETE" });

    // Indexes
    case "create_index": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/indexes`, { method: "POST", body: { key: a.key, type: a.type, attributes: a.attributes, orders: a.orders } });

    // Documents
    case "list_documents": {
      const q = a.limit ? `?queries[]=${encodeURIComponent(JSON.stringify({ method: "limit", values: [a.limit] }))}` : "";
      return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/documents${q}`);
    }
    case "create_document": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/documents`, { method: "POST", body: { documentId: a.documentId === "unique()" ? uid() : a.documentId, data: a.data, permissions: a.permissions } });
    case "get_document": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/documents/${a.documentId}`);
    case "update_document": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/documents/${a.documentId}`, { method: "PATCH", body: { data: a.data } });
    case "delete_document": return P(a.projectId, `/databases/${a.databaseId}/collections/${a.collectionId}/documents/${a.documentId}`, { method: "DELETE" });

    // Users
    case "list_users": {
      const q = a.search ? `?search=${encodeURIComponent(a.search)}` : "";
      return P(a.projectId, `/users${q}`);
    }
    case "create_user": return P(a.projectId, "/users", { method: "POST", body: { userId: a.userId === "unique()" ? uid() : a.userId, email: a.email, password: a.password, name: a.name } });
    case "delete_user": return P(a.projectId, `/users/${a.userId}`, { method: "DELETE" });

    // Storage
    case "list_buckets": return P(a.projectId, "/storage/buckets");
    case "create_bucket": return P(a.projectId, "/storage/buckets", { method: "POST", body: { bucketId: a.bucketId === "unique()" ? uid() : a.bucketId, name: a.name, permissions: a.permissions, maximumFileSize: a.maximumFileSize, allowedFileExtensions: a.allowedFileExtensions } });
    case "delete_bucket": return P(a.projectId, `/storage/buckets/${a.bucketId}`, { method: "DELETE" });

    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Server ───────────────────────────────────────────
const server = new Server(
  { name: "appwrite-mcp-admin", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler({ method: "tools/list" }, async () => ({ tools: TOOLS }));

server.setRequestHandler({ method: "tools/call" }, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
