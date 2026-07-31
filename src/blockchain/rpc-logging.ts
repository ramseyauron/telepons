type RpcContextValue = string | number | boolean | null | undefined;

function redactEndpoint(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/https?:\/\/[^\s)]+/g, (candidate) => {
    try {
      return `${new URL(candidate).origin}/[redacted]`;
    } catch {
      return "[redacted-rpc-url]";
    }
  });
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };

  const rpcError = error as Error & {
    code?: unknown;
    status?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
  };
  return {
    name: error.name,
    message: redactEndpoint(error.message),
    shortMessage: redactEndpoint(rpcError.shortMessage),
    details: redactEndpoint(rpcError.details),
    code: rpcError.code,
    status: rpcError.status,
    cause:
      rpcError.cause instanceof Error
        ? {
            name: rpcError.cause.name,
            message: redactEndpoint(rpcError.cause.message),
          }
        : rpcError.cause,
  };
}

export async function loggedRpcCall<T>(input: {
  operation: string;
  context?: Record<string, RpcContextValue>;
  call: () => Promise<T>;
  isExpected?: (value: T) => boolean;
}): Promise<T> {
  try {
    const value = await input.call();
    if (input.isExpected && !input.isExpected(value)) {
      console.error("RPC_UNEXPECTED_RESPONSE", {
        operation: input.operation,
        ...input.context,
      });
      throw new Error(`Unexpected RPC response for ${input.operation}`);
    }
    return value;
  } catch (error) {
    console.error("RPC_CALL_FAILED", {
      operation: input.operation,
      ...input.context,
      error: errorDetails(error),
    });
    throw error;
  }
}
